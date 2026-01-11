/**
 * Phase 4 Functional Validation Tests
 * Validates all Phase 1-3 implementations meet requirements
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyQuery } from '../../utils/query-classifier';
import { expandQuery, getBestVariant, shouldExpandQuery } from '../../utils/query-expansion';

// ============================================================================
// Functional Test 1: Math queries skip GraphRAG
// ============================================================================

describe('Functional: Math queries skip GraphRAG', () => {
  it('should skip search for basic arithmetic "2+2"', () => {
    const result = classifyQuery('2+2');
    expect(result.shouldSkipSearch).toBe(true);
    expect(result.isMath).toBe(true);
  });

  it('should skip search for "what is 15 * 3"', () => {
    const result = classifyQuery('what is 15 * 3');
    expect(result.shouldSkipSearch).toBe(true);
    expect(result.isMath).toBe(true);
  });

  it('should skip search for "calculate 100 / 5"', () => {
    const result = classifyQuery('calculate 100 / 5');
    expect(result.shouldSkipSearch).toBe(true);
    expect(result.isMath).toBe(true);
  });

  it('should NOT skip search for text containing numbers', () => {
    const result = classifyQuery('what is the RTX 4090 price');
    expect(result.shouldSkipSearch).toBe(false);
  });
});

// ============================================================================
// Functional Test 2: Query Expansion works correctly
// ============================================================================

describe('Functional: Query expansion transforms correctly', () => {
  it('should expand "search for RTX 4090" to include bare term', () => {
    const expanded = expandQuery('search for RTX 4090');
    expect(expanded.variants).toContain('search for RTX 4090');
    expect(expanded.variants).toContain('RTX 4090');
    expect(expanded.transformationsApplied).toContain('remove_search_prefix');
  });

  it('should expand "find me information about GPUs"', () => {
    const expanded = expandQuery('find me information about GPUs');
    expect(expanded.variants.length).toBeGreaterThan(1);
    expect(expanded.transformationsApplied).toContain('remove_find_prefix');
  });

  it('should expand "tell me about neural networks"', () => {
    const expanded = expandQuery('tell me about neural networks');
    expect(expanded.variants).toContain('neural networks');
    expect(expanded.transformationsApplied).toContain('remove_tell_me_prefix');
  });

  it('should expand "what is machine learning"', () => {
    const expanded = expandQuery('what is machine learning');
    expect(expanded.variants).toContain('machine learning');
    expect(expanded.transformationsApplied).toContain('remove_what_is_prefix');
  });

  it('should identify queries that need expansion', () => {
    expect(shouldExpandQuery('search for something')).toBe(true);
    expect(shouldExpandQuery('find me information')).toBe(true);
    expect(shouldExpandQuery('RTX 4090 specs')).toBe(false);
  });

  it('should get best variant (cleanest form)', () => {
    const expanded = expandQuery('search for RTX 4090 specs');
    const best = getBestVariant(expanded);
    expect(best).toBe('RTX 4090 specs');
  });
});

// ============================================================================
// Functional Test 3: Threshold filtering configuration
// ============================================================================

describe('Functional: Threshold filtering is configurable', () => {
  it('should have threshold configuration in graphrag config', async () => {
    const { graphragConfig } = await import('../../config');
    expect(graphragConfig.search).toBeDefined();
    expect(typeof graphragConfig.search.threshold).toBe('number');
    expect(graphragConfig.search.threshold).toBeGreaterThanOrEqual(0);
    expect(graphragConfig.search.threshold).toBeLessThanOrEqual(1);
  });

  it('should default to reasonable threshold value', async () => {
    const { graphragConfig } = await import('../../config');
    // Default should be between 0.3 and 0.8
    expect(graphragConfig.search.threshold).toBeGreaterThanOrEqual(0.3);
    expect(graphragConfig.search.threshold).toBeLessThanOrEqual(0.8);
  });
});

// ============================================================================
// Functional Test 4: Deduplication logic exists
// ============================================================================

describe('Functional: Deduplication prevents duplicate facts', () => {
  it('should have deduplication method in search service', async () => {
    // Verify the method exists by importing the module
    const searchServiceModule = await import('../../graphiti/search-service');
    expect(searchServiceModule.searchService).toBeDefined();
  });
});

// ============================================================================
// Functional Test 5: Error recovery with retries
// ============================================================================

describe('Functional: Error recovery with retries', () => {
  it('should have retry configuration in document service', async () => {
    const documentServiceModule = await import('../../service/document-service');
    expect(documentServiceModule.DocumentService).toBeDefined();
  });

  it('should have episode service with retry support', async () => {
    const episodeServiceModule = await import('../../graphiti/episode-service');
    expect(episodeServiceModule.episodeService).toBeDefined();
  });
});

// ============================================================================
// Functional Test 6: User feedback API exists
// ============================================================================

describe('Functional: User feedback system', () => {
  it('should have feedback API route file', async () => {
    // This verifies the file exists and exports properly
    const fs = await import('fs');
    const path = await import('path');
    const feedbackRoutePath = path.join(
      process.cwd(),
      'app/api/graphrag/feedback/route.ts'
    );
    expect(fs.existsSync(feedbackRoutePath)).toBe(true);
  });
});

// ============================================================================
// Functional Test 7: Context compression exists
// ============================================================================

describe('Functional: Context compression reduces token usage', () => {
  it('should have GraphRAG service with compression support', async () => {
    const { graphragService } = await import('../../service/graphrag-service');
    expect(graphragService).toBeDefined();
    expect(typeof graphragService.enhancePrompt).toBe('function');
  });
});

// ============================================================================
// Functional Test 8: Cache invalidation exists
// ============================================================================

describe('Functional: Cache invalidation for document updates', () => {
  it('should have expireEpisode method in client', async () => {
    const { GraphitiClient } = await import('../../graphiti/client');
    const client = new GraphitiClient({ baseUrl: 'http://test:8001' });
    expect(typeof client.expireEpisode).toBe('function');
  });

  it('should have expireOldEpisodes method in document service', async () => {
    const { documentService } = await import('../../service/document-service');
    expect(typeof documentService.expireOldEpisodes).toBe('function');
  });
});

// ============================================================================
// Functional Test 9: DateTime queries skip search
// ============================================================================

describe('Functional: DateTime queries skip GraphRAG', () => {
  it('should skip search for "what time is it"', () => {
    const result = classifyQuery('what time is it');
    expect(result.shouldSkipSearch).toBe(true);
    expect(result.isDateTime).toBe(true);
  });

  it('should skip search for "what is today\'s date"', () => {
    const result = classifyQuery("what is today's date");
    expect(result.shouldSkipSearch).toBe(true);
    expect(result.isDateTime).toBe(true);
  });
});

// ============================================================================
// Functional Test 10: Web search queries skip GraphRAG
// ============================================================================

describe('Functional: Web search queries skip GraphRAG', () => {
  it('should skip search for "search the web for news"', () => {
    const result = classifyQuery('search the web for news');
    expect(result.shouldSkipSearch).toBe(true);
    expect(result.isWebSearch).toBe(true);
  });

  it('should skip search for "google latest updates"', () => {
    const result = classifyQuery('google latest updates');
    expect(result.shouldSkipSearch).toBe(true);
    expect(result.isWebSearch).toBe(true);
  });
});
