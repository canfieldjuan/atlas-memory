/**
 * Document Service
 * Orchestrates the complete document upload and processing workflow
 * Integrates: Storage + Parsers + Graphiti
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { documentStorage } from '../storage';
import { parseDocument } from '../parsers';
import { episodeService } from '../graphiti';
import { getGraphitiClient } from '../graphiti/client';
import { graphragConfig } from '../config';
import type {
  Document,
  DocumentFileType,
  UploadResponse,
  ProcessingStatus,
} from '../types';
import type { CodeParseResult } from '../parsers/code-parser';

// ============================================================================
// Types
// ============================================================================

export interface UploadOptions {
  userId: string;
  file: File;
  metadata?: Record<string, unknown>;
}

export interface ProcessingOptions {
  maxRetries?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  maxChunkChars?: number;
  groupId?: string;
}

export interface DeleteOptions {
  deleteFromStorage?: boolean;
  deleteFromNeo4j?: boolean;
}

// ============================================================================
// Document Service
// ============================================================================

export class DocumentService {
  private readonly STORAGE_BUCKET = 'documents';
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly DEFAULT_CHUNK_SIZE = graphragConfig.processing.chunkSize;
  private readonly MAX_CHUNK_CHARS = graphragConfig.processing.maxChunkChars;
  private readonly CHUNK_OVERLAP = graphragConfig.processing.chunkOverlap;

  // Per-request overrides (set during processDocument)
  private currentChunkOverlap: number = this.CHUNK_OVERLAP;
  private currentMaxChunkChars: number = this.MAX_CHUNK_CHARS;

  /**
   * Upload a document without processing (async processing)
   * Workflow: Upload → Parse → Store (returns immediately, process separately)
   */
  async uploadOnly(
    supabase: SupabaseClient,
    options: UploadOptions
  ): Promise<Document> {
    const { userId, file, metadata = {} } = options;

    // Validate file
    this.validateFile(file);

    let uploadPath = '';

    try {
      // Step 1: Upload to Supabase Storage
      uploadPath = await this.uploadToStorage(supabase, userId, file);

      // Step 2: Generate document hash
      const fileBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const documentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      console.log(`[GraphRAG] Document hash: ${documentHash}`);

      // Step 2.5: Check if document with same filename exists
      const existingDoc = await documentStorage.findLatestByFilename(
        supabase,
        userId,
        file.name
      );

      // If file with same name exists, suggest using updateDocument instead
      if (existingDoc) {
        console.log(
          `[GraphRAG] Document with filename already exists (version ${existingDoc.version})`
        );
        // Cleanup uploaded file
        await this.deleteFromStorage(supabase, uploadPath);
        throw new Error('DOCUMENT_EXISTS_USE_UPDATE');
      }

      // Step 3: Parse file content
      let parseResult;
      try {
        parseResult = await parseDocument(file, file.name);
      } catch (parseError) {
        throw new Error(
          `Failed to parse document: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        );
      }

      if (!parseResult.text) {
        throw new Error('Parsed document has no text content');
      }

      // Step 4: Create document record (processed=false)
      const fileType = this.getFileType(file.name);
      const document = await documentStorage.createDocument(supabase, {
        userId,
        filename: file.name,
        fileType,
        uploadPath,
        documentHash,
        content: parseResult.text,
        metadata: {
          ...metadata,
          userId,
          filename: file.name,
          documentName: file.name,
          fileSize: file.size,
        },
      });

      return document;
    } catch (error) {
      // Check for document exists error
      if (error instanceof Error && error.message === 'DOCUMENT_EXISTS_USE_UPDATE') {
        console.log(`[GraphRAG] Document exists, suggest using updateDocument`);
        // Cleanup already done before throwing
        throw new Error('DOCUMENT_EXISTS_USE_UPDATE');
      }

      // Cleanup on failure
      if (uploadPath) {
        await this.deleteFromStorage(supabase, uploadPath);
      }

      throw new Error(
        `Failed to upload document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Upload and process a document
   * Complete workflow: Upload → Parse → Process → Update
   */
  async uploadAndProcess(
    supabase: SupabaseClient,
    options: UploadOptions,
    processingOptions: ProcessingOptions = {}
  ): Promise<UploadResponse> {
    const { userId, file, metadata = {} } = options;
    const {
      maxRetries = this.DEFAULT_MAX_RETRIES,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      chunkSize = this.DEFAULT_CHUNK_SIZE,
      groupId = userId,
    } = processingOptions;

    // Validate file
    this.validateFile(file);

    let document: Document | null = null;
    let uploadPath = '';

    try {
      // Step 1: Upload to Supabase Storage
      uploadPath = await this.uploadToStorage(supabase, userId, file);

      // Step 2: Generate document hash
      const fileBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const documentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      console.log(`[GraphRAG] Document hash: ${documentHash}`);

      // Step 2.5: Check if document with same filename exists
      const existingDoc = await documentStorage.findLatestByFilename(
        supabase,
        userId,
        file.name
      );

      // If file with same name exists, suggest using updateDocument instead
      if (existingDoc) {
        console.log(
          `[GraphRAG] Document with filename already exists (version ${existingDoc.version})`
        );
        // Cleanup uploaded file
        await this.deleteFromStorage(supabase, uploadPath);
        throw new Error('DOCUMENT_EXISTS_USE_UPDATE');
      }

      // Step 3: Parse file content
      let parseResult;
      try {
        parseResult = await parseDocument(file, file.name);
      } catch (parseError) {
        throw new Error(
          `Failed to parse document: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        );
      }

      if (!parseResult.text) {
        throw new Error('Parsed document has no text content');
      }

      // Step 4: Create document record with content
      const fileType = this.getFileType(file.name);
      document = await documentStorage.createDocument(supabase, {
        userId,
        filename: file.name,
        fileType,
        uploadPath,
        documentHash,
        content: parseResult.text,
        metadata: {
          ...metadata,
          userId,
          filename: file.name,
          documentName: file.name,
          fileSize: file.size,
        },
      });

      // Step 5: Process with Graphiti using single episode (like promote conversation)
      console.log(`[GraphRAG] Processing via uploadAndProcess: "${document.filename}"`);
      console.log(`[GraphRAG] Content length: ${parseResult.text.length} characters`);

      const episodeIds = await this.processAsSingleEpisode(
        parseResult.text,
        groupId,
        document.filename,
        maxRetries
      );

      // Step 6: Update document processing status
      await documentStorage.updateProcessingStatus(supabase, document.id, true, episodeIds);

      // Refresh document to get updated data
      const updatedDocument = await documentStorage.getDocument(supabase, document.id);

      return {
        document: updatedDocument || document,
        message: `Successfully uploaded and processed ${file.name}`,
      };
    } catch (error) {
      // Check for document exists error
      if (error instanceof Error && error.message === 'DOCUMENT_EXISTS_USE_UPDATE') {
        console.log(`[GraphRAG] Document exists, suggest using updateDocument`);
        // Cleanup already done before throwing
        throw new Error('DOCUMENT_EXISTS_USE_UPDATE');
      }

      // Cleanup on failure
      if (document) {
        await this.cleanupFailedUpload(supabase, document.id, uploadPath);
      } else if (uploadPath) {
        await this.deleteFromStorage(supabase, uploadPath);
      }

      throw new Error(
        `Failed to upload and process document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Process an existing document
   * For re-processing or processing previously uploaded files
   */
  async processDocument(
    supabase: SupabaseClient,
    documentId: string,
    processingOptions: ProcessingOptions = {}
  ): Promise<ProcessingStatus> {
    console.log(`[DocumentService] ===== PROCESS DOCUMENT START =====`);
    console.log(`[DocumentService] Document ID: ${documentId}`);
    console.log(`[DocumentService] Processing options:`, processingOptions);
    console.log(`[DocumentService] Timestamp: ${new Date().toISOString()}`);

    const {
      maxRetries = this.DEFAULT_MAX_RETRIES,
      chunkSize = this.DEFAULT_CHUNK_SIZE,
      chunkOverlap = this.CHUNK_OVERLAP,
      maxChunkChars = this.MAX_CHUNK_CHARS,
    } = processingOptions;

    // Store options for use in chunking methods
    this.currentChunkOverlap = chunkOverlap;
    this.currentMaxChunkChars = maxChunkChars;

    try {
      // Get document
      console.log(`[DocumentService] Fetching document from database...`);
      const document = await documentStorage.getDocument(supabase, documentId);
      if (!document) {
        console.error(`[DocumentService] Document not found: ${documentId}`);
        throw new Error('Document not found');
      }

      console.log(`[DocumentService] Document found:`);
      console.log(`[DocumentService]   - Filename: ${document.filename}`);
      console.log(`[DocumentService]   - File type: ${document.fileType}`);
      console.log(`[DocumentService]   - User ID: ${document.userId}`);
      console.log(`[DocumentService]   - Already processed: ${document.processed}`);

      // Download from storage
      const { data, error } = await supabase.storage
        .from(this.STORAGE_BUCKET)
        .download(document.uploadPath);

      if (error || !data) {
        throw new Error(`Failed to download document: ${error?.message}`);
      }

      // Parse file - Convert Blob to File for parseDocument
      const file = new File([data], document.filename, { type: data.type });
      let parseResult;
      try {
        parseResult = await parseDocument(file, document.filename);
      } catch (parseError) {
        throw new Error(
          `Failed to parse document: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        );
      }

      if (!parseResult.text) {
        throw new Error('Parsed document has no text content');
      }

      // NEW: Check if it's a code file with AST parsing
      console.log(`[DocumentService] File type: ${document.fileType}`);
      const isCodeFile = ['ts', 'tsx', 'js', 'jsx', 'py'].includes(document.fileType);

      let episodeIds: string[];

      if (isCodeFile && parseResult.codeResult) {
        // Use code-aware chunking
        console.log(`[DocumentService] Processing as code file`);
        episodeIds = await this.processCodeFile(
          parseResult.codeResult,
          document.userId,
          document.filename,
          maxRetries
        );
      } else {
        // Use existing text-based processing
        console.log(`[GraphRAG] Processing document ${document.id}: "${document.filename}"`);
        console.log(`[GraphRAG] Content length: ${parseResult.text.length} characters`);
        console.log(`[GraphRAG] Using single episode method (like promote conversation)`);

        episodeIds = await this.processAsSingleEpisode(
          parseResult.text,
          document.userId,
          document.filename,
          maxRetries
        );
      }

      console.log(`[GraphRAG] Successfully processed: ${episodeIds.length} episode(s)`);

      // Update status
      await documentStorage.updateProcessingStatus(supabase, document.id, true, episodeIds);

      return {
        documentId: document.id,
        processed: true,
        episodeIds,
        status: 'completed' as const,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        documentId,
        processed: false,
        episodeIds: [],
        error: errorMessage,
        status: 'failed' as const,
      };
    }
  }

  /**
   * Update an existing document by creating a new version
   * Uses Graphiti temporal features to expire old relationships
   *
   * Workflow:
   * 1. Find latest version of document by filename
   * 2. Create new version record (version = old_version + 1)
   * 3. Add new episode to Neo4j with current reference_time
   * 4. Graphiti automatically expires contradicting relationships
   */
  async updateDocument(
    supabase: SupabaseClient,
    options: UploadOptions
  ): Promise<Document> {
    const { userId, file, metadata = {} } = options;

    // Validate file
    this.validateFile(file);

    let uploadPath = '';

    try {
      console.log(`[GraphRAG] Updating document: ${file.name}`);

      // Step 1: Find latest version by filename
      const latestVersion = await documentStorage.findLatestByFilename(
        supabase,
        userId,
        file.name
      );

      if (!latestVersion) {
        console.log(`[GraphRAG] No existing version found, creating new document`);
        // No previous version exists, treat as new upload
        return this.uploadOnly(supabase, options);
      }

      console.log(`[GraphRAG] Found existing version ${latestVersion.version}`);

      // Step 2: Upload to Supabase Storage
      uploadPath = await this.uploadToStorage(supabase, userId, file);

      // Step 3: Generate document hash (for tracking, not duplicate check)
      const fileBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const documentHash = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      console.log(`[GraphRAG] New document hash: ${documentHash}`);

      // Step 4: Parse file content
      let parseResult;
      try {
        parseResult = await parseDocument(file, file.name);
      } catch (parseError) {
        throw new Error(
          `Failed to parse document: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        );
      }

      if (!parseResult.text) {
        throw new Error('Parsed document has no text content');
      }

      // Step 5: Create new version record
      const fileType = this.getFileType(file.name);
      const newVersion = latestVersion.version + 1;

      const document = await documentStorage.createDocument(supabase, {
        userId,
        filename: file.name,
        fileType,
        uploadPath,
        documentHash,
        content: parseResult.text,
        metadata: {
          ...metadata,
          userId,
          filename: file.name,
          documentName: file.name,
          fileSize: file.size,
          previousVersion: latestVersion.version,
          previousDocumentId: latestVersion.id,
        },
        version: newVersion,
        parentId: latestVersion.id,
      });

      console.log(`[GraphRAG] Created version ${newVersion} (ID: ${document.id})`);

      // Step 6: Process new version (add to Neo4j)
      // This uses current timestamp, causing Graphiti to expire
      // contradicting relationships from old version
      const episodeIds = await this.processAsSingleEpisode(
        parseResult.text,
        userId,
        file.name,
        this.DEFAULT_MAX_RETRIES
      );

      console.log(`[GraphRAG] New episode created: ${episodeIds[0]}`);

      // Step 7: Update processing status
      await documentStorage.updateProcessingStatus(
        supabase,
        document.id,
        true,
        episodeIds
      );

      console.log(`[GraphRAG] Document updated successfully to version ${newVersion}`);

      return document;
    } catch (error) {
      // Cleanup on failure
      if (uploadPath) {
        await this.deleteFromStorage(supabase, uploadPath);
      }

      throw new Error(
        `Failed to update document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete a document and optionally its associated data
   * Uses resilient deletion - continues even if some steps fail
   */
  async deleteDocument(
    supabase: SupabaseClient,
    documentId: string,
    options: DeleteOptions = {}
  ): Promise<void> {
    const { deleteFromStorage = true, deleteFromNeo4j = true } = options;

    console.log(`[DocumentService] Deleting document: ${documentId}`);

    // Get document info
    const document = await documentStorage.getDocument(supabase, documentId);
    if (!document) {
      console.error(`[DocumentService] Document not found: ${documentId}`);
      throw new Error('Document not found');
    }

    console.log(`[DocumentService] Document info:`, {
      filename: document.filename,
      episodeCount: document.neo4jEpisodeIds.length,
      uploadPath: document.uploadPath
    });

    const errors: string[] = [];

    // Delete from Neo4j if requested (best-effort)
    if (deleteFromNeo4j && document.neo4jEpisodeIds.length > 0) {
      try {
        console.log(`[DocumentService] Deleting from Neo4j...`);
        await episodeService.deleteEpisodes(document.neo4jEpisodeIds);
        console.log(`[DocumentService] Neo4j deletion complete`);
      } catch (error) {
        const msg = `Neo4j deletion failed: ${error instanceof Error ? error.message : 'Unknown'}`;
        console.warn(`[DocumentService] ${msg}`);
        errors.push(msg);
        // Continue anyway - don't let Neo4j failure block cleanup
      }
    }

    // Delete from Storage if requested (best-effort)
    if (deleteFromStorage) {
      try {
        console.log(`[DocumentService] Deleting from storage...`);
        await this.deleteFromStorage(supabase, document.uploadPath);
        console.log(`[DocumentService] Storage deletion complete`);
      } catch (error) {
        const msg = `Storage deletion failed: ${error instanceof Error ? error.message : 'Unknown'}`;
        console.warn(`[DocumentService] ${msg}`);
        errors.push(msg);
        // Continue anyway - don't let storage failure block cleanup
      }
    }

    // Delete document record (critical - this must succeed)
    try {
      console.log(`[DocumentService] Deleting document record from database...`);
      await documentStorage.deleteDocument(supabase, documentId);
      console.log(`[DocumentService] Document record deleted successfully`);
    } catch (error) {
      const msg = `Database deletion failed: ${error instanceof Error ? error.message : 'Unknown'}`;
      console.error(`[DocumentService] ${msg}`);
      throw new Error(`Failed to delete document: ${msg}`);
    }

    // Log summary
    if (errors.length > 0) {
      console.warn(`[DocumentService] Document deleted with ${errors.length} warning(s):`, errors);
    } else {
      console.log(`[DocumentService] Document deleted successfully with no errors`);
    }
  }

  /**
   * Get processing status for a document
   */
  async getProcessingStatus(supabase: SupabaseClient, documentId: string): Promise<ProcessingStatus> {
    const document = await documentStorage.getDocument(supabase, documentId);

    if (!document) {
      return {
        documentId,
        processed: false,
        episodeIds: [],
        error: 'Document not found',
      };
    }

    return {
      documentId: document.id,
      processed: document.processed,
      episodeIds: document.neo4jEpisodeIds,
    };
  }

  /**
   * Expire old episodes when updating a document
   * Marks episodes as expired in Neo4j rather than deleting them
   * This preserves history while excluding from search results
   */
  async expireOldEpisodes(
    supabase: SupabaseClient,
    documentId: string
  ): Promise<{ expiredCount: number; errors: string[] }> {
    console.log(`[DocumentService] Expiring old episodes for document: ${documentId}`);

    const document = await documentStorage.getDocument(supabase, documentId);
    if (!document) {
      return { expiredCount: 0, errors: ['Document not found'] };
    }

    if (!document.neo4jEpisodeIds || document.neo4jEpisodeIds.length === 0) {
      console.log(`[DocumentService] No episodes to expire`);
      return { expiredCount: 0, errors: [] };
    }

    const client = getGraphitiClient();
    const errors: string[] = [];
    let expiredCount = 0;

    for (const episodeId of document.neo4jEpisodeIds) {
      try {
        await client.expireEpisode(episodeId);
        expiredCount++;
        console.log(`[DocumentService] Expired episode: ${episodeId}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to expire ${episodeId}: ${msg}`);
        console.warn(`[DocumentService] ${errors[errors.length - 1]}`);
      }
    }

    console.log(`[DocumentService] Expired ${expiredCount}/${document.neo4jEpisodeIds.length} episodes`);
    return { expiredCount, errors };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Validate file before upload
   */
  private validateFile(file: File): void {
    const fileType = this.getFileType(file.name);
    const supportedTypes = graphragConfig.processing.supportedTypes;

    if (!supportedTypes.includes(fileType)) {
      throw new Error(
        `Unsupported file type: ${fileType}. Supported types: ${supportedTypes.join(', ')}`
      );
    }

    const maxSize = graphragConfig.processing.maxFileSize;
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      throw new Error(
        `File size exceeds maximum allowed size of ${maxSizeMB}MB`
      );
    }
  }

  /**
   * Upload file to Supabase Storage
   */
  private async uploadToStorage(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${userId}/${timestamp}_${sanitizedFilename}`;

    const { error } = await supabase.storage
      .from(this.STORAGE_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    return path;
  }

  /**
   * Delete file from Supabase Storage
   */
  private async deleteFromStorage(supabase: SupabaseClient, path: string): Promise<void> {
    const { error } = await supabase.storage
      .from(this.STORAGE_BUCKET)
      .remove([path]);

    if (error) {
      console.error('Failed to delete file from storage:', error);
      // Don't throw - this is cleanup, continue even if it fails
    }
  }

  /**
   * Split text into semantic chunks preserving document structure
   * Priority: sections (headers) -> paragraphs -> sentences -> words
   * Uses configurable overlap to preserve context between chunks
   */
  private chunkText(text: string, maxChunkSize: number): string[] {
    console.log(`[GraphRAG] Chunking config: size=${maxChunkSize}, overlap=${this.currentChunkOverlap}`);

    if (text.length <= maxChunkSize) {
      return [text];
    }

    // First, try to split by major section headers (markdown # or ALL CAPS lines)
    const sections = this.splitBySections(text);

    if (sections.length > 1) {
      console.log(`[GraphRAG] Found ${sections.length} sections in document`);
      // Process sections, merging small ones and splitting large ones
      return this.processSemanticChunks(sections, maxChunkSize);
    }

    // No clear sections, split by paragraphs
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

    if (paragraphs.length > 1) {
      console.log(`[GraphRAG] No sections found, using ${paragraphs.length} paragraphs`);
      return this.processSemanticChunks(paragraphs, maxChunkSize);
    }

    // Single block of text, use character-based splitting with sentence boundaries
    console.log(`[GraphRAG] No paragraphs found, using sentence-based splitting`);
    return this.splitBySize(text, maxChunkSize);
  }

  /**
   * Split text by section headers (markdown headers or ALL CAPS lines)
   */
  private splitBySections(text: string): string[] {
    // Match markdown headers (# Header) or ALL CAPS lines that look like headers
    const sectionPattern = /(?=^#{1,3}\s+.+$|^[A-Z][A-Z\s]{10,}$)/gm;
    const sections = text.split(sectionPattern).filter(s => s.trim().length > 0);
    return sections;
  }

  /**
   * Process semantic chunks: merge small ones, split large ones
   * Adds overlap between chunks to preserve context
   */
  private processSemanticChunks(chunks: string[], maxChunkSize: number): string[] {
    const result: string[] = [];
    const overlap = this.currentChunkOverlap;
    let currentChunk = '';
    let previousChunkEnd = '';

    for (const chunk of chunks) {
      const trimmedChunk = chunk.trim();
      if (!trimmedChunk) continue;

      // If adding this chunk would exceed limit
      if (currentChunk.length + trimmedChunk.length + 2 > maxChunkSize) {
        // Save current chunk if it has content
        if (currentChunk.trim()) {
          result.push(currentChunk.trim());
          // Store end of chunk for overlap with next
          previousChunkEnd = currentChunk.slice(-overlap);
        }

        // If this single chunk is too large, split it further
        if (trimmedChunk.length > maxChunkSize) {
          const subChunks = this.splitBySize(trimmedChunk, maxChunkSize);
          result.push(...subChunks);
          currentChunk = '';
          previousChunkEnd = '';
        } else {
          // Start new chunk with overlap from previous
          currentChunk = previousChunkEnd
            ? previousChunkEnd + '\n\n' + trimmedChunk
            : trimmedChunk;
        }
      } else {
        // Add to current chunk with paragraph separator
        currentChunk = currentChunk
          ? currentChunk + '\n\n' + trimmedChunk
          : trimmedChunk;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
      result.push(currentChunk.trim());
    }

    return result;
  }

  /**
   * Split text by size, preferring natural boundaries
   * Includes configurable overlap to preserve context between chunks
   */
  private splitBySize(text: string, maxChunkSize: number): string[] {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    const overlap = this.currentChunkOverlap;
    let position = 0;

    while (position < text.length) {
      const remaining = text.length - position;

      if (remaining <= maxChunkSize) {
        chunks.push(text.slice(position).trim());
        break;
      }

      // Find best break point (prefer sentence > paragraph > word)
      const chunkText = text.slice(position, position + maxChunkSize);
      const breakPoint = this.findBestBreakPoint(chunkText, maxChunkSize);

      chunks.push(chunkText.slice(0, breakPoint).trim());

      // Move position forward, but subtract overlap to preserve context
      // Ensure we always make progress (at least 1 char)
      const advance = Math.max(breakPoint - overlap, 1);
      position += advance;
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Find the best break point within maxSize
   */
  private findBestBreakPoint(text: string, maxSize: number): number {
    // Try paragraph break first
    const paragraphBreak = text.lastIndexOf('\n\n', maxSize);
    if (paragraphBreak > maxSize * 0.3) return paragraphBreak + 2;

    // Try sentence boundaries (. ! ?)
    const sentencePatterns = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
    let bestSentenceBreak = -1;
    for (const pattern of sentencePatterns) {
      const idx = text.lastIndexOf(pattern, maxSize);
      if (idx > bestSentenceBreak) bestSentenceBreak = idx;
    }
    if (bestSentenceBreak > maxSize * 0.3) return bestSentenceBreak + 2;

    // Try line break
    const lineBreak = text.lastIndexOf('\n', maxSize);
    if (lineBreak > maxSize * 0.3) return lineBreak + 1;

    // Try word break
    const wordBreak = text.lastIndexOf(' ', maxSize);
    if (wordBreak > maxSize * 0.3) return wordBreak + 1;

    // Last resort: hard cut
    return maxSize;
  }

  /**
   * Process text as episodes, chunking if necessary for large documents
   * Uses BULK processing first, falls back to sequential on failure
   */
  private async processAsSingleEpisode(
    text: string,
    userId: string,
    filename: string,
    maxRetries: number
  ): Promise<string[]> {
    console.log(`[GraphRAG] processAsSingleEpisode: text=${text.length} chars, maxChunk=${this.MAX_CHUNK_CHARS}`);

    // Check if we need to chunk
    if (text.length > this.MAX_CHUNK_CHARS) {
      console.log(`[GraphRAG] Document too large (${text.length} chars), chunking into ~${this.MAX_CHUNK_CHARS} char pieces`);
      const chunks = this.chunkText(text, this.MAX_CHUNK_CHARS);
      console.log(`[GraphRAG] Split into ${chunks.length} chunks - trying BULK processing first`);

      // Build chunk objects with filenames
      const chunkData = chunks.map((chunk, i) => ({
        content: chunk,
        filename: `${filename} (part ${i + 1}/${chunks.length})`,
      }));

      // Try bulk processing first (faster)
      let bulkError: Error | null = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[GraphRAG] Bulk attempt ${attempt}/${maxRetries}: Processing ${chunks.length} chunks`);

          const result = await episodeService.addDocumentsBulk(chunkData, userId);

          console.log(`[GraphRAG] Bulk processing complete: ${result.episodeIds.length} episodes`);
          return result.episodeIds;
        } catch (error) {
          bulkError = error instanceof Error ? error : new Error('Unknown error');
          console.error(`[GraphRAG] Bulk attempt ${attempt}/${maxRetries} failed:`, bulkError.message);

          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.log(`[GraphRAG] Retrying bulk in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // Bulk failed - fall back to sequential processing with partial recovery
      console.warn(`[GraphRAG] Bulk processing failed, falling back to sequential with partial recovery`);
      return this.processChunksSequentially(chunkData, userId, maxRetries);
    }

    // Small enough for single episode
    return this.processChunk(text, userId, filename, maxRetries);
  }

  /**
   * Process chunks sequentially with partial success tracking
   * Continues processing even if some chunks fail
   */
  private async processChunksSequentially(
    chunkData: Array<{ content: string; filename: string }>,
    userId: string,
    maxRetries: number
  ): Promise<string[]> {
    const episodeIds: string[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < chunkData.length; i++) {
      const chunk = chunkData[i];
      console.log(`[GraphRAG] Sequential chunk ${i + 1}/${chunkData.length}: ${chunk.filename}`);

      try {
        const ids = await this.processChunk(chunk.content, userId, chunk.filename, maxRetries);
        episodeIds.push(...ids);
        successCount++;
        console.log(`[GraphRAG] Chunk ${i + 1} succeeded`);
      } catch (error) {
        failCount++;
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[GraphRAG] Chunk ${i + 1} failed after retries: ${msg}`);
        // Continue processing remaining chunks
      }
    }

    console.log(`[GraphRAG] Sequential processing complete: ${successCount}/${chunkData.length} succeeded, ${failCount} failed`);

    if (episodeIds.length === 0) {
      throw new Error(`All ${chunkData.length} chunks failed to process`);
    }

    if (failCount > 0) {
      console.warn(`[GraphRAG] Partial success: ${failCount} chunks failed but ${successCount} succeeded`);
    }

    return episodeIds;
  }

  /**
   * NEW: Process code file using AST chunks
   */
  private async processCodeFile(
    codeResult: CodeParseResult,
    userId: string,
    filename: string,
    maxRetries: number
  ): Promise<string[]> {
    console.log(`[DocumentService] ===== PROCESSING CODE FILE =====`);
    console.log(`[DocumentService] File: ${filename}`);
    console.log(`[DocumentService] Language: ${codeResult.metadata.language}`);
    console.log(`[DocumentService] AST entities: ${codeResult.astResult.entities.length}`);
    console.log(`[DocumentService] Code chunks: ${codeResult.astResult.chunks.length}`);

    const chunks = codeResult.astResult.chunks;

    if (chunks.length === 0) {
      // Fallback to text-based processing
      console.warn(`[DocumentService] No AST chunks, falling back to text processing`);
      return this.processAsSingleEpisode(
        codeResult.rawContent,
        userId,
        filename,
        maxRetries
      );
    }

    // Use code-specific episode creation
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[DocumentService] Attempt ${attempt}/${maxRetries}: Processing code chunks`);

        const episodeIds = await episodeService.addCodeChunks(chunks, userId, filename);

        console.log(`[DocumentService] ===== CODE PROCESSING COMPLETE =====`);
        console.log(`[DocumentService] Episodes created: ${episodeIds.length}`);

        return episodeIds;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.error(`[DocumentService] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`[DocumentService] Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Code processing failed');
  }

  /**
   * Process a single chunk of text as an episode
   */
  private async processChunk(
    text: string,
    userId: string,
    filename: string,
    maxRetries: number
  ): Promise<string[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[GraphRAG] Attempt ${attempt}/${maxRetries}: Adding document as episode`);

        const result = await episodeService.addDocument(
          text,
          userId,
          filename
        );

        console.log(`[GraphRAG] Episode created successfully: ${result.episodeId}`);
        console.log(`[GraphRAG] Entities created: ${result.entitiesCreated}, Relations: ${result.relationsCreated}`);

        return [result.episodeId];
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.error(
          `[GraphRAG] Processing attempt ${attempt}/${maxRetries} failed:`,
          lastError.message
        );

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`[GraphRAG] Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Failed to process document after ${maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Cleanup after failed upload
   */
  private async cleanupFailedUpload(
    supabase: SupabaseClient,
    documentId: string,
    uploadPath: string
  ): Promise<void> {
    try {
      // Delete document record
      await documentStorage.deleteDocument(supabase, documentId);
    } catch (error) {
      console.error('Failed to delete document record during cleanup:', error);
    }

    try {
      // Delete from storage
      await this.deleteFromStorage(supabase, uploadPath);
    } catch (error) {
      console.error('Failed to delete file from storage during cleanup:', error);
    }
  }

  /**
   * Get file type from filename
   */
  private getFileType(filename: string): DocumentFileType {
    const ext = filename.toLowerCase().split('.').pop();

    switch (ext) {
      case 'pdf':
        return 'pdf';
      case 'docx':
        return 'docx';
      case 'txt':
        return 'txt';
      case 'md':
        return 'md';
      case 'ts':
        return 'ts';
      case 'tsx':
        return 'tsx';
      case 'js':
        return 'js';
      case 'jsx':
        return 'jsx';
      case 'py':
        return 'py';
      default:
        throw new Error(`Unsupported file extension: ${ext}`);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const documentService = new DocumentService();
