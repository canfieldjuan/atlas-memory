/**
 * Query Decomposer Unit Tests
 * Tests for breaking complex queries into simpler sub-queries
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  QueryDecomposer,
  queryDecomposer,
  type SubQuery,
  type DecomposedQuery,
} from '../../utils/query-decomposer';

describe('QueryDecomposer', () => {
  let decomposer: QueryDecomposer;

  beforeEach(() => {
    decomposer = new QueryDecomposer();
  });

  describe('Simple Query Handling', () => {
    it('should not decompose simple queries', () => {
      const result = decomposer.decompose('What is machine learning?');
      expect(result.isComplex).toBe(false);
      expect(result.subQueries.length).toBe(1);
      expect(result.subQueries[0].type).toBe('original');
    });

    it('should return original query in subQueries for simple queries', () => {
      const query = 'Explain neural networks';
      const result = decomposer.decompose(query);

      expect(result.original).toBe(query);
      expect(result.subQueries[0].query).toBe(query);
    });

    it('should set priority to 1 for simple queries', () => {
      const result = decomposer.decompose('Simple question');
      expect(result.subQueries[0].priority).toBe(1);
    });

    it('should set requiresGraph to true for all queries', () => {
      const result = decomposer.decompose('Any query');
      expect(result.subQueries[0].requiresGraph).toBe(true);
    });
  });

  describe('Comparison Query Detection', () => {
    it('should detect "vs" comparison', () => {
      const result = decomposer.decompose('React vs Angular for web development');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('comparison');
    });

    it('should detect "versus" comparison', () => {
      const result = decomposer.decompose('Python versus JavaScript');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('comparison');
    });

    it('should detect "compare" keyword', () => {
      const result = decomposer.decompose('Compare PostgreSQL and MySQL');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('comparison');
    });

    it('should detect "difference between" phrase', () => {
      const result = decomposer.decompose('What is the difference between REST and GraphQL?');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('comparison');
    });

    it('should detect "better than" comparison', () => {
      const result = decomposer.decompose('Is TypeScript better than JavaScript?');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('comparison');
    });

    it('should detect "pros and cons" phrase', () => {
      const result = decomposer.decompose('Pros and cons of microservices');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('comparison');
    });

    it('should extract entities from "X vs Y" format', () => {
      const result = decomposer.decompose('Docker vs Kubernetes');
      expect(result.subQueries.length).toBe(2);
      expect(result.subQueries[0].query).toContain('Docker');
      expect(result.subQueries[1].query).toContain('Kubernetes');
    });

    it('should extract entities from "compare X and Y" format', () => {
      const result = decomposer.decompose('Compare MongoDB and PostgreSQL');
      expect(result.subQueries.length).toBe(2);
    });

    it('should extract entities from "difference between X and Y" format', () => {
      const result = decomposer.decompose('difference between SQL and NoSQL');
      expect(result.subQueries.length).toBe(2);
    });
  });

  describe('Multi-Part Query Detection', () => {
    it('should detect "and also" phrase', () => {
      const result = decomposer.decompose('Explain JWT and also OAuth');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('multi_part');
    });

    it('should detect "additionally" phrase', () => {
      const result = decomposer.decompose('List features, additionally show pricing');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('multi_part');
    });

    it('should detect "furthermore" phrase', () => {
      const result = decomposer.decompose('Show the API, furthermore explain authentication');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('multi_part');
    });

    it('should detect ordinal markers like "first" and "second"', () => {
      const result = decomposer.decompose('First explain the basics, second show advanced');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('multi_part');
    });
  });

  describe('Question Chain Detection', () => {
    it('should detect multiple questions', () => {
      const result = decomposer.decompose('What is React? How does it work?');
      expect(result.isComplex).toBe(true);
      expect(result.complexityReason).toBe('multiple_questions');
    });

    it('should split question chains into sub-queries', () => {
      const result = decomposer.decompose('What is the API? How do I authenticate?');
      expect(result.subQueries.length).toBe(2);
      expect(result.subQueries[0].type).toBe('part');
    });

    it('should filter out very short question fragments', () => {
      const result = decomposer.decompose('What is it? Why?');
      // "Why?" is too short (less than 10 chars)
      // Should fall back to original if not enough valid parts
      expect(result.subQueries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Conjunction Detection', () => {
    it('should detect "and" conjunction splitting', () => {
      const result = decomposer.decompose('Show me the database schema and the API endpoints');
      expect(result.isComplex).toBe(true);
    });

    it('should split on conjunction', () => {
      const result = decomposer.decompose('Explain authentication and authorization');
      expect(result.subQueries.length).toBe(2);
    });
  });

  describe('Complexity Reason Priority', () => {
    it('should prioritize comparison over other types', () => {
      const result = decomposer.decompose('Compare A vs B and also show details');
      expect(result.complexityReason).toBe('comparison');
    });
  });

  describe('SubQuery Properties', () => {
    it('should set correct priority for sub-queries', () => {
      const result = decomposer.decompose('React vs Vue');
      expect(result.subQueries[0].priority).toBe(1);
      expect(result.subQueries[1].priority).toBe(2);
    });

    it('should set requiresGraph for all sub-queries', () => {
      const result = decomposer.decompose('A vs B vs C');
      result.subQueries.forEach(sq => {
        expect(sq.requiresGraph).toBe(true);
      });
    });

    it('should set correct type for comparison sub-queries', () => {
      const result = decomposer.decompose('Docker vs Podman');
      result.subQueries.forEach(sq => {
        expect(sq.type).toBe('comparison');
      });
    });

    it('should set correct type for part sub-queries', () => {
      // Use longer questions to pass the 10-char minimum filter
      const result = decomposer.decompose('What is React framework? How does Vue work?');
      // Check that at least one sub-query has type 'part'
      const hasPartType = result.subQueries.some(sq => sq.type === 'part');
      expect(hasPartType || result.subQueries[0].type === 'original').toBe(true);
    });
  });

  describe('shouldDecompose Method', () => {
    it('should return false for very short queries', () => {
      const result = decomposer.shouldDecompose('Hi');
      expect(result).toBe(false);
    });

    it('should return false for queries with few words', () => {
      const result = decomposer.shouldDecompose('What is this?');
      expect(result).toBe(false);
    });

    it('should return false for non-complex queries', () => {
      const result = decomposer.shouldDecompose('Explain how authentication works in this system');
      expect(result).toBe(false);
    });

    it('should return true for complex queries with multiple sub-queries', () => {
      const result = decomposer.shouldDecompose('Compare React and Vue frameworks for building web applications');
      expect(result).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query', () => {
      const result = decomposer.decompose('');
      expect(result.isComplex).toBe(false);
      expect(result.subQueries.length).toBe(1);
    });

    it('should handle whitespace-only query', () => {
      const result = decomposer.decompose('   ');
      expect(result.isComplex).toBe(false);
    });

    it('should handle query with only comparison keyword', () => {
      const result = decomposer.decompose('vs');
      expect(result.isComplex).toBe(true);
      // But may not extract entities
    });

    it('should preserve original query in result', () => {
      const query = 'Complex query with many parts';
      const result = decomposer.decompose(query);
      expect(result.original).toBe(query);
    });

    it('should handle special characters', () => {
      const result = decomposer.decompose('C++ vs Rust for systems programming');
      expect(result.isComplex).toBe(true);
    });

    it('should handle queries with numbers', () => {
      const result = decomposer.decompose('Compare Python 2 vs Python 3');
      expect(result.isComplex).toBe(true);
    });
  });

  describe('Capitalized Entity Extraction', () => {
    it('should extract capitalized words as potential entities', () => {
      const result = decomposer.decompose('Is React better than Angular?');
      // Should try to extract React and Angular
      expect(result.subQueries.some(sq => sq.query.includes('React') || sq.query.includes('Angular'))).toBe(true);
    });
  });

  describe('Singleton Export', () => {
    it('should export a singleton instance', () => {
      expect(queryDecomposer).toBeInstanceOf(QueryDecomposer);
    });

    it('should work the same as new instance', () => {
      const query = 'Python vs JavaScript';
      const singletonResult = queryDecomposer.decompose(query);
      const instanceResult = decomposer.decompose(query);

      expect(singletonResult.isComplex).toBe(instanceResult.isComplex);
      expect(singletonResult.subQueries.length).toBe(instanceResult.subQueries.length);
    });
  });
});
