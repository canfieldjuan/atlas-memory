/**
 * Reranking Module
 * Exports reranker implementations and factory
 */

export type {
  IReranker,
  RerankCandidate,
  RerankResult,
  RerankerConfig,
} from './reranker.interface';

export { HeuristicReranker } from './heuristic.reranker';
export { CrossEncoderReranker } from './cross-encoder.reranker';

// ============================================================================
// Reranker Factory
// ============================================================================

import type { IReranker, RerankerConfig } from './reranker.interface';
import { HeuristicReranker } from './heuristic.reranker';
import { CrossEncoderReranker } from './cross-encoder.reranker';

export function createReranker(config: RerankerConfig): IReranker | null {
  if (config.type === 'none') {
    return null;
  }

  if (config.type === 'heuristic') {
    return new HeuristicReranker(config.topK);
  }

  if (config.type === 'cross-encoder') {
    return new CrossEncoderReranker(config);
  }

  return null;
}
