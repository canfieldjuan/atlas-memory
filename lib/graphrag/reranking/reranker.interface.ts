/**
 * Reranker Interface
 * Defines contracts for reranking search results
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface RerankerConfig {
  type: 'cross-encoder' | 'heuristic' | 'none';
  model?: string;
  topK: number;
  endpoint?: string;
}

// ============================================================================
// Data Types
// ============================================================================

export interface RerankCandidate {
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface RerankResult {
  originalIndex: number;
  score: number;
  text: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Reranker Interface
// ============================================================================

export interface IReranker {
  rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]>;
}
