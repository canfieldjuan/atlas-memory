/**
 * Graphiti HTTP Client
 * Communicates with Graphiti REST API service
 */

// ============================================================================
// Types
// ============================================================================

export interface GraphitiConfig {
  baseUrl: string;
  timeout: number;
}

export interface EmbedderConfig {
  provider: 'openai' | 'runpod';
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export interface GraphitiEpisode {
  name: string;
  episode_body: string;
  source_description: string;
  reference_time: string; // ISO 8601
  group_id: string;
}

export interface GraphitiEpisodeWithSchema extends GraphitiEpisode {
  use_schema?: boolean;
  schema_name?: 'ai_models';
}

export interface GraphitiEpisodeResponse {
  episode_id: string;
  entities_created: number;
  relations_created: number;
}

export interface GraphitiBulkEpisodeRequest {
  episodes: GraphitiEpisode[];
  group_id: string;
  is_historical?: boolean;
  data_source_type?: string;
}

export interface GraphitiBulkEpisodeResponse {
  total_episodes: number;
  processed_episodes: number;
  episode_ids: string[];
  total_entities: number;
  total_relations: number;
}

export interface GraphitiSearchParams {
  query: string;
  group_ids: string[];
  num_results?: number;
  // Temporal filters
  is_historical?: boolean;
  data_source_type?: string;
  date_from?: string; // ISO 8601
  date_to?: string; // ISO 8601
}

export interface GraphitiSearchResult {
  edges: Array<{
    uuid: string;
    name: string;
    fact: string;
    source_node?: { name: string; uuid: string };
    target_node?: { name: string; uuid: string };
    source_description?: string;
    score?: number;
    created_at: string;
    expired_at?: string;
  }>;
  nodes?: Array<{
    uuid: string;
    name: string;
    labels: string[];
    summary: string;
    created_at: string;
  }>;
}

export interface GraphitiHealthResponse {
  status: string;
  version?: string;
}

// ============================================================================
// Graphiti Client
// ============================================================================

export class GraphitiClient {
  private baseUrl: string;
  private timeout: number;
  private embedderConfig?: EmbedderConfig;

  constructor(config?: Partial<GraphitiConfig>) {
    this.baseUrl = config?.baseUrl || process.env.GRAPHITI_API_URL || 'http://localhost:8001';
    // Use 5 minutes for document processing (embedding + entity extraction can be slow)
    // 60 minutes default for large document processing (1848 Q&As can take a while)
    const defaultTimeout = parseInt(process.env.GRAPHITI_TIMEOUT || '3600000', 10);
    this.timeout = config?.timeout || defaultTimeout;

    console.log('[GraphitiClient] ===== CLIENT INITIALIZED =====');
    console.log('[GraphitiClient] Base URL:', this.baseUrl);
    console.log('[GraphitiClient] Config Base URL:', config?.baseUrl || 'not provided');
    console.log('[GraphitiClient] GRAPHITI_API_URL:', process.env.GRAPHITI_API_URL || 'not set');
    console.log('[GraphitiClient] Timeout:', this.timeout);
    console.log('[GraphitiClient] NODE_ENV:', process.env.NODE_ENV);
  }

  /**
   * Set embedder configuration for subsequent requests
   */
  setEmbedderConfig(config: EmbedderConfig | undefined): void {
    this.embedderConfig = config;
    console.log('[GraphitiClient] Embedder config set:', config ? {
      provider: config.provider,
      baseUrl: config.baseUrl?.substring(0, 50),
      model: config.model,
    } : 'undefined');
  }

  /**
   * Get current embedder configuration
   */
  getEmbedderConfig(): EmbedderConfig | undefined {
    return this.embedderConfig;
  }

  /**
   * Build headers including embedder config if set
   */
  private buildHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    };

    if (this.embedderConfig) {
      headers['X-Embedder-Provider'] = this.embedderConfig.provider;
      if (this.embedderConfig.baseUrl) {
        headers['X-Embedder-Base-Url'] = this.embedderConfig.baseUrl;
      }
      if (this.embedderConfig.model) {
        headers['X-Embedder-Model'] = this.embedderConfig.model;
      }
      if (this.embedderConfig.apiKey) {
        headers['X-Embedder-Api-Key'] = this.embedderConfig.apiKey;
      }
    }

