/**
 * Query Decomposer
 * Breaks complex queries into simpler sub-queries for better retrieval
 */

// ============================================================================
// Types
// ============================================================================

export interface SubQuery {
  query: string;
  priority: number; // 1 = highest
  requiresGraph: boolean;
  type: 'comparison' | 'part' | 'original';
}

export interface DecomposedQuery {
  original: string;
  isComplex: boolean;
  subQueries: SubQuery[];
  complexityReason?: string;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

const COMPARISON_PATTERNS = [
  /\b(vs\.?|versus|compare|compared to|difference between)\b/i,
  /\b(better than|worse than|similar to)\b/i,
  /\b(pros and cons|advantages and disadvantages)\b/i,
];

const MULTI_PART_PATTERNS = [
  /\b(and also|additionally|furthermore|moreover)\b/i,
  /\b(first|second|third|finally)\b/i,
];

const QUESTION_CHAIN_PATTERN = /\?.*\?/;

const CONJUNCTION_SPLIT_PATTERN = /\s+and\s+(?=\w)/i;

// ============================================================================
// Query Decomposer Implementation
// ============================================================================

export class QueryDecomposer {
  /**
   * Decompose a query into sub-queries if complex
   */
  decompose(query: string): DecomposedQuery {
    // Check for complexity markers
    const hasComparison = this.matchesAny(query, COMPARISON_PATTERNS);
    const hasMultipleParts = this.matchesAny(query, MULTI_PART_PATTERNS);
    const hasQuestionChain = QUESTION_CHAIN_PATTERN.test(query);
    const hasConjunction = CONJUNCTION_SPLIT_PATTERN.test(query);

    const isComplex = hasComparison || hasMultipleParts || hasQuestionChain || hasConjunction;

    if (!isComplex) {
      return {
        original: query,
        isComplex: false,
        subQueries: [{
          query,
          priority: 1,
          requiresGraph: true,
          type: 'original',
        }],
      };
    }

    // Determine complexity reason
    let complexityReason = '';
    if (hasComparison) complexityReason = 'comparison';
    else if (hasQuestionChain) complexityReason = 'multiple_questions';
    else if (hasMultipleParts) complexityReason = 'multi_part';
    else if (hasConjunction) complexityReason = 'conjunction';

    // Decompose based on type
    const subQueries = this.createSubQueries(query, complexityReason);

    return {
      original: query,
      isComplex: true,
      subQueries,
      complexityReason,
    };
  }

  /**
   * Create sub-queries based on complexity type
   */
  private createSubQueries(query: string, reason: string): SubQuery[] {
    switch (reason) {
      case 'comparison':
        return this.decomposeComparison(query);
      case 'multiple_questions':
        return this.decomposeQuestionChain(query);
      case 'multi_part':
      case 'conjunction':
        return this.decomposeConjunction(query);
      default:
        return [{
          query,
          priority: 1,
          requiresGraph: true,
          type: 'original',
        }];
    }
  }

  /**
   * Decompose comparison queries (e.g., "A vs B")
   */
  private decomposeComparison(query: string): SubQuery[] {
    // Extract entities being compared
    const entities = this.extractComparisonEntities(query);

    if (entities.length < 2) {
      // Could not extract entities, return original
      return [{
        query,
        priority: 1,
        requiresGraph: true,
        type: 'original',
      }];
    }

    // Create sub-query for each entity
    return entities.map((entity, idx) => ({
      query: `Information about ${entity}`,
      priority: idx + 1,
      requiresGraph: true,
      type: 'comparison' as const,
    }));
  }

  /**
   * Decompose question chains (multiple questions)
   */
  private decomposeQuestionChain(query: string): SubQuery[] {
    // Split by question marks
    const questions = query
      .split('?')
      .map(q => q.trim())
      .filter(q => q.length > 10); // Filter out very short fragments

    if (questions.length <= 1) {
      return [{
        query,
        priority: 1,
        requiresGraph: true,
        type: 'original',
      }];
    }

    return questions.map((q, idx) => ({
      query: q.endsWith('?') ? q : `${q}?`,
      priority: idx + 1,
      requiresGraph: true,
      type: 'part' as const,
    }));
  }

  /**
   * Decompose conjunction queries (A and B)
   */
  private decomposeConjunction(query: string): SubQuery[] {
    // Split by "and" (careful not to split mid-phrase)
    const parts = query.split(CONJUNCTION_SPLIT_PATTERN);

    if (parts.length <= 1) {
      return [{
        query,
        priority: 1,
        requiresGraph: true,
        type: 'original',
      }];
    }

    return parts.map((part, idx) => ({
      query: part.trim(),
      priority: idx + 1,
      requiresGraph: true,
      type: 'part' as const,
    }));
  }

  /**
   * Extract entities from comparison query
   */
  private extractComparisonEntities(query: string): string[] {
    // Try common patterns
    // Pattern: "X vs Y", "X versus Y", "compare X and Y"
    const vsMatch = query.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:\?|$)/i);
    if (vsMatch) {
      return [vsMatch[1].trim(), vsMatch[2].trim()];
    }

    // Pattern: "compare X and Y"
    const compareMatch = query.match(/compare\s+(.+?)\s+(?:and|to|with)\s+(.+?)(?:\?|$)/i);
    if (compareMatch) {
      return [compareMatch[1].trim(), compareMatch[2].trim()];
    }

    // Pattern: "difference between X and Y"
    const diffMatch = query.match(/difference\s+between\s+(.+?)\s+and\s+(.+?)(?:\?|$)/i);
    if (diffMatch) {
      return [diffMatch[1].trim(), diffMatch[2].trim()];
    }

    // Fallback: Extract capitalized words as entities
    const entities = this.extractCapitalizedEntities(query);
    return entities.slice(0, 2);
  }

  /**
   * Extract capitalized words as potential entities
   */
  private extractCapitalizedEntities(query: string): string[] {
    const matches = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    return [...new Set(matches)];
  }

  /**
   * Check if query matches any pattern
   */
  private matchesAny(query: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(query));
  }

  /**
   * Estimate if decomposition is worth the overhead
   */
  shouldDecompose(query: string): boolean {
    // Don't decompose very short queries
    if (query.length < 30) return false;

    // Don't decompose simple questions
    const wordCount = query.split(/\s+/).length;
    if (wordCount < 5) return false;

    const decomposed = this.decompose(query);
    return decomposed.isComplex && decomposed.subQueries.length > 1;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const queryDecomposer = new QueryDecomposer();
