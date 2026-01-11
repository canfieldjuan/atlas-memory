/**
 * Document Storage Unit Tests
 * Tests for Supabase database operations for document tracking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentStorage } from '../../storage/document-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

// Helper to create mock Supabase client
function createMockSupabase(overrides: Partial<Record<string, unknown>> = {}) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
    ...overrides,
  };

  return {
    from: vi.fn(() => mockChain),
    _chain: mockChain,
  } as unknown as SupabaseClient & { _chain: typeof mockChain };
}

// Sample document record as returned from database
const sampleDocumentRecord = {
  id: 'doc-123',
  user_id: 'user-456',
  filename: 'test-document.pdf',
  file_type: 'pdf',
  upload_path: '/uploads/test-document.pdf',
  document_hash: 'abc123hash',
  content: 'Sample document content',
  processed: false,
  neo4j_episode_ids: [],
  metadata: { tags: ['test'] },
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  version: 1,
  parent_id: null,
};

describe('DocumentStorage', () => {
  let storage: DocumentStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DocumentStorage();
  });

  describe('findByHash', () => {
    it('should find document by hash', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: sampleDocumentRecord,
        error: null,
      });

      const result = await storage.findByHash(mockSupabase, 'user-456', 'abc123hash');

      expect(mockSupabase.from).toHaveBeenCalledWith('documents');
      expect(mockSupabase._chain.eq).toHaveBeenCalledWith('user_id', 'user-456');
      expect(mockSupabase._chain.eq).toHaveBeenCalledWith('document_hash', 'abc123hash');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('doc-123');
    });

    it('should return null when document not found', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await storage.findByHash(mockSupabase, 'user-456', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'Permission denied' },
      });

      await expect(
        storage.findByHash(mockSupabase, 'user-456', 'hash')
      ).rejects.toThrow('Failed to check for duplicate');
    });
  });

  describe('findLatestByFilename', () => {
    it('should find latest version of document', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: { ...sampleDocumentRecord, version: 3 },
        error: null,
      });

      const result = await storage.findLatestByFilename(
        mockSupabase,
        'user-456',
        'test-document.pdf'
      );

      expect(mockSupabase._chain.order).toHaveBeenCalledWith('version', { ascending: false });
      expect(mockSupabase._chain.limit).toHaveBeenCalledWith(1);
      expect(result?.version).toBe(3);
    });

    it('should return null when no versions exist', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await storage.findLatestByFilename(
        mockSupabase,
        'user-456',
        'nonexistent.pdf'
      );

      expect(result).toBeNull();
    });
  });

  describe('createDocument', () => {
    it('should create document successfully', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: sampleDocumentRecord,
        error: null,
      });

      const result = await storage.createDocument(mockSupabase, {
        userId: 'user-456',
        filename: 'test-document.pdf',
        fileType: 'pdf',
        uploadPath: '/uploads/test-document.pdf',
        documentHash: 'abc123hash',
        content: 'Sample content',
      });

      expect(mockSupabase._chain.insert).toHaveBeenCalled();
      expect(result.id).toBe('doc-123');
      expect(result.filename).toBe('test-document.pdf');
    });

    it('should throw DUPLICATE_DOCUMENT on hash conflict', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint on document_hash' },
      });

      await expect(
        storage.createDocument(mockSupabase, {
          userId: 'user-456',
          filename: 'test.pdf',
          fileType: 'pdf',
          uploadPath: '/uploads/test.pdf',
          documentHash: 'duplicate-hash',
          content: 'Content',
        })
      ).rejects.toThrow('DUPLICATE_DOCUMENT');
    });

    it('should create document with custom version', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: { ...sampleDocumentRecord, version: 2, parent_id: 'doc-parent' },
        error: null,
      });

      const result = await storage.createDocument(mockSupabase, {
        userId: 'user-456',
        filename: 'test.pdf',
        fileType: 'pdf',
        uploadPath: '/uploads/test.pdf',
        documentHash: 'newhash',
        content: 'Content',
        version: 2,
        parentId: 'doc-parent',
      });

      expect(result.version).toBe(2);
      expect(result.parentId).toBe('doc-parent');
    });
  });

  describe('getDocument', () => {
    it('should retrieve document by ID', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: sampleDocumentRecord,
        error: null,
      });

      const result = await storage.getDocument(mockSupabase, 'doc-123');

      expect(mockSupabase._chain.eq).toHaveBeenCalledWith('id', 'doc-123');
      expect(result?.id).toBe('doc-123');
    });

    it('should return null for non-existent document', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await storage.getDocument(mockSupabase, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateDocument', () => {
    it('should update document processed status', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: { ...sampleDocumentRecord, processed: true },
        error: null,
      });

      const result = await storage.updateDocument(mockSupabase, 'doc-123', {
        processed: true,
      });

      expect(mockSupabase._chain.update).toHaveBeenCalled();
      expect(result.processed).toBe(true);
    });

    it('should update episode IDs', async () => {
      const episodeIds = ['ep-1', 'ep-2', 'ep-3'];
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: { ...sampleDocumentRecord, neo4j_episode_ids: episodeIds },
        error: null,
      });

      const result = await storage.updateDocument(mockSupabase, 'doc-123', {
        neo4jEpisodeIds: episodeIds,
      });

      expect(result.neo4jEpisodeIds).toEqual(episodeIds);
    });
  });

  describe('updateProcessingStatus', () => {
    it('should update both processed flag and episode IDs', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: {
          ...sampleDocumentRecord,
          processed: true,
          neo4j_episode_ids: ['ep-1'],
        },
        error: null,
      });

      await storage.updateProcessingStatus(
        mockSupabase,
        'doc-123',
        true,
        ['ep-1']
      );

      expect(mockSupabase._chain.update).toHaveBeenCalled();
    });
  });

  describe('deleteDocument', () => {
    it('should delete document successfully', async () => {
      const mockSupabase = createMockSupabase();
      // For delete, we need to mock the chain differently
      const deleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      mockSupabase.from = vi.fn(() => deleteChain) as unknown as typeof mockSupabase.from;

      await storage.deleteDocument(mockSupabase, 'doc-123');

      expect(deleteChain.delete).toHaveBeenCalled();
      expect(deleteChain.eq).toHaveBeenCalledWith('id', 'doc-123');
    });

    it('should throw error on delete failure', async () => {
      const mockSupabase = createMockSupabase();
      const deleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: 'Delete failed' } }),
      };
      mockSupabase.from = vi.fn(() => deleteChain) as unknown as typeof mockSupabase.from;

      await expect(
        storage.deleteDocument(mockSupabase, 'doc-123')
      ).rejects.toThrow('Failed to delete document');
    });
  });

  describe('getDocumentCount', () => {
    it('should return document count for user', async () => {
      const mockSupabase = createMockSupabase();
      const countChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
      };
      mockSupabase.from = vi.fn(() => countChain) as unknown as typeof mockSupabase.from;

      const count = await storage.getDocumentCount(mockSupabase, 'user-456');

      expect(countChain.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(count).toBe(5);
    });

    it('should return 0 when count is null', async () => {
      const mockSupabase = createMockSupabase();
      const countChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: null, error: null }),
      };
      mockSupabase.from = vi.fn(() => countChain) as unknown as typeof mockSupabase.from;

      const count = await storage.getDocumentCount(mockSupabase, 'user-456');

      expect(count).toBe(0);
    });
  });

  describe('getProcessedCount', () => {
    it('should return count of processed documents', async () => {
      const mockSupabase = createMockSupabase();
      const countChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      // Need to handle two eq calls
      let eqCallCount = 0;
      countChain.eq = vi.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount === 2) {
          return Promise.resolve({ count: 3, error: null });
        }
        return countChain;
      });
      mockSupabase.from = vi.fn(() => countChain) as unknown as typeof mockSupabase.from;

      const count = await storage.getProcessedCount(mockSupabase, 'user-456');

      expect(count).toBe(3);
    });
  });

  describe('searchDocuments', () => {
    it('should search documents by filename pattern', async () => {
      const mockSupabase = createMockSupabase();
      const searchChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [sampleDocumentRecord],
          error: null,
        }),
      };
      mockSupabase.from = vi.fn(() => searchChain) as unknown as typeof mockSupabase.from;

      const results = await storage.searchDocuments(mockSupabase, 'user-456', 'test');

      expect(searchChain.ilike).toHaveBeenCalledWith('filename', '%test%');
      expect(results.length).toBe(1);
    });
  });

  describe('Document Mapping', () => {
    it('should correctly map database record to Document type', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: sampleDocumentRecord,
        error: null,
      });

      const result = await storage.getDocument(mockSupabase, 'doc-123');

      expect(result).toEqual({
        id: 'doc-123',
        userId: 'user-456',
        filename: 'test-document.pdf',
        fileType: 'pdf',
        uploadPath: '/uploads/test-document.pdf',
        documentHash: 'abc123hash',
        content: 'Sample document content',
        processed: false,
        neo4jEpisodeIds: [],
        createdAt: expect.any(Date),
        metadata: { tags: ['test'] },
        version: 1,
        parentId: null,
      });
    });

    it('should handle missing neo4j_episode_ids gracefully', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: { ...sampleDocumentRecord, neo4j_episode_ids: null },
        error: null,
      });

      const result = await storage.getDocument(mockSupabase, 'doc-123');

      expect(result?.neo4jEpisodeIds).toEqual([]);
    });

    it('should handle missing metadata gracefully', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase._chain.single.mockResolvedValue({
        data: { ...sampleDocumentRecord, metadata: null },
        error: null,
      });

      const result = await storage.getDocument(mockSupabase, 'doc-123');

      expect(result?.metadata).toEqual({});
    });
  });
});