    return headers;
  }

  /**
   * Make HTTP request to Graphiti API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    console.log(`[GraphitiClient] ===== HTTP REQUEST =====`);
    console.log(`[GraphitiClient] URL: ${url}`);
    console.log(`[GraphitiClient] Base URL: ${this.baseUrl}`);
    console.log(`[GraphitiClient] Endpoint: ${endpoint}`);
    console.log(`[GraphitiClient] Method: ${options.method || 'GET'}`);
    console.log(`[GraphitiClient] Timeout: ${this.timeout}ms`);
    console.log(`[GraphitiClient] Has Body: ${!!options.body}`);
    if (options.body && typeof options.body === 'string') {
      const bodyPreview = options.body.length > 500 ? options.body.substring(0, 500) + '...' : options.body;
      console.log(`[GraphitiClient] Body Preview: ${bodyPreview}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const startTime = Date.now();

    try {
      console.log(`[GraphitiClient] Sending request to ${url}...`);

      const response = await fetch(url, {
        ...options,
        headers: this.buildHeaders(options.headers as Record<string, string>),
        signal: controller.signal,
      });

      const duration = Date.now() - startTime;
      console.log(`[GraphitiClient] Response received in ${duration}ms`);
      console.log(`[GraphitiClient] Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GraphitiClient] ===== REQUEST FAILED =====`);
        console.error(`[GraphitiClient] Status: ${response.status}`);
        console.error(`[GraphitiClient] Error: ${errorText}`);
        throw new Error(
          `Graphiti API error (${response.status}): ${errorText}`
        );
      }

      const data = await response.json() as T;
      console.log(`[GraphitiClient] ===== REQUEST SUCCESS =====`);
      console.log(`[GraphitiClient] Response data:`, JSON.stringify(data).substring(0, 500));

      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[GraphitiClient] ===== REQUEST ERROR (after ${duration}ms) =====`);
      console.error(`[GraphitiClient] URL: ${url}`);

      if (error instanceof Error) {
        console.error(`[GraphitiClient] Error type: ${error.name}`);
        console.error(`[GraphitiClient] Error message: ${error.message}`);
        console.error(`[GraphitiClient] Error stack:`, error.stack);

        if (error.name === 'AbortError') {
          throw new Error(`Graphiti API timeout after ${this.timeout}ms`);
        }
        throw error;
      }
      throw new Error('Unknown error communicating with Graphiti API');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if Graphiti service is healthy
   */
  async health(): Promise<GraphitiHealthResponse> {
    return this.request<GraphitiHealthResponse>('/health');
  }

  /**
   * Add an episode (document) to the knowledge graph
   */
  async addEpisode(episode: GraphitiEpisode): Promise<GraphitiEpisodeResponse> {
    return this.request<GraphitiEpisodeResponse>('/episodes', {
      method: 'POST',
      body: JSON.stringify(episode),
    });
  }

  /**
   * Add an episode with schema-enforced relationship extraction
   */
  async addEpisodeWithSchema(episode: GraphitiEpisodeWithSchema): Promise<{
    success: boolean;
    episode_uuid: string;
    new_nodes: number;
    new_edges: number;
    updated_nodes: number;
    schema_used: string | null;
  }> {
    return this.request('/episodes', {
      method: 'POST',
      body: JSON.stringify(episode),
    });
  }

  /**
   * Search the knowledge graph
   */
  async search(params: GraphitiSearchParams): Promise<GraphitiSearchResult> {
    const queryParams = new URLSearchParams({
      query: params.query,
      group_ids: params.group_ids.join(','),
    });

    // Add optional parameters
    if (params.num_results) {
      queryParams.set('num_results', params.num_results.toString());
    }

    // Add temporal filters
    if (params.is_historical !== undefined) {
      queryParams.set('is_historical', params.is_historical.toString());
    }
    if (params.data_source_type) {
      queryParams.set('data_source_type', params.data_source_type);
    }
    if (params.date_from) {
      queryParams.set('date_from', params.date_from);
    }
    if (params.date_to) {
      queryParams.set('date_to', params.date_to);
    }

    const url = `/search?${queryParams.toString()}`;
    console.log('[GraphitiClient] Search URL:', `${this.baseUrl}${url}`);

    const result = await this.request<GraphitiSearchResult>(url);

    console.log('[GraphitiClient] Raw response edges:', result.edges?.length || 0);

    return result;
  }

  /**
   * Get entity relationships
   */
  async getEntityEdges(
    entityName: string,
    groupIds: string[]
  ): Promise<GraphitiSearchResult> {
    const queryParams = new URLSearchParams({
      group_ids: groupIds.join(','),
    });

    return this.request<GraphitiSearchResult>(
      `/entities/${encodeURIComponent(entityName)}/edges?${queryParams.toString()}`
    );
  }

  /**
   * Delete an episode
   */
  async deleteEpisode(episodeId: string): Promise<void> {
    await this.request<void>(`/episodes/${episodeId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Expire an episode (mark as expired rather than deleting)
   * Expired episodes are excluded from search results but preserved for history
   */
  async expireEpisode(episodeId: string): Promise<void> {
    try {
      await this.request<void>(`/episodes/${episodeId}/expire`, {
        method: 'POST',
      });
    } catch (error) {
      // Fall back to deletion if expire endpoint not supported
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('404') || message.includes('not found')) {
        console.log(`[GraphitiClient] Expire not supported, falling back to delete for ${episodeId}`);
        await this.deleteEpisode(episodeId);
      } else {
        throw error;
      }
    }
  }

  /**
   * Add multiple episodes in bulk (much faster than sequential)
   */
  async addEpisodesBulk(request: GraphitiBulkEpisodeRequest): Promise<GraphitiBulkEpisodeResponse> {
    return this.request<GraphitiBulkEpisodeResponse>('/episodes/bulk', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Test connection to Graphiti service
   */
  async testConnection(): Promise<boolean> {
    try {
      const health = await this.health();
      return health.status === 'healthy' || health.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let graphitiClientInstance: GraphitiClient | null = null;

export function getGraphitiClient(): GraphitiClient {
  if (!graphitiClientInstance) {
    graphitiClientInstance = new GraphitiClient();
  }
  return graphitiClientInstance;
}

export function resetGraphitiClient(): void {
  graphitiClientInstance = null;
}
