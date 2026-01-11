/**
 * Document Storage Service
 * Handles Supabase database operations for document tracking
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Document,
  DocumentFileType,
  DocumentMetadata,
  CreateDocumentData,
  UpdateDocumentData,
} from '../types';

/**
 * Database record type from Supabase
 */
interface DocumentRecord {
  id: string;
  user_id: string;
  filename: string;
  file_type: string;
  upload_path: string;
  document_hash: string;
  content?: string; // Optional when excluded from query for performance
  processed: boolean;
  neo4j_episode_ids: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  version: number;
  parent_id: string | null;
}

// ============================================================================
// Document Storage Service
// ============================================================================

export class DocumentStorage {
  /**
   * Check if document with same hash already exists
   */
  async findByHash(supabase: SupabaseClient, userId: string, hash: string): Promise<Document | null> {
    const { data: document, error } = await supabase
      .from('documents')
      .select()
      .eq('user_id', userId)
      .eq('document_hash', hash)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to check for duplicate: ${error.message}`);
    }

    return document ? this.mapToDocument(document) : null;
  }

  /**
   * Find the latest version of a document by filename
   */
  async findLatestByFilename(
    supabase: SupabaseClient,
    userId: string,
    filename: string
  ): Promise<Document | null> {
    const { data: document, error } = await supabase
      .from('documents')
      .select()
      .eq('user_id', userId)
      .eq('filename', filename)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to find latest document version: ${error.message}`);
    }

    return document ? this.mapToDocument(document) : null;
  }

  /**
   * Get all versions of a document (newest first)
   */
  async getVersionHistory(
    supabase: SupabaseClient,
    userId: string,
    filename: string
  ): Promise<Document[]> {
    const { data: documents, error } = await supabase
      .from('documents')
      .select()
      .eq('user_id', userId)
      .eq('filename', filename)
      .order('version', { ascending: false });

    if (error) {
      throw new Error(`Failed to get version history: ${error.message}`);
    }

    return documents.map(doc => this.mapToDocument(doc));
  }

  /**
   * Create a new document record
   */
  async createDocument(supabase: SupabaseClient, data: CreateDocumentData): Promise<Document> {
    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        user_id: data.userId,
        filename: data.filename,
        file_type: data.fileType,
        upload_path: data.uploadPath,
        document_hash: data.documentHash,
        content: data.content,
        processed: false,
        neo4j_episode_ids: [],
        metadata: data.metadata || {},
        version: data.version || 1,
        parent_id: data.parentId || null,
      })
      .select()
      .single();

    if (error) {
      // Check for duplicate key constraint violation
      if (error.code === '23505' && error.message.includes('document_hash')) {
        throw new Error('DUPLICATE_DOCUMENT');
      }
      throw new Error(`Failed to create document: ${error.message}`);
    }

    if (!document) {
      throw new Error('Document creation returned no data');
    }

    return this.mapToDocument(document);
  }

  /**
   * Get document by ID
   */
  async getDocument(supabase: SupabaseClient, documentId: string): Promise<Document | null> {
    const { data: document, error } = await supabase
      .from('documents')
      .select()
      .eq('id', documentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get document: ${error.message}`);
    }

    return document ? this.mapToDocument(document) : null;
  }

  /**
   * Get all documents for a user (excluding content field for performance)
   */
  async getUserDocuments(supabase: SupabaseClient, userId: string): Promise<Document[]> {
    console.log('[DocumentStorage] getUserDocuments called for user:', userId);
    const startTime = Date.now();

    try {
      // ULTRA MINIMAL TEST: Just ID and filename
      console.log('[DocumentStorage] Testing minimal query (id, filename only)...');
      const minimalStart = Date.now();
      const minimalTest = await supabase
        .from('documents')
        .select('id, filename')
        .eq('user_id', userId)
        .limit(10);

      const minimalDuration = Date.now() - minimalStart;
      console.log(`[DocumentStorage] Minimal query completed in ${minimalDuration}ms`);

      if (minimalTest.error) {
        console.error('[DocumentStorage] Even minimal query failed!', minimalTest.error);
      } else {
        console.log(`[DocumentStorage] Minimal query succeeded: ${minimalTest.data?.length || 0} docs`);
      }

      // Query with all essential fields INCLUDING neo4j_episode_ids for status tracking
      console.log('[DocumentStorage] Fetching documents with all essential fields...');
      const queryStart = Date.now();
      const result = await supabase
        .from('documents')
        .select('id, user_id, filename, file_type, upload_path, document_hash, processed, neo4j_episode_ids, version, parent_id, created_at, updated_at, metadata')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      const queryDuration = Date.now() - queryStart;
      console.log(`[DocumentStorage] Query completed in ${queryDuration}ms`);

      if (result.error) {
        console.error('[DocumentStorage] Query failed:', result.error);
        throw new Error(`Failed to get user documents: ${result.error.message}`);
      }

      console.log(`[DocumentStorage] Query succeeded, retrieved ${result.data?.length || 0} documents`);

      // Check for null/undefined data
      if (!result.data) {
        console.warn('[DocumentStorage] Query returned null data');
        return [];
      }

      // Map results with empty metadata (excluded for performance)
      const documents = result.data.map((doc) => ({
        ...doc,
        metadata: {}
      }));

      const duration = Date.now() - startTime;
      console.log(`[DocumentStorage] Total operation completed in ${duration}ms`);

      return documents.map((doc: DocumentRecord) => this.mapToDocument(doc));
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error('[DocumentStorage] Exception in getUserDocuments:', {
        error: err,
        userId,
        duration: `${duration}ms`
      });
      throw err;
    }
  }

  /**
   * Update document
   */
  async updateDocument(
    supabase: SupabaseClient,
    documentId: string,
    data: UpdateDocumentData
  ): Promise<Document> {
    const updateData: Record<string, unknown> = {};

    if (data.processed !== undefined) {
      updateData.processed = data.processed;
    }
    if (data.neo4jEpisodeIds !== undefined) {
      updateData.neo4j_episode_ids = data.neo4jEpisodeIds;
    }
    if (data.metadata !== undefined) {
      updateData.metadata = data.metadata;
    }

    const { data: document, error } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update document: ${error.message}`);
    }

    return this.mapToDocument(document);
  }

  /**
   * Update processing status
   */
  async updateProcessingStatus(
    supabase: SupabaseClient,
    documentId: string,
    processed: boolean,
    episodeIds: string[]
  ): Promise<void> {
    await this.updateDocument(supabase, documentId, {
      processed,
      neo4jEpisodeIds: episodeIds,
    });
  }

  /**
   * Delete document
   */
  async deleteDocument(supabase: SupabaseClient, documentId: string): Promise<void> {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (error) {
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  }

  /**
   * Get document count for user
   */
  async getDocumentCount(supabase: SupabaseClient, userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to get document count: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Get processed document count for user
   */
  async getProcessedCount(supabase: SupabaseClient, userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('processed', true);

    if (error) {
      throw new Error(`Failed to get processed count: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Get documents by file type
   */
  async getDocumentsByType(
    supabase: SupabaseClient,
    userId: string,
    fileType: string
  ): Promise<Document[]> {
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .eq('file_type', fileType)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get documents by type: ${error.message}`);
    }

    return documents.map(doc => this.mapToDocument(doc));
  }

  /**
   * Search documents by filename
   */
  async searchDocuments(supabase: SupabaseClient, userId: string, searchTerm: string): Promise<Document[]> {
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .ilike('filename', `%${searchTerm}%`)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to search documents: ${error.message}`);
    }

    return documents.map(doc => this.mapToDocument(doc));
  }

  /**
   * Map database record to Document type
   */
  private mapToDocument(record: DocumentRecord): Document {
    return {
      id: record.id,
      userId: record.user_id,
      filename: record.filename,
      fileType: record.file_type as DocumentFileType,
      uploadPath: record.upload_path,
      documentHash: record.document_hash,
      content: record.content,
      processed: record.processed,
      neo4jEpisodeIds: record.neo4j_episode_ids || [],
      createdAt: new Date(record.created_at),
      metadata: (record.metadata || {}) as DocumentMetadata,
      version: record.version,
      parentId: record.parent_id,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const documentStorage = new DocumentStorage();
