/**
 * Cross-Encoder Reranker
 * Uses external API for neural reranking (e.g., sentence-transformers service)
 */

import type {
  IReranker,
  RerankCandidate,
  RerankResult,
  RerankerConfig,
} from './reranker.interface';
import { log } from '@/lib/utils/logger';

// ============================================================================
// Cross-Encoder Reranker Implementation
// ============================================================================

export class CrossEncoderReranker implements IReranker {
  private model: string;
  private topK: number;
  private endpoint: string;
  private timeoutMs: number;

  constructor(config: RerankerConfig) {
    this.model = config.model || process.env.GRAPHRAG_RERANK_MODEL || 'ms-marco-MiniLM-L-6-v2';
    this.topK = config.topK;
    this.endpoint = config.endpoint
      || process.env.GRAPHRAG_RERANK_ENDPOINT
      || 'http://localhost:8002';
    this.timeoutMs = parseInt(process.env.GRAPHRAG_RERANK_TIMEOUT_MS || '5000', 10);
  }

  async rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]> {
    if (candidates.length === 0) {
      return [];
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.endpoint}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          documents: candidates.map(c => c.text),
          model: this.model,
          top_k: this.topK,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Reranker API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      // Map API response to RerankResult format
      return this.mapApiResponse(result, candidates);
    } catch (error) {
      log.error('GraphRAG', 'CrossEncoder reranking failed', { error });
      throw error;
    }
  }

  private mapApiResponse(
    apiResult: any,
    candidates: RerankCandidate[]
  ): RerankResult[] {
    // Handle different API response formats
    const results = apiResult.results || apiResult.rankings || apiResult;

    if (!Array.isArray(results)) {
      throw new Error('Invalid reranker API response format');
    }

    return results.map((r: any) => {
      const index = typeof r.index === 'number' ? r.index : r.corpus_id;
      const score = typeof r.score === 'number' ? r.score : r.relevance_score;

      if (index === undefined || index < 0 || index >= candidates.length) {
        throw new Error(`Invalid index in reranker response: ${index}`);
      }

      return {
        originalIndex: index,
        score: score,
        text: candidates[index].text,
        metadata: candidates[index].metadata,
      };
    });
  }
}
