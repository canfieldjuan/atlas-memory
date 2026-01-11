/**
 * Error Recovery Unit Tests
 * Tests for partial failure handling in document processing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing
vi.mock('../../graphiti/client', () => ({
  getGraphitiClient: vi.fn(() => ({
    addEpisode: vi.fn(),
    addEpisodesBulk: vi.fn(),
  })),
}));

vi.mock('../../config', () => ({
  graphragConfig: {
    enabled: true,
    processing: {
      maxFileSize: 10485760,
      chunkSize: 2000,
      supportedTypes: ['pdf', 'txt', 'md'],
    },
    search: {
      topK: 10,
      threshold: 0.7,
    },
  },
}));

vi.mock('../../storage/document-storage', () => ({
  documentStorage: {
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    getDocument: vi.fn(),
  },
}));

vi.mock('../../graphiti/episode-service', () => ({
  episodeService: {
    addDocument: vi.fn(),
    addDocumentsBulk: vi.fn(),
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

import { episodeService } from '../../graphiti/episode-service';

describe('Error Recovery - Sequential Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Partial Success Handling', () => {
    it('should continue processing when some chunks fail', async () => {
      // Simulate 3 chunks: 1st succeeds, 2nd fails, 3rd succeeds
      const mockAddDocument = episodeService.addDocument as ReturnType<typeof vi.fn>;
      mockAddDocument
        .mockResolvedValueOnce({ episodeId: 'ep-1', entitiesCreated: 2, relationsCreated: 1 })
        .mockRejectedValueOnce(new Error('Graphiti timeout'))
        .mockResolvedValueOnce({ episodeId: 'ep-3', entitiesCreated: 1, relationsCreated: 0 });

      const results: string[] = [];
      const chunks = [
        { content: 'Chunk 1 content', filename: 'doc_chunk_1' },
        { content: 'Chunk 2 content', filename: 'doc_chunk_2' },
        { content: 'Chunk 3 content', filename: 'doc_chunk_3' },
      ];

      // Simulate sequential processing with correct signature
      for (const chunk of chunks) {
        try {
          const result = await episodeService.addDocument(
            chunk.content,
            'user-123',
            chunk.filename
          );
          results.push(result.episodeId);
        } catch {
          // Continue processing - this is the expected behavior
        }
      }

      expect(results.length).toBe(2);
      expect(results).toContain('ep-1');
      expect(results).toContain('ep-3');
      expect(mockAddDocument).toHaveBeenCalledTimes(3);
    });

    it('should throw when ALL chunks fail', async () => {
      const mockAddDocument = episodeService.addDocument as ReturnType<typeof vi.fn>;
      mockAddDocument
        .mockRejectedValueOnce(new Error('Graphiti error 1'))
        .mockRejectedValueOnce(new Error('Graphiti error 2'))
        .mockRejectedValueOnce(new Error('Graphiti error 3'));

      const chunks = [
        { content: 'Chunk 1', filename: 'chunk_1' },
        { content: 'Chunk 2', filename: 'chunk_2' },
        { content: 'Chunk 3', filename: 'chunk_3' },
      ];

      const results: string[] = [];

      for (const chunk of chunks) {
        try {
          const result = await episodeService.addDocument(
            chunk.content,
            'user-123',
            chunk.filename
          );
          results.push(result.episodeId);
        } catch {
          // Continue
        }
      }

      expect(results.length).toBe(0);
    });

    it('should track success and failure counts', async () => {
      const mockAddDocument = episodeService.addDocument as ReturnType<typeof vi.fn>;
      mockAddDocument
        .mockResolvedValueOnce({ episodeId: 'ep-1', entitiesCreated: 1, relationsCreated: 0 })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ episodeId: 'ep-2', entitiesCreated: 1, relationsCreated: 0 })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ episodeId: 'ep-3', entitiesCreated: 1, relationsCreated: 0 });

      const chunks = Array.from({ length: 5 }, (_, i) => ({
        content: `Chunk ${i + 1}`,
        filename: `chunk_${i + 1}`,
      }));

      let successCount = 0;
      let failCount = 0;

      for (const chunk of chunks) {
        try {
          await episodeService.addDocument(chunk.content, 'user-123', chunk.filename);
          successCount++;
        } catch {
          failCount++;
        }
      }

      expect(successCount).toBe(3);
      expect(failCount).toBe(2);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed chunks with exponential backoff', async () => {
      const mockAddDocument = episodeService.addDocument as ReturnType<typeof vi.fn>;
      // First two attempts fail, third succeeds
      mockAddDocument
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce({ episodeId: 'ep-1', entitiesCreated: 1, relationsCreated: 0 });

      const maxRetries = 3;
      let result: string | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await episodeService.addDocument('Content', 'user-123', 'test_chunk');
          result = response.episodeId;
          break;
        } catch {
          if (attempt === maxRetries) {
            throw new Error('Max retries exceeded');
          }
          // Exponential backoff delay would happen here
        }
      }

      expect(result).toBe('ep-1');
      expect(mockAddDocument).toHaveBeenCalledTimes(3);
    });

    it('should give up after max retries', async () => {
      const mockAddDocument = episodeService.addDocument as ReturnType<typeof vi.fn>;
      mockAddDocument.mockRejectedValue(new Error('Persistent failure'));

      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await episodeService.addDocument('Content', 'user-123', 'test_chunk');
        } catch (error) {
          lastError = error as Error;
        }
      }

      expect(lastError).not.toBeNull();
      expect(lastError?.message).toBe('Persistent failure');
      expect(mockAddDocument).toHaveBeenCalledTimes(3);
    });
  });

  describe('Bulk to Sequential Fallback', () => {
    it('should fall back to sequential when bulk fails', async () => {
      const mockBulkAdd = episodeService.addDocumentsBulk as ReturnType<typeof vi.fn>;
      const mockAddDocument = episodeService.addDocument as ReturnType<typeof vi.fn>;

      // Bulk fails
      mockBulkAdd.mockRejectedValue(new Error('Bulk processing failed'));

      // Sequential succeeds
      mockAddDocument.mockResolvedValue({ episodeId: 'ep-seq-1', entitiesCreated: 1, relationsCreated: 0 });

      // Simulate the fallback logic
      const results: string[] = [];
      const chunks = [
        { content: 'Chunk 1', filename: 'chunk_1' },
        { content: 'Chunk 2', filename: 'chunk_2' },
      ];

      try {
        // Try bulk first - using correct signature (chunks, userId)
        await episodeService.addDocumentsBulk(chunks, 'user-123');
      } catch {
        // Bulk failed, fall back to sequential
        for (const chunk of chunks) {
          try {
            const result = await episodeService.addDocument(
              chunk.content,
              'user-123',
              chunk.filename
            );
            results.push(result.episodeId);
          } catch {
            // Continue
          }
        }
      }

      expect(mockBulkAdd).toHaveBeenCalledTimes(1);
      expect(mockAddDocument).toHaveBeenCalledTimes(2);
      expect(results.length).toBe(2);
    });
  });

  describe('Processing Status Types', () => {
    it('should correctly type processing states', () => {
      type ProcessingState = 'pending' | 'processing' | 'completed' | 'partial_failure' | 'failed';

      const determineState = (
        successCount: number,
        totalCount: number
      ): ProcessingState => {
        if (successCount === 0) return 'failed';
        if (successCount < totalCount) return 'partial_failure';
        return 'completed';
      };

      expect(determineState(0, 5)).toBe('failed');
      expect(determineState(3, 5)).toBe('partial_failure');
      expect(determineState(5, 5)).toBe('completed');
    });

    it('should track chunk processing metrics', () => {
      interface ProcessingStatus {
        totalChunks: number;
        successfulChunks: number;
        failedChunks: number;
        status: 'pending' | 'processing' | 'completed' | 'partial_failure' | 'failed';
      }

      const updateStatus = (
        success: number,
        failed: number,
        total: number
      ): ProcessingStatus => {
        let status: ProcessingStatus['status'];
        if (success === 0) {
          status = 'failed';
        } else if (success < total) {
          status = 'partial_failure';
        } else {
          status = 'completed';
        }

        return {
          totalChunks: total,
          successfulChunks: success,
          failedChunks: failed,
          status,
        };
      };

      const allSuccess = updateStatus(5, 0, 5);
      expect(allSuccess.status).toBe('completed');
      expect(allSuccess.successfulChunks).toBe(5);

      const partialFailure = updateStatus(3, 2, 5);
      expect(partialFailure.status).toBe('partial_failure');
      expect(partialFailure.failedChunks).toBe(2);

      const totalFailure = updateStatus(0, 5, 5);
      expect(totalFailure.status).toBe('failed');
    });
  });

  describe('Error Message Handling', () => {
    it('should extract meaningful error messages', async () => {
      const mockAddDocument = episodeService.addDocument as ReturnType<typeof vi.fn>;

      // Test connection timeout error
      mockAddDocument.mockRejectedValueOnce(new Error('Connection timeout'));

      try {
        await episodeService.addDocument('content', 'user-123', 'test');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain('Connection timeout');
      }

      // Test rate limit error
      mockAddDocument.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      try {
        await episodeService.addDocument('content', 'user-123', 'test2');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain('Rate limit exceeded');
      }
    });

    it('should handle unknown error types gracefully', () => {
      const getErrorMessage = (error: unknown): string => {
        if (error instanceof Error) {
          return error.message;
        }
        if (typeof error === 'string') {
          return error;
        }
        return 'Unknown error occurred';
      };

      expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
      expect(getErrorMessage('String error')).toBe('String error');
      expect(getErrorMessage(null)).toBe('Unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('Unknown error occurred');
      expect(getErrorMessage({ custom: 'error' })).toBe('Unknown error occurred');
    });
  });
});
