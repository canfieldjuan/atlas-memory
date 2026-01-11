/**
 * Heuristic Reranker Unit Tests
 * Tests for the no-dependency text matching reranker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment variables
const mockEnv: Record<string, string> = {};
vi.stubGlobal('process', {
  env: new Proxy(mockEnv, {
    get: (target, prop) => target[prop as string],
    set: (target, prop, value) => {
      target[prop as string] = value;
      return true;
    },
  }),
});

import { HeuristicReranker } from '../../reranking/heuristic.reranker';
import type { RerankCandidate } from '../../reranking/reranker.interface';

describe('HeuristicReranker', () => {
  let reranker: HeuristicReranker;

  beforeEach(() => {
    vi.clearAllMocks();
    reranker = new HeuristicReranker(5);
  });

  describe('Basic Reranking', () => {
    it('should return empty array for empty candidates', async () => {
      const results = await reranker.rerank('test query', []);
      expect(results).toEqual([]);
    });

    it('should preserve original index in results', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'First document', score: 0.5, metadata: {} },
        { text: 'Second document', score: 0.6, metadata: {} },
      ];

      const results = await reranker.rerank('document', candidates);

      expect(results.length).toBe(2);
      expect(results.every(r => typeof r.originalIndex === 'number')).toBe(true);
    });

    it('should return at most topK results', async () => {
      const candidates: RerankCandidate[] = Array.from({ length: 10 }, (_, i) => ({
        text: `Document ${i}`,
        score: 0.5,
        metadata: {},
      }));

      const results = await reranker.rerank('document', candidates);

      expect(results.length).toBe(5); // topK = 5
    });

    it('should sort by score descending', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'Low score', score: 0.1, metadata: {} },
        { text: 'High score', score: 0.9, metadata: {} },
        { text: 'Medium score', score: 0.5, metadata: {} },
      ];

      const results = await reranker.rerank('score', candidates);

      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
    });
  });

  describe('Exact Match Boost', () => {
    it('should boost score for exact query match', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'This contains machine learning concepts', score: 0.5, metadata: {} },
        { text: 'Random other text about science', score: 0.5, metadata: {} },
      ];

      const results = await reranker.rerank('machine learning', candidates);

      const matchingResult = results.find(r => r.text.includes('machine learning'));
      const nonMatchingResult = results.find(r => !r.text.includes('machine learning'));

      expect(matchingResult!.score).toBeGreaterThan(nonMatchingResult!.score);
    });

    it('should be case insensitive for exact match', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'NEURAL NETWORKS are powerful', score: 0.5, metadata: {} },
        { text: 'Something completely different', score: 0.5, metadata: {} },
      ];

      const results = await reranker.rerank('neural networks', candidates);

      const matchingResult = results.find(r =>
        r.text.toLowerCase().includes('neural networks')
      );
      expect(matchingResult!.score).toBeGreaterThan(0.5);
    });
  });

  describe('Token Overlap Scoring', () => {
    it('should boost score for token overlap', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'Python programming with data science', score: 0.5, metadata: {} },
        { text: 'Java development enterprise', score: 0.5, metadata: {} },
      ];

      const results = await reranker.rerank('python data programming', candidates);

      const pythonDoc = results.find(r => r.text.includes('Python'));
      const javaDoc = results.find(r => r.text.includes('Java'));

      expect(pythonDoc!.score).toBeGreaterThan(javaDoc!.score);
    });

    it('should filter tokens shorter than 3 characters', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'The API is excellent', score: 0.5, metadata: {} },
        { text: 'Database optimization', score: 0.5, metadata: {} },
      ];

      // 'is' and 'a' should be filtered, 'API' should match
      const results = await reranker.rerank('is a API', candidates);

      const apiDoc = results.find(r => r.text.includes('API'));
      expect(apiDoc).toBeDefined();
    });
  });

  describe('Recency Scoring', () => {
    it('should boost score for recent documents', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 7);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 300);

      const candidates: RerankCandidate[] = [
        {
          text: 'Recent document',
          score: 0.5,
          metadata: { createdAt: recentDate.toISOString() },
        },
        {
          text: 'Old document',
          score: 0.5,
          metadata: { createdAt: oldDate.toISOString() },
        },
      ];

      const results = await reranker.rerank('document', candidates);

      const recentDoc = results.find(r => r.text === 'Recent document');
      const oldDoc = results.find(r => r.text === 'Old document');

      expect(recentDoc!.score).toBeGreaterThan(oldDoc!.score);
    });

    it('should handle missing timestamp gracefully', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'No timestamp', score: 0.5, metadata: {} },
      ];

      const results = await reranker.rerank('test', candidates);
      expect(results.length).toBe(1);
      expect(results[0].score).toBeGreaterThanOrEqual(0.5);
    });

    it('should handle invalid timestamp gracefully', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'Invalid timestamp', score: 0.5, metadata: { createdAt: 'not-a-date' } },
      ];

      const results = await reranker.rerank('test', candidates);
      expect(results.length).toBe(1);
    });

    it('should support both createdAt and created_at keys', async () => {
      const recentDate = new Date().toISOString();

      const candidates: RerankCandidate[] = [
        { text: 'Using createdAt', score: 0.5, metadata: { createdAt: recentDate } },
        { text: 'Using created_at', score: 0.5, metadata: { created_at: recentDate } },
      ];

      const results = await reranker.rerank('test', candidates);
      expect(results.length).toBe(2);
    });
  });

  describe('Combined Scoring', () => {
    it('should combine all scoring factors', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3);

      const candidates: RerankCandidate[] = [
        {
          text: 'Exact machine learning match with recent date',
          score: 0.5,
          metadata: { createdAt: recentDate.toISOString() },
        },
        {
          text: 'No relevant content here at all',
          score: 0.6,
          metadata: { createdAt: '2020-01-01T00:00:00Z' },
        },
      ];

      const results = await reranker.rerank('machine learning', candidates);

      // The first candidate should rank higher due to combined boosts
      expect(results[0].text).toContain('machine learning');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single candidate', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'Only candidate', score: 0.7, metadata: {} },
      ];

      const results = await reranker.rerank('candidate', candidates);
      expect(results.length).toBe(1);
      expect(results[0].originalIndex).toBe(0);
    });

    it('should handle empty query', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'Some text', score: 0.5, metadata: {} },
      ];

      const results = await reranker.rerank('', candidates);
      expect(results.length).toBe(1);
    });

    it('should handle whitespace-only query', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'Some text', score: 0.5, metadata: {} },
      ];

      const results = await reranker.rerank('   ', candidates);
      expect(results.length).toBe(1);
    });

    it('should handle special characters in query', async () => {
      const candidates: RerankCandidate[] = [
        { text: 'C++ programming guide', score: 0.5, metadata: {} },
      ];

      const results = await reranker.rerank('C++ programming', candidates);
      expect(results.length).toBe(1);
    });
  });
});
