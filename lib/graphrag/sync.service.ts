/**
 * GraphRAG Sync Service
 * Date: October 14, 2025
 * Purpose: Event-driven synchronization of evaluation data to Neo4j knowledge graph
 *
 * This service provides idempotent, async event emission for:
 * - Citation relationships (message -> document)
 * - Judgment results (human, rule, LLM evaluations)
 * - Error tracking and analysis
 *
 * Events are queued asynchronously and don't block the main evaluation flow.
 */

import { getGraphitiClient } from './graphiti/client';
import type { GraphitiEpisode } from './graphiti/client';
import type { ValidatorResult } from '../evaluation/validators/rule-validators';

// ============================================================================
// Types
// ============================================================================

/**
 * Event types that can be synced to knowledge graph
 */
export type GraphSyncEventType = 'citation' | 'judgment' | 'error';

interface CitationEventData {
  citations?: { doc_id: string }[];
  userId?: string;
}

interface JudgmentEventData {
  results?: {
    validator: string;
    criterion: string;
    result: ValidatorResult;
    gate: number;
  }[];
  userId?: string;
}

interface ErrorEventData {
  type?: string;
  message?: string;
}

export type GraphSyncEventData = CitationEventData | JudgmentEventData | ErrorEventData;

/**
 * Event data structure for graph synchronization
 */
export interface GraphSyncEvent {
  type: GraphSyncEventType;
  messageId: string;
  data: GraphSyncEventData;
  idempotencyKey: string;
}

// ============================================================================
// GraphSyncService Class
// ============================================================================

/**
 * Service for syncing evaluation events to Neo4j via Graphiti
 */
export class GraphSyncService {
  private processedKeys: Set<string>;
  private graphitiClient;

  constructor() {
    this.processedKeys = new Set<string>();
    this.graphitiClient = getGraphitiClient();
    console.log('[GraphSync] Service initialized');
  }

  /**
   * Emit an event for async graph synchronization
   * Idempotent: duplicate events are skipped based on idempotencyKey
   */
  emitEvent(event: GraphSyncEvent): void {
    // Check idempotency
    if (this.processedKeys.has(event.idempotencyKey)) {
      console.log(`[GraphSync] Skipping duplicate event: ${event.idempotencyKey}`);
      return;
    }

    // Mark as processed
    this.processedKeys.add(event.idempotencyKey);
    console.log(`[GraphSync] Event queued: ${event.type} for message ${event.messageId}`);

    // Queue for async processing (don't block caller)
    this.processEventAsync(event).catch(error => {
      console.error('[GraphSync] Error processing event:', error);
      // Don't re-throw - we don't want to break the caller's flow
    });
  }

  /**
   * Process event asynchronously
   * Routes to appropriate sync method based on event type
   */
  private async processEventAsync(event: GraphSyncEvent): Promise<void> {
    console.log(`[GraphSync] Processing ${event.type} event for ${event.messageId}`);

    try {
      switch (event.type) {
        case 'citation':
          await this.syncCitation(event);
          break;
        case 'judgment':
          await this.syncJudgment(event);
          break;
        case 'error':
          await this.syncError(event);
          break;
        default:
          console.warn(`[GraphSync] Unknown event type: ${event.type}`);
      }
    } catch (error) {
      console.error(`[GraphSync] Failed to process ${event.type} event:`, error);
      throw error;
    }
  }

  /**
   * Sync citation event to knowledge graph
   * Creates relationship: Message -> CITES -> Document
   */
  private async syncCitation(event: GraphSyncEvent): Promise<void> {
    try {
      const data = event.data as CitationEventData;
      const citations = data?.citations || [];

      if (citations.length === 0) {
        console.log('[GraphSync] Citation event has no citations to record');
        return;
      }

      const groupId = data?.userId || 'system';
      const referenceTime = new Date().toISOString();
      const uniqueDocIds = [...new Set(citations.map(citation => citation.doc_id).filter(Boolean))];

      if (uniqueDocIds.length === 0) {
        console.log('[GraphSync] Citation event has no valid doc_ids');
        return;
      }

      for (const docId of uniqueDocIds) {
        const episode: GraphitiEpisode = {
          name: `citation-${event.messageId}-${docId}`,
          episode_body: `Message ${event.messageId} cited document ${docId}`,
          source_description: 'RAG Citation Tracking',
          reference_time: referenceTime,
          group_id: groupId,
        };

        await this.graphitiClient.addEpisode(episode);
      }

      console.log(`[GraphSync] Citation event processed: recorded ${uniqueDocIds.length} citations`);
    } catch (error) {
      console.error('[GraphSync] Citation sync error:', error);
      throw error;
    }
  }

  /**
   * Sync judgment event to knowledge graph
   * Creates judgment node with relationships to message
   */
  private async syncJudgment(event: GraphSyncEvent): Promise<void> {
    try {
      const data = event.data as JudgmentEventData;
      const results = data?.results || [];

      if (results.length === 0) {
        console.log('[GraphSync] Judgment event has no validator results');
        return;
      }

      const groupId = data?.userId || 'system';
      const referenceTime = new Date().toISOString();
      const summaries = results.map(result => {
        const status = result.result.passed ? 'PASS' : 'FAIL';
        const score = typeof result.result.score === 'number'
          ? ` (score ${result.result.score.toFixed(2)})`
          : '';
        const message = result.result.message ? ` - ${result.result.message}` : '';
        return `${result.validator}/${result.criterion}: ${status}${score}${message}`;
      });

      const episode: GraphitiEpisode = {
        name: `judgment-${event.messageId}`,
        episode_body: `Evaluation results for message ${event.messageId}:\n${summaries.join('\n')}`,
        source_description: 'RAG Evaluation Validators',
        reference_time: referenceTime,
        group_id: groupId,
      };

      await this.graphitiClient.addEpisode(episode);

      console.log('[GraphSync] Judgment event processed:', summaries.length, 'results recorded');
    } catch (error) {
      console.error('[GraphSync] Judgment sync error:', error);
      throw error;
    }
  }

  /**
   * Sync error event to knowledge graph
   * Tracks error patterns for analysis
   */
  private async syncError(event: GraphSyncEvent): Promise<void> {
    try {
      const data = event.data as ErrorEventData;
      const referenceTime = new Date().toISOString();
      const episode: GraphitiEpisode = {
        name: `error-${event.messageId}`,
        episode_body: `Error occurred in message ${event.messageId}: ${data?.message || 'No error message provided'}`,
        source_description: 'RAG Error Tracking',
        reference_time: referenceTime,
        group_id: 'system',
      };

      await this.graphitiClient.addEpisode(episode);

      console.log('[GraphSync] Error event processed and recorded');
    } catch (error) {
      console.error('[GraphSync] Error sync error:', error);
      throw error;
    }
  }

  /**
   * Clear processed keys (for testing)
   */
  clearProcessedKeys(): void {
    this.processedKeys.clear();
    console.log('[GraphSync] Processed keys cleared');
  }

  /**
   * Get count of processed events
   */
  getProcessedCount(): number {
    return this.processedKeys.size;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const graphSyncService = new GraphSyncService();
