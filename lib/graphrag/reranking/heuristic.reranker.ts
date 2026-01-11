/**
 * Heuristic Reranker
 * Fast reranking using text matching heuristics - no external dependencies
 */

import type { IReranker, RerankCandidate, RerankResult } from './reranker.interface';

// ============================================================================
// Configuration from Environment
// ============================================================================

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

// ============================================================================
// Heuristic Reranker Implementation
// ============================================================================

export class HeuristicReranker implements IReranker {
  private topK: number;
  private exactMatchBoost: number;
  private tokenOverlapWeight: number;
  private recencyMaxBoost: number;
  private recencyDecayDays: number;

  constructor(topK: number) {
    this.topK = topK;
    // All weights from environment variables
    this.exactMatchBoost = getEnvNumber('GRAPHRAG_RERANK_EXACT_MATCH_BOOST', 0.2);
    this.tokenOverlapWeight = getEnvNumber('GRAPHRAG_RERANK_TOKEN_OVERLAP_WEIGHT', 0.15);
    this.recencyMaxBoost = getEnvNumber('GRAPHRAG_RERANK_RECENCY_MAX_BOOST', 0.1);
    this.recencyDecayDays = getEnvNumber('GRAPHRAG_RERANK_RECENCY_DECAY_DAYS', 365);
  }

  async rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]> {
    if (candidates.length === 0) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const queryTokens = this.tokenize(queryLower);

    const scored = candidates.map((candidate, idx) => {
      const textLower = candidate.text.toLowerCase();

      // Calculate exact phrase match boost
      const exactMatch = textLower.includes(queryLower)
        ? this.exactMatchBoost
        : 0;

      // Calculate token overlap score
      const tokenScore = this.calculateTokenOverlap(queryTokens, textLower);

      // Calculate recency boost if timestamp available
      const recencyScore = this.calculateRecencyScore(candidate.metadata);

      // Combine scores
      const finalScore = candidate.score + exactMatch + tokenScore + recencyScore;

      return {
        originalIndex: idx,
        score: finalScore,
        text: candidate.text,
        metadata: candidate.metadata,
      };
    });

    // Sort by final score descending and return top K
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, this.topK);
  }

  private tokenize(text: string): string[] {
    return text
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  private calculateTokenOverlap(queryTokens: string[], text: string): number {
    if (queryTokens.length === 0) return 0;

    const matchingTokens = queryTokens.filter(token => text.includes(token));
    return (matchingTokens.length / queryTokens.length) * this.tokenOverlapWeight;
  }

  private calculateRecencyScore(metadata: Record<string, unknown>): number {
    const timestamp = metadata.created_at || metadata.createdAt;
    if (!timestamp || typeof timestamp !== 'string') {
      return 0;
    }

    const createdDate = new Date(timestamp);
    if (isNaN(createdDate.getTime())) {
      return 0;
    }

    const ageMs = Date.now() - createdDate.getTime();
    const daysSinceCreation = ageMs / (1000 * 60 * 60 * 24);

    // Decay function: max boost for recent, 0 for old
    const decay = 1 - (daysSinceCreation / this.recencyDecayDays);
    return Math.max(0, this.recencyMaxBoost * decay);
  }
}
