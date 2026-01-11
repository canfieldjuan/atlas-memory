/**
 * Traversal Service
 * Multi-hop graph traversal for relationship chain queries
 */

import { log } from '@/lib/utils/logger';

// ============================================================================
// Configuration
// ============================================================================

const getEnvString = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

// ============================================================================
// Types
// ============================================================================

export interface TraversalOptions {
  startEntityName: string;
  relationTypes?: string[];
  maxHops: number;
  direction: 'outgoing' | 'incoming' | 'both';
  groupId: string;
}

export interface GraphPathNode {
  name: string;
  uuid: string;
  labels?: string[];
}

export interface GraphPathRelation {
  type: string;
  fact: string;
  uuid?: string;
}

export interface GraphPathStep {
  entity: GraphPathNode;
  relation?: GraphPathRelation;
}

export interface GraphPath {
  path: GraphPathStep[];
  length: number;
}

export interface TraversalResult {
  paths: GraphPath[];
  queryTimeMs: number;
}

export interface ShortestPathOptions {
  startEntity: string;
  endEntity: string;
  groupId: string;
  maxHops?: number;
}

export interface ShortestPathResult {
  path: GraphPath | null;
  found: boolean;
  queryTimeMs: number;
}

// ============================================================================
// Traversal Service Class
// ============================================================================

export class TraversalService {
  private baseUrl: string;
  private defaultMaxHops: number;
  private timeoutMs: number;

  constructor() {
    this.baseUrl = getEnvString('GRAPHITI_API_URL', 'http://localhost:8001');
    this.defaultMaxHops = getEnvNumber('GRAPHRAG_TRAVERSAL_MAX_HOPS', 3);
    this.timeoutMs = getEnvNumber('GRAPHRAG_TRAVERSAL_TIMEOUT_MS', 10000);
  }

  /**
   * Traverse graph from starting entity following specified relation types
   */
  async traverseGraph(options: TraversalOptions): Promise<TraversalResult> {
    const startTime = Date.now();

    try {
      const maxHops = Math.min(options.maxHops, this.defaultMaxHops);

      const response = await fetch(`${this.baseUrl}/traverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_entity_name: options.startEntityName,
          relation_types: options.relationTypes || [],
          max_hops: maxHops,
          direction: options.direction,
          group_id: options.groupId,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Traversal API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      log.debug('GraphRAG', 'Traversal completed', {
        startEntity: options.startEntityName,
        pathsFound: result.paths?.length || 0,
        queryTimeMs: Date.now() - startTime,
      });

      return {
        paths: this.mapApiPaths(result.paths || []),
        queryTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      log.error('GraphRAG', 'Traversal failed', { error, options });
      throw error;
    }
  }

  /**
   * Find shortest path between two entities
   */
  async findShortestPath(options: ShortestPathOptions): Promise<ShortestPathResult> {
    const startTime = Date.now();

    try {
      const maxHops = Math.min(options.maxHops || 5, this.defaultMaxHops + 2);

      const response = await fetch(`${this.baseUrl}/shortest-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_entity: options.startEntity,
          end_entity: options.endEntity,
          group_id: options.groupId,
          max_hops: maxHops,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {
            path: null,
            found: false,
            queryTimeMs: Date.now() - startTime,
          };
        }
        const errorText = await response.text();
        throw new Error(`Shortest path API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      log.debug('GraphRAG', 'Shortest path found', {
        start: options.startEntity,
        end: options.endEntity,
        pathLength: result.path?.length || 0,
        queryTimeMs: Date.now() - startTime,
      });

      return {
        path: result.path ? this.mapApiPath(result.path) : null,
        found: result.path !== null,
        queryTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      log.error('GraphRAG', 'Shortest path query failed', { error, options });
      throw error;
    }
  }

  /**
   * Map API paths to internal format
   */
  private mapApiPaths(apiPaths: any[]): GraphPath[] {
    return apiPaths.map(p => this.mapApiPath(p));
  }

  /**
   * Map single API path to internal format
   */
  private mapApiPath(apiPath: any): GraphPath {
    const steps: GraphPathStep[] = [];

    if (Array.isArray(apiPath.steps)) {
      for (const step of apiPath.steps) {
        steps.push({
          entity: {
            name: step.entity?.name || '',
            uuid: step.entity?.uuid || '',
            labels: step.entity?.labels,
          },
          relation: step.relation ? {
            type: step.relation.type || '',
            fact: step.relation.fact || '',
            uuid: step.relation.uuid,
          } : undefined,
        });
      }
    }

    return {
      path: steps,
      length: steps.length > 0 ? steps.length - 1 : 0,
    };
  }

  /**
   * Format traversal results as context string
   */
  formatAsContext(result: TraversalResult): string {
    if (result.paths.length === 0) {
      return '';
    }

    const pathStrings = result.paths.map((p, idx) => {
      const pathParts = p.path.map((step, stepIdx) => {
        if (stepIdx === 0) {
          return step.entity.name;
        }
        const rel = step.relation;
        return `--[${rel?.type || 'related'}]--> ${step.entity.name}`;
      });
      return `Path ${idx + 1}: ${pathParts.join(' ')}`;
    });

    return `Graph relationships:\n${pathStrings.join('\n')}`;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const traversalService = new TraversalService();
