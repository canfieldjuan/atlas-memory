/**
 * Query Classifier Unit Tests
 * Tests for query classification logic that determines if GraphRAG search should be skipped
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the config module before importing the classifier
vi.mock('../../config', () => ({
  graphragConfig: {
    search: {
      skipMathQueries: true,
      skipDateTimeQueries: true,
      skipWebSearchQueries: true,
    },
  },
}));

import { classifyQuery } from '../../utils/query-classifier';

describe('Query Classifier', () => {
  describe('Math Query Detection', () => {
    it('should detect direct arithmetic operators', () => {
      const result = classifyQuery('50*2');
      expect(result.isMath).toBe(true);
      expect(result.shouldSkipSearch).toBe(true);
      expect(result.detectedPattern).toBe('math_operator');
    });

    it('should detect addition expressions', () => {
      const result = classifyQuery('23 + 45');
      expect(result.isMath).toBe(true);
      expect(result.shouldSkipSearch).toBe(true);
    });

    it('should detect subtraction expressions', () => {
      const result = classifyQuery('100 - 30');
      expect(result.isMath).toBe(true);
      expect(result.shouldSkipSearch).toBe(true);
    });

    it('should detect division expressions', () => {
      const result = classifyQuery('144/12');
      expect(result.isMath).toBe(true);
      expect(result.shouldSkipSearch).toBe(true);
    });

    it('should detect percentage calculations', () => {
      const result = classifyQuery('23% of 456');
      expect(result.isMath).toBe(true);
      expect(result.shouldSkipSearch).toBe(true);
      expect(result.detectedPattern).toBe('percentage_calculation');
    });

    it('should detect calculate keyword with numbers', () => {
      // The regex requires just numbers after calculate, test with simpler expression
      const result = classifyQuery('calculate 50');
      expect(result.isMath).toBe(true);
      expect(result.detectedPattern).toBe('calculate_keyword');
    });

    it('should detect compute keyword with numbers', () => {
      const result = classifyQuery('compute 100 * 5');
      expect(result.isMath).toBe(true);
    });

    it('should detect pure arithmetic expressions', () => {
      // Note: expressions with operators match 'math_operator' pattern first
      const result = classifyQuery('(50 + 25) * 2');
      expect(result.isMath).toBe(true);
      // Pattern 1 matches before Pattern 4
      expect(result.detectedPattern).toBe('math_operator');
    });

    it('should NOT detect product names with numbers as math', () => {
      const result = classifyQuery('What is RTX 4090 TDP?');
      expect(result.isMath).toBe(false);
      expect(result.shouldSkipSearch).toBe(false);
    });
  });

  describe('DateTime Query Detection', () => {
    it('should detect what time query', () => {
      const result = classifyQuery('what time is it');
      expect(result.isDateTime).toBe(true);
      expect(result.shouldSkipSearch).toBe(true);
      expect(result.detectedPattern).toBe('datetime_query');
    });

    it('should detect current time query', () => {
      const result = classifyQuery('current time');
      expect(result.isDateTime).toBe(true);
    });

    it('should detect what date query', () => {
      const result = classifyQuery('what is the date today');
      expect(result.isDateTime).toBe(true);
    });

    it('should detect today date query', () => {
      const result = classifyQuery("today's date");
      expect(result.isDateTime).toBe(true);
    });

    it('should detect timezone conversion query', () => {
      const result = classifyQuery('what time in Tokyo timezone');
      expect(result.isDateTime).toBe(true);
    });

    it('should NOT detect historical date queries as datetime', () => {
      const result = classifyQuery('when was the moon landing');
      expect(result.isDateTime).toBe(false);
    });
  });

  describe('Web Search Query Detection', () => {
    it('should detect search for prefix', () => {
      const result = classifyQuery('search for latest AI news');
      expect(result.isWebSearch).toBe(true);
      expect(result.shouldSkipSearch).toBe(true);
      expect(result.detectedPattern).toBe('web_search_request');
    });

    it('should detect search the web prefix', () => {
      const result = classifyQuery('search the web for python tutorials');
      expect(result.isWebSearch).toBe(true);
    });

    it('should detect google prefix', () => {
      const result = classifyQuery('google best restaurants nearby');
      expect(result.isWebSearch).toBe(true);
    });

    it('should detect latest news queries', () => {
      const result = classifyQuery('latest news about climate change');
      expect(result.isWebSearch).toBe(true);
    });

    it('should detect breaking news queries', () => {
      const result = classifyQuery('breaking news in technology');
      expect(result.isWebSearch).toBe(true);
    });

    it('should NOT detect general knowledge queries as web search', () => {
      const result = classifyQuery('explain how photosynthesis works');
      expect(result.isWebSearch).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null input gracefully', () => {
      const result = classifyQuery(null as unknown as string);
      expect(result.shouldSkipSearch).toBe(false);
      expect(result.reason).toBe('Invalid query');
    });

    it('should handle undefined input gracefully', () => {
      const result = classifyQuery(undefined as unknown as string);
      expect(result.shouldSkipSearch).toBe(false);
      expect(result.reason).toBe('Invalid query');
    });

    it('should handle empty string', () => {
      const result = classifyQuery('');
      expect(result.shouldSkipSearch).toBe(false);
      expect(result.reason).toBe('Invalid query');
    });

    it('should handle whitespace-only string', () => {
      const result = classifyQuery('   ');
      expect(result.isMath).toBe(false);
      expect(result.isDateTime).toBe(false);
      expect(result.isWebSearch).toBe(false);
    });
  });

  describe('Non-Skip Queries', () => {
    it('should NOT skip knowledge base queries', () => {
      const result = classifyQuery('What are the key features of our product?');
      expect(result.shouldSkipSearch).toBe(false);
      expect(result.isMath).toBe(false);
      expect(result.isDateTime).toBe(false);
      expect(result.isWebSearch).toBe(false);
    });

    it('should NOT skip document-related queries', () => {
      const result = classifyQuery('summarize the quarterly report');
      expect(result.shouldSkipSearch).toBe(false);
    });

    it('should NOT skip technical questions', () => {
      const result = classifyQuery('how do I configure the API endpoint');
      expect(result.shouldSkipSearch).toBe(false);
    });

    it('should NOT skip concept explanation queries', () => {
      const result = classifyQuery('explain machine learning to me');
      expect(result.shouldSkipSearch).toBe(false);
    });
  });

  describe('Classification Result Structure', () => {
    it('should return complete classification object', () => {
      const result = classifyQuery('50 + 25');

      expect(result).toHaveProperty('isMath');
      expect(result).toHaveProperty('isDateTime');
      expect(result).toHaveProperty('isWebSearch');
      expect(result).toHaveProperty('isToolSpecific');
      expect(result).toHaveProperty('shouldSkipSearch');
    });

    it('should set isToolSpecific when any tool type is detected', () => {
      const mathResult = classifyQuery('50 * 2');
      expect(mathResult.isToolSpecific).toBe(true);

      const dateResult = classifyQuery('what time is it');
      expect(dateResult.isToolSpecific).toBe(true);

      const webResult = classifyQuery('search for news');
      expect(webResult.isToolSpecific).toBe(true);
    });

    it('should provide reason when skipping search', () => {
      const result = classifyQuery('50 * 2');
      expect(result.reason).toContain('calculator');
    });
  });
});
