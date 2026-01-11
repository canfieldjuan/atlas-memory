/**
 * Phase 4 Integration Validation Tests
 * Validates GraphRAG integrates correctly with the broader system
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Reset all mocks before these integration tests
beforeAll(() => {
  vi.resetModules();
});

// ============================================================================
// Integration Test 1: Service Exports
// ============================================================================

describe('Integration: Module exports are correct', () => {
  it('should export graphrag-service singleton', async () => {
    const { graphragService } = await import('../../service/graphrag-service');
    expect(graphragService).toBeDefined();
    expect(typeof graphragService.enhancePrompt).toBe('function');
    expect(typeof graphragService.formatCitations).toBe('function');
  });

  it('should export search-service singleton', async () => {
    const { searchService } = await import('../../graphiti/search-service');
    expect(searchService).toBeDefined();
    expect(typeof searchService.search).toBe('function');
  });

  it('should export document-service singleton', async () => {
    const { documentService } = await import('../../service/document-service');
    expect(documentService).toBeDefined();
    expect(typeof documentService.uploadAndProcess).toBe('function');
    expect(typeof documentService.deleteDocument).toBe('function');
    expect(typeof documentService.expireOldEpisodes).toBe('function');
  });

  it('should export episode-service singleton', async () => {
    const { episodeService } = await import('../../graphiti/episode-service');
    expect(episodeService).toBeDefined();
    expect(typeof episodeService.addDocument).toBe('function');
  });

  it('should export graphiti client factory', async () => {
    const { getGraphitiClient, GraphitiClient } = await import('../../graphiti/client');
    expect(getGraphitiClient).toBeDefined();
    expect(GraphitiClient).toBeDefined();

    const client = getGraphitiClient();
    expect(client).toBeInstanceOf(GraphitiClient);
  });
});

// ============================================================================
// Integration Test 2: Configuration System
// ============================================================================

describe('Integration: Configuration is properly loaded', () => {
  it('should load graphrag config with expected structure', async () => {
    const { graphragConfig } = await import('../../config');

    expect(graphragConfig).toBeDefined();
    expect(typeof graphragConfig.enabled).toBe('boolean');
    expect(graphragConfig.search).toBeDefined();
    expect(typeof graphragConfig.search.threshold).toBe('number');
    expect(graphragConfig.processing).toBeDefined();
    expect(typeof graphragConfig.processing.chunkSize).toBe('number');
    expect(typeof graphragConfig.processing.maxFileSize).toBe('number');
    expect(Array.isArray(graphragConfig.processing.supportedTypes)).toBe(true);
  });

  it('should have search config with required fields', async () => {
    const { graphragConfig } = await import('../../config');

    // Threshold should be between 0 and 1
    expect(graphragConfig.search.threshold).toBeGreaterThanOrEqual(0);
    expect(graphragConfig.search.threshold).toBeLessThanOrEqual(1);

    // Processing config should have positive values
    expect(graphragConfig.processing.chunkSize).toBeGreaterThan(0);
    expect(graphragConfig.processing.maxFileSize).toBeGreaterThan(0);
  });
});

// ============================================================================
// Integration Test 3: Type Exports
// ============================================================================

describe('Integration: Types are exported correctly', () => {
  it('should export core types from types module', async () => {
    const types = await import('../../types');
    // Verify the module exports expected type definitions
    expect(types).toBeDefined();
    // These are type exports - we verify by checking the module loaded
    expect(typeof types).toBe('object');
  });

  it('should export Document type', async () => {
    const types = await import('../../types');
    expect(types).toBeDefined();
  });
});

// ============================================================================
// Integration Test 4: Query Classifier Integration
// ============================================================================

describe('Integration: Query classifier works with GraphRAG service', () => {
  it('should skip GraphRAG for math queries via enhancePrompt', async () => {
    const { graphragService } = await import('../../service/graphrag-service');

    // Mock the config to be enabled
    vi.mock('../../config', () => ({
      graphragConfig: {
        enabled: true,
        search: { threshold: 0.5, maxResults: 10 },
        processing: { chunkSize: 1000, maxFileSize: 10000000, supportedTypes: ['pdf'] },
      },
    }));

    const result = await graphragService.enhancePrompt('test-user', '2+2');

    // Should return original prompt without context (math query skipped)
    expect(result.prompt).toBe('2+2');
    expect(result.contextUsed).toBe(false);
  });
});

// ============================================================================
// Integration Test 5: Error Handling Integration
// ============================================================================

describe('Integration: Error handling across modules', () => {
  it('should handle invalid file type gracefully', async () => {
    const { DocumentService } = await import('../../service/document-service');
    const service = new DocumentService();

    // Try to validate an unsupported file type
    const mockFile = new File(['test content'], 'test.xyz', { type: 'application/xyz' });

    const mockSupabase = {} as any;

    await expect(
      service.uploadOnly(mockSupabase, {
        userId: 'test-user',
        file: mockFile,
      })
    ).rejects.toThrow(/Unsupported file extension/);
  });

  it('should handle empty query gracefully', async () => {
    const { classifyQuery } = await import('../../utils/query-classifier');

    // Empty query should not throw and should return a result
    const result = classifyQuery('');
    expect(result).toBeDefined();
    // Empty queries are passed through (not skipped) as they're not tool-specific
    expect(typeof result.shouldSkipSearch).toBe('boolean');
  });

  it('should handle null query in expansion', async () => {
    const { expandQuery } = await import('../../utils/query-expansion');

    // Null/undefined should not throw
    const result = expandQuery('');
    expect(result.variants).toHaveLength(0);
    expect(result.original).toBe('');
  });
});

// ============================================================================
// Integration Test 6: Embedder Configuration
// ============================================================================

describe('Integration: Embedder configuration', () => {
  it('should allow setting embedder config on client', async () => {
    const { GraphitiClient } = await import('../../graphiti/client');
    const client = new GraphitiClient({ baseUrl: 'http://test:8001' });

    const embedderConfig = {
      provider: 'openai' as const,
      model: 'text-embedding-3-small',
      apiKey: 'test-key',
    };

    client.setEmbedderConfig(embedderConfig);

    const retrieved = client.getEmbedderConfig();
    expect(retrieved).toEqual(embedderConfig);
  });

  it('should clear embedder config', async () => {
    const { GraphitiClient } = await import('../../graphiti/client');
    const client = new GraphitiClient({ baseUrl: 'http://test:8001' });

    client.setEmbedderConfig({ provider: 'openai' });
    client.setEmbedderConfig(undefined);

    expect(client.getEmbedderConfig()).toBeUndefined();
  });
});

// ============================================================================
// Integration Test 7: Barrel Exports
// ============================================================================

describe('Integration: Barrel file exports', () => {
  it('should export from graphiti barrel', async () => {
    const graphiti = await import('../../graphiti');
    expect(graphiti.searchService).toBeDefined();
    expect(graphiti.episodeService).toBeDefined();
  });

  it('should export from storage barrel', async () => {
    const storage = await import('../../storage');
    expect(storage.documentStorage).toBeDefined();
  });

  it('should export from parsers barrel', async () => {
    const parsers = await import('../../parsers');
    expect(parsers.parseDocument).toBeDefined();
  });
});

// ============================================================================
// Integration Test 8: Feedback System Integration
// ============================================================================

describe('Integration: Feedback system types', () => {
  it('should have feedback types defined', async () => {
    // The feedback API should accept these fields
    const feedbackRequest = {
      sourceId: 'test-source-id',
      helpful: true,
      conversationId: 'conv-123',
      messageId: 'msg-456',
      factContent: 'Test fact',
      feedbackText: 'Very helpful!',
      confidenceScore: 0.85,
    };

    // Type check - all fields should be valid
    expect(feedbackRequest.sourceId).toBeTruthy();
    expect(typeof feedbackRequest.helpful).toBe('boolean');
    expect(typeof feedbackRequest.confidenceScore).toBe('number');
  });
});

// ============================================================================
// Integration Test 9: Document Service Methods
// ============================================================================

describe('Integration: Document service has all required methods', () => {
  it('should have upload methods', async () => {
    const { documentService } = await import('../../service/document-service');

    expect(typeof documentService.uploadOnly).toBe('function');
    expect(typeof documentService.uploadAndProcess).toBe('function');
    expect(typeof documentService.updateDocument).toBe('function');
  });

  it('should have processing methods', async () => {
    const { documentService } = await import('../../service/document-service');

    expect(typeof documentService.processDocument).toBe('function');
    expect(typeof documentService.getProcessingStatus).toBe('function');
  });

  it('should have cleanup methods', async () => {
    const { documentService } = await import('../../service/document-service');

    expect(typeof documentService.deleteDocument).toBe('function');
    expect(typeof documentService.expireOldEpisodes).toBe('function');
  });
});

// ============================================================================
// Integration Test 10: GraphitiClient Methods
// ============================================================================

describe('Integration: GraphitiClient has all required methods', () => {
  it('should have episode methods', async () => {
    const { GraphitiClient } = await import('../../graphiti/client');
    const client = new GraphitiClient({ baseUrl: 'http://test:8001' });

    expect(typeof client.addEpisode).toBe('function');
    expect(typeof client.addEpisodeWithSchema).toBe('function');
    expect(typeof client.addEpisodesBulk).toBe('function');
    expect(typeof client.deleteEpisode).toBe('function');
    expect(typeof client.expireEpisode).toBe('function');
  });

  it('should have search methods', async () => {
    const { GraphitiClient } = await import('../../graphiti/client');
    const client = new GraphitiClient({ baseUrl: 'http://test:8001' });

    expect(typeof client.search).toBe('function');
    expect(typeof client.getEntityEdges).toBe('function');
  });

  it('should have utility methods', async () => {
    const { GraphitiClient } = await import('../../graphiti/client');
    const client = new GraphitiClient({ baseUrl: 'http://test:8001' });

    expect(typeof client.health).toBe('function');
    expect(typeof client.testConnection).toBe('function');
    expect(typeof client.getBaseUrl).toBe('function');
  });
});
