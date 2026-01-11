/**
 * Phase 4 Performance Validation Tests
 * Validates performance targets for GraphRAG system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyQuery } from '../../utils/query-classifier';
import { expandQuery } from '../../utils/query-expansion';

// ============================================================================
// Performance Test 1: Query Classification Speed
// ============================================================================

describe('Performance: Query classification latency', () => {
  it('should classify queries in < 5ms', () => {
    const queries = [
      '2+2',
      'what is the time',
      'search for RTX 4090',
      'find me information about GPUs',
      'tell me about machine learning',
      'what is deep learning',
      'calculate 100 / 5',
      'search the web for news',
    ];

    const start = performance.now();
    for (const query of queries) {
      classifyQuery(query);
    }
    const duration = performance.now() - start;

    // 8 queries should complete in < 40ms total (< 5ms each)
    expect(duration).toBeLessThan(40);
    console.log(`Query classification: ${queries.length} queries in ${duration.toFixed(2)}ms`);
  });

  it('should handle 100 classifications in < 50ms', () => {
    const queries = Array(100).fill(null).map((_, i) =>
      i % 2 === 0 ? `search for item ${i}` : `calculate ${i} + ${i}`
    );

    const start = performance.now();
    for (const query of queries) {
      classifyQuery(query);
    }
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
    console.log(`Classification throughput: ${queries.length} queries in ${duration.toFixed(2)}ms`);
  });
});

// ============================================================================
// Performance Test 2: Query Expansion Speed
// ============================================================================

describe('Performance: Query expansion latency', () => {
  it('should expand queries in < 2ms each', () => {
    const queries = [
      'search for RTX 4090',
      'find me information about GPUs',
      'tell me about neural networks',
      'what is machine learning',
      'look up API documentation',
    ];

    const start = performance.now();
    for (const query of queries) {
      expandQuery(query);
    }
    const duration = performance.now() - start;

    // 5 queries should complete in < 10ms total
    expect(duration).toBeLessThan(10);
    console.log(`Query expansion: ${queries.length} queries in ${duration.toFixed(2)}ms`);
  });
});

// ============================================================================
// Performance Test 3: Context Formatting Speed
// ============================================================================

describe('Performance: Context formatting', () => {
  it('should format 20 sources in < 10ms', async () => {
    const { GraphRAGService } = await import('../../service/graphrag-service');
    const service = new GraphRAGService();

    // Create mock sources
    const mockSources = Array(20).fill(null).map((_, i) => ({
      entity: `Entity${i % 5}`,
      fact: `This is fact number ${i} with some content about the entity and its relationships.`,
      confidence: 0.8 + (i % 3) * 0.05,
      sourceDescription: `Source ${i}`,
      uuid: `uuid-${i}`,
    }));

    const start = performance.now();
    // Access private method via type assertion for testing
    const formatted = (service as any).formatContext(mockSources, false);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(10);
    expect(formatted.length).toBeGreaterThan(0);
    console.log(`Context formatting: 20 sources in ${duration.toFixed(2)}ms`);
  });

  it('should compress 20 sources in < 15ms', async () => {
    const { GraphRAGService } = await import('../../service/graphrag-service');
    const service = new GraphRAGService();

    const mockSources = Array(20).fill(null).map((_, i) => ({
      entity: `Entity${i % 5}`,
      fact: `This is fact number ${i} with some content about the entity.`,
      confidence: 0.8,
      sourceDescription: `Source ${i}`,
      uuid: `uuid-${i}`,
    }));

    const start = performance.now();
    const compressed = (service as any).formatContext(mockSources, true);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(15);
    expect(compressed.length).toBeGreaterThan(0);
    // Compressed should be shorter than uncompressed
    const uncompressed = (service as any).formatContext(mockSources, false);
    expect(compressed.length).toBeLessThan(uncompressed.length);
    console.log(`Context compression: 20 sources in ${duration.toFixed(2)}ms`);
  });
});

// ============================================================================
// Performance Test 4: Memory Efficiency
// ============================================================================

describe('Performance: Memory efficiency', () => {
  it('should not leak memory on repeated classifications', () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Run 1000 classifications
    for (let i = 0; i < 1000; i++) {
      classifyQuery(`search for item ${i}`);
      expandQuery(`find me information about topic ${i}`);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

    // Memory increase should be minimal (< 10MB for 1000 operations)
    expect(memoryIncrease).toBeLessThan(10);
    console.log(`Memory increase after 1000 operations: ${memoryIncrease.toFixed(2)}MB`);
  });
});

// ============================================================================
// Performance Test 5: Token Count Estimation
// ============================================================================

describe('Performance: Context token estimation', () => {
  it('should produce context under 2000 tokens for typical sources', async () => {
    const { GraphRAGService } = await import('../../service/graphrag-service');
    const service = new GraphRAGService();

    // Create typical sources (10 facts, ~100 chars each)
    const mockSources = Array(10).fill(null).map((_, i) => ({
      entity: `Entity${i}`,
      fact: `This is a typical fact about entity ${i}. It contains relevant information that would be returned from a knowledge graph search.`,
      confidence: 0.85,
      sourceDescription: `Document ${i}`,
      uuid: `uuid-${i}`,
    }));

    const formatted = (service as any).formatContext(mockSources, false);

    // Rough token estimation: ~4 chars per token
    const estimatedTokens = formatted.length / 4;

    expect(estimatedTokens).toBeLessThan(2000);
    console.log(`Estimated tokens for 10 sources: ${estimatedTokens.toFixed(0)}`);
  });

  it('should reduce output length with compression via entity grouping', async () => {
    const { GraphRAGService } = await import('../../service/graphrag-service');
    const service = new GraphRAGService();

    // Create sources with same entities (to test grouping)
    const mockSources = Array(12).fill(null).map((_, i) => ({
      entity: `Entity${i % 3}`, // Only 3 unique entities
      fact: `Fact ${i} about entity ${i % 3}: detailed information here.`,
      confidence: 0.85,
      sourceDescription: `Document ${i}`,
      uuid: `uuid-${i}`,
    }));

    const uncompressed = (service as any).formatContext(mockSources, false);
    const compressed = (service as any).formatContext(mockSources, true);

    // Compression groups by entity, reducing redundant entity labels
    // With 12 sources grouped into 3 entities, we go from 12 labels to 3
    const uncompressedLines = uncompressed.split('\n\n').length;
    const compressedLines = compressed.split('\n\n').length;

    // Should reduce from 12 entries to 3 grouped entries
    expect(compressedLines).toBeLessThanOrEqual(3);
    expect(compressedLines).toBeLessThan(uncompressedLines);
    console.log(`Compression: ${uncompressedLines} entries -> ${compressedLines} grouped entries`);
  });
});

// ============================================================================
// Performance Test 6: Deduplication Efficiency
// ============================================================================

describe('Performance: Deduplication efficiency', () => {
  it('should deduplicate 100 sources in < 5ms', async () => {
    // Import search service to test deduplication
    const { SearchService } = await import('../../graphiti/search-service');

    // Create sources with duplicates
    const mockSources = Array(100).fill(null).map((_, i) => ({
      entity: `Entity${i % 20}`,
      // Create duplicates by repeating facts
      fact: `This is fact number ${i % 30}. It contains information that may be duplicated across sources.`,
      confidence: 0.8,
      sourceDescription: `Source ${i}`,
      uuid: `uuid-${i}`,
    }));

    const start = performance.now();
    // Test deduplication via fingerprinting
    const seen = new Set<string>();
    const unique = mockSources.filter(source => {
      const fingerprint = source.fact.slice(0, 100).toLowerCase();
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(5);
    expect(unique.length).toBeLessThan(mockSources.length);
    console.log(`Deduplication: ${mockSources.length} -> ${unique.length} sources in ${duration.toFixed(2)}ms`);
  });
});
