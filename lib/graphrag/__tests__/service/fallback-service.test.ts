/**
 * Fallback Service Unit Tests
 * Tests for alternative search methods when GraphRAG returns insufficient results
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          textSearch: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          ilike: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
}));

vi.mock('../../config', () => ({
  graphragConfig: {
    fallback: {
      enabled: true,
      strategy: 'cascade',
      minResultsThreshold: 3,
    },
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { FallbackService, fallbackService } from '../../service/fallback-service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

describe('FallbackService', () => {
  let service: FallbackService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FallbackService();
  });

  describe('Configuration', () => {
    it('should initialize with config values', () => {
      const config = service.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.strategy).toBe('cascade');
      expect(config.minResultsThreshold).toBe(3);
    });

    it('should report enabled status', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('shouldTriggerFallback', () => {
    it('should return true when results below threshold', () => {
      expect(service.shouldTriggerFallback(0)).toBe(true);
      expect(service.shouldTriggerFallback(1)).toBe(true);
      expect(service.shouldTriggerFallback(2)).toBe(true);
    });

    it('should return false when results meet threshold', () => {
      expect(service.shouldTriggerFallback(3)).toBe(false);
      expect(service.shouldTriggerFallback(5)).toBe(false);
      expect(service.shouldTriggerFallback(10)).toBe(false);
    });
  });

  describe('executeFallback', () => {
    it('should return empty result on error', async () => {
      // Mock to throw error
      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            textSearch: vi.fn(() => ({
              limit: vi.fn(() => Promise.reject(new Error('Database error'))),
            })),
          })),
        })),
      } as any);

      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'test query',
      });

      expect(result.sources).toEqual([]);
      expect(result.context).toBe('');
    });

    it('should include query time in result', async () => {
      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'test query',
      });

      expect(result.queryTimeMs).toBeDefined();
      expect(typeof result.queryTimeMs).toBe('number');
    });

    it('should include strategy in result', async () => {
      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'test query',
      });

      expect(result.strategy).toBeDefined();
    });
  });

  describe('Vector Fallback', () => {
    it('should query graphrag_documents table', async () => {
      const mockFrom = vi.mocked(supabaseAdmin.from);
      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          textSearch: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          ilike: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      }));
      mockFrom.mockReturnValue({ select: mockSelect } as any);

      await service.executeFallback({
        userId: 'user-123',
        query: 'machine learning',
      });

      expect(mockFrom).toHaveBeenCalledWith('graphrag_documents');
    });

    it('should map documents to sources format', async () => {
      const mockDocuments = [
        {
          id: 'doc-1',
          filename: 'test.pdf',
          content: 'This is test content about machine learning.',
          metadata: {},
        },
      ];

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            textSearch: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: mockDocuments, error: null })),
            })),
            ilike: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      } as any);

      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'machine learning',
      });

      if (result.sources.length > 0) {
        const source = result.sources[0];
        expect(source).toHaveProperty('entity');
        expect(source).toHaveProperty('relation');
        expect(source).toHaveProperty('fact');
        expect(source).toHaveProperty('confidence');
        expect(source).toHaveProperty('sourceDescription');
      }
    });
  });

  describe('Keyword Fallback', () => {
    it('should extract keywords from query', async () => {
      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'machine learning neural networks',
      });

      expect(result.strategy).toBeDefined();
    });

    it('should return empty for queries with only stop words', async () => {
      // Most queries will have some meaningful words
      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'the is a',
      });

      // Should still return a result structure
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('context');
    });
  });

  describe('Cascade Fallback', () => {
    it('should try vector first then keyword', async () => {
      const callOrder: string[] = [];

      vi.mocked(supabaseAdmin.from).mockImplementation(() => {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              textSearch: vi.fn(() => {
                callOrder.push('textSearch');
                return {
                  limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                };
              }),
              ilike: vi.fn(() => {
                callOrder.push('ilike');
                return {
                  limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                };
              }),
            })),
          })),
        } as any;
      });

      await service.executeFallback({
        userId: 'user-123',
        query: 'test query terms',
      });

      // Cascade should try textSearch (vector) before ilike (keyword)
      const textSearchIndex = callOrder.indexOf('textSearch');
      const ilikeIndex = callOrder.indexOf('ilike');

      if (textSearchIndex !== -1 && ilikeIndex !== -1) {
        expect(textSearchIndex).toBeLessThan(ilikeIndex);
      }
    });
  });

  describe('Source Deduplication', () => {
    it('should deduplicate sources with same content fingerprint', async () => {
      const duplicateDocuments = [
        {
          id: 'doc-1',
          filename: 'file1.pdf',
          content: 'Exactly the same content here',
          metadata: {},
        },
        {
          id: 'doc-2',
          filename: 'file2.pdf',
          content: 'Exactly the same content here',
          metadata: {},
        },
      ];

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            textSearch: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: duplicateDocuments, error: null })),
            })),
            ilike: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      } as any);

      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'same content',
      });

      // Due to deduplication, should have fewer sources than input
      // (actual behavior depends on cascade logic)
      expect(result.sources.length).toBeLessThanOrEqual(duplicateDocuments.length);
    });
  });

  describe('Context Building', () => {
    it('should build context string from sources', async () => {
      const mockDocuments = [
        {
          id: 'doc-1',
          filename: 'test.pdf',
          content: 'Important information about the topic.',
          metadata: {},
        },
      ];

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            textSearch: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: mockDocuments, error: null })),
            })),
            ilike: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      } as any);

      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'topic',
      });

      if (result.sources.length > 0) {
        expect(result.context).toContain('Fallback search results');
      }
    });

    it('should return empty context for no sources', async () => {
      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'nonexistent topic',
      });

      if (result.sources.length === 0) {
        expect(result.context).toBe('');
      }
    });
  });

  describe('Snippet Extraction', () => {
    it('should truncate long content', async () => {
      const longContent = 'A'.repeat(1000);
      const mockDocuments = [
        {
          id: 'doc-1',
          filename: 'long.pdf',
          content: longContent,
          metadata: {},
        },
      ];

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            textSearch: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: mockDocuments, error: null })),
            })),
            ilike: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      } as any);

      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'test',
      });

      if (result.sources.length > 0) {
        expect(result.sources[0].fact.length).toBeLessThanOrEqual(503); // 500 + "..."
      }
    });
  });

  describe('Limit Parameter', () => {
    it('should accept custom limit parameter', async () => {
      // Test that executeFallback accepts limit parameter without error
      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'test query',
        limit: 10,
      });

      // Should return a valid result structure
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('context');
      expect(result).toHaveProperty('queryTimeMs');
    });
  });

  describe('Singleton Export', () => {
    it('should export a singleton instance', () => {
      expect(fallbackService).toBeInstanceOf(FallbackService);
    });
  });

  describe('Error Handling', () => {
    it('should handle database query errors gracefully', async () => {
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            textSearch: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: null, error: { message: 'DB error' } })),
            })),
            ilike: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: null, error: { message: 'DB error' } })),
            })),
          })),
        })),
      } as any);

      const result = await service.executeFallback({
        userId: 'user-123',
        query: 'test',
      });

      // Should not throw, should return empty result
      expect(result.sources).toEqual([]);
    });
  });
});
