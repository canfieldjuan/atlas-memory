/**
 * Episode Service
 * Handles adding documents to Graphiti knowledge graph
 */

import { getGraphitiClient, type GraphitiEpisode, type GraphitiBulkEpisodeResponse } from './client';
import type { DocumentMetadata, CodeChunk } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface AddEpisodeResult {
  episodeId: string;
  entitiesCreated: number;
  relationsCreated: number;
}

export interface AddDocumentOptions {
  chunkSize?: number;
  metadata?: DocumentMetadata;
}

export interface BulkAddResult {
  episodeIds: string[];
  totalEntities: number;
  totalRelations: number;
}

// ============================================================================
// Episode Service
// ============================================================================

export class EpisodeService {
  private client = getGraphitiClient();

  /**
   * Add a document as a single episode
   */
  async addDocument(
    content: string,
    userId: string,
    filename: string,
    metadata?: Record<string, unknown>
  ): Promise<AddEpisodeResult> {
    // Build source description with metadata if provided
    const sourceDescription = metadata
      ? `${filename} - ${JSON.stringify(metadata).substring(0, 200)}`
      : filename;

    const episode: GraphitiEpisode = {
      name: filename,
      episode_body: content,
      source_description: sourceDescription,
      reference_time: new Date().toISOString(),
      group_id: userId,
    };

    const response = await this.client.addEpisode(episode);

    return {
      episodeId: response.episode_id,
      entitiesCreated: response.entities_created,
      relationsCreated: response.relations_created,
    };
  }

  /**
   * Add a large document as multiple episodes (chunked)
   */
  async addDocumentChunked(
    content: string,
    userId: string,
    filename: string,
    options?: AddDocumentOptions
  ): Promise<string[]> {
    const chunkSize = options?.chunkSize || 2000; // characters
    const chunks = this.splitIntoChunks(content, chunkSize);
    const episodeIds: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkFilename = chunks.length > 1
        ? `${filename} - Part ${i + 1}/${chunks.length}`
        : filename;

      const result = await this.addDocument(chunk, userId, chunkFilename);
      episodeIds.push(result.episodeId);
    }

    return episodeIds;
  }

  /**
   * Add multiple document chunks in bulk (much faster than sequential)
   * Uses graphiti's bulk endpoint for batch processing
   */
  async addDocumentsBulk(
    chunks: Array<{ content: string; filename: string }>,
    userId: string
  ): Promise<BulkAddResult> {
    console.log(`[EpisodeService] ===== BULK ADD DOCUMENTS =====`);
    console.log(`[EpisodeService] User ID: ${userId}`);
    console.log(`[EpisodeService] Number of chunks: ${chunks.length}`);

    if (chunks.length === 0) {
      console.log(`[EpisodeService] No chunks to process, returning empty result`);
      return { episodeIds: [], totalEntities: 0, totalRelations: 0 };
    }

    // Build episodes array
    const episodes: GraphitiEpisode[] = chunks.map(chunk => ({
      name: chunk.filename,
      episode_body: chunk.content,
      source_description: chunk.filename,
      reference_time: new Date().toISOString(),
      group_id: userId,
    }));

    console.log(`[EpisodeService] Built ${episodes.length} episodes`);
    console.log(`[EpisodeService] First episode name: ${episodes[0]?.name}`);
    console.log(`[EpisodeService] First episode body length: ${episodes[0]?.episode_body.length}`);
    console.log(`[EpisodeService] Calling client.addEpisodesBulk()...`);

    try {
      const response = await this.client.addEpisodesBulk({
        episodes,
        group_id: userId,
      });

      console.log(`[EpisodeService] ===== BULK ADD SUCCESS =====`);
      console.log(`[EpisodeService] Episode IDs: ${response.episode_ids.length}`);
      console.log(`[EpisodeService] Total entities: ${response.total_entities}`);
      console.log(`[EpisodeService] Total relations: ${response.total_relations}`);

      return {
        episodeIds: response.episode_ids,
        totalEntities: response.total_entities,
        totalRelations: response.total_relations,
      };
    } catch (error) {
      console.error(`[EpisodeService] ===== BULK ADD FAILED =====`);
      console.error(`[EpisodeService] Error:`, error);
      throw error;
    }
  }

  /**
   * Add a validation test case as an episode
   * Used for validation sets - embeds test cases for semantic comparison
   */
  async addValidationTestCase(
    testCase: {
      prompt: string;
      expected_response: string;
      keywords_required?: string[];
      tone?: string;
      max_length?: number;
      [key: string]: unknown;
    },
    userId: string,
    validationSetName: string
  ): Promise<AddEpisodeResult> {
    // Build episode content combining prompt and expected response
    const episodeBody = `VALIDATION TEST CASE

Prompt: ${testCase.prompt}

Expected Response: ${testCase.expected_response}`;

    // Build source description with metadata for filtering
    const metadata = {
      type: 'validation_test_case',
      validation_set: validationSetName,
      keywords: testCase.keywords_required?.join(',') || '',
      tone: testCase.tone || '',
      max_length: testCase.max_length || 0,
    };

    const sourceDescription = JSON.stringify(metadata);

    const episode: GraphitiEpisode = {
      name: `validation: ${testCase.prompt.substring(0, 50)}`,
      episode_body: episodeBody,
      source_description: sourceDescription,
      reference_time: new Date().toISOString(),
      group_id: userId,
    };

    const response = await this.client.addEpisode(episode);

    return {
      episodeId: response.episode_id,
      entitiesCreated: response.entities_created,
      relationsCreated: response.relations_created,
    };
  }

  /**
   * Split text into semantic chunks
   * Tries to preserve paragraph and sentence boundaries
   */
  private splitIntoChunks(text: string, maxChunkSize: number): string[] {
    // If text is smaller than chunk size, return as-is
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    
    // Split by paragraphs first (double newline)
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      // If adding this paragraph exceeds chunk size
      if (currentChunk.length + paragraph.length + 2 > maxChunkSize) {
        // If current chunk has content, save it
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // If paragraph itself is too large, split by sentences
        if (paragraph.length > maxChunkSize) {
          const sentences = this.splitIntoSentences(paragraph, maxChunkSize);
          chunks.push(...sentences);
        } else {
          currentChunk = paragraph;
        }
      } else {
        // Add paragraph to current chunk
        if (currentChunk) {
          currentChunk += '\n\n' + paragraph;
        } else {
          currentChunk = paragraph;
        }
      }
    }

    // Add remaining chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Split paragraph into sentences
   */
  private splitIntoSentences(text: string, maxSize: number): string[] {
    // Simple sentence splitting (can be enhanced)
    const sentences = text.split(/[.!?]+\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length + 2 > maxSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        
        // If single sentence is too large, hard split
        if (sentence.length > maxSize) {
          const hardSplits = this.hardSplit(sentence, maxSize);
          chunks.push(...hardSplits);
          currentChunk = '';
        } else {
          currentChunk = sentence;
        }
      } else {
        currentChunk = currentChunk ? currentChunk + '. ' + sentence : sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Hard split text at character boundaries
   */
  private hardSplit(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxSize) {
      chunks.push(text.slice(i, i + maxSize));
    }
    return chunks;
  }

  /**
   * Delete an episode
   * Handles 404 gracefully (episode already deleted or never existed)
   */
  async deleteEpisode(episodeId: string): Promise<void> {
    try {
      console.log(`[EpisodeService] Deleting episode: ${episodeId}`);
      await this.client.deleteEpisode(episodeId);
      console.log(`[EpisodeService] Successfully deleted episode: ${episodeId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // If episode not found (404), log warning but don't throw
      // This handles orphaned records where episode was already deleted
      if (errorMessage.includes('404')) {
        console.warn(`[EpisodeService] Episode ${episodeId} not found (404) - likely already deleted`);
        return; // Success - episode doesn't exist (desired state)
      }

      // For other errors, log and re-throw
      console.error(`[EpisodeService] Failed to delete episode ${episodeId}:`, errorMessage);
      throw error;
    }
  }

  /**
   * Delete multiple episodes
   * Uses best-effort approach - continues even if some deletions fail
   */
  async deleteEpisodes(episodeIds: string[]): Promise<void> {
    if (episodeIds.length === 0) {
      console.log('[EpisodeService] No episodes to delete');
      return;
    }

    console.log(`[EpisodeService] Deleting ${episodeIds.length} episode(s)`);

    // Use allSettled to continue even if individual deletions fail
    const results = await Promise.allSettled(
      episodeIds.map(id => this.deleteEpisode(id))
    );

    // Log summary
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[EpisodeService] Deletion complete: ${succeeded} succeeded, ${failed} failed`);

    // Note: We don't throw even if some failed, as long as we tried our best
    // The individual deleteEpisode calls will have logged specific errors
  }

  /**
   * NEW: Add code chunks as episodes with rich metadata
   */
  async addCodeChunks(
    chunks: CodeChunk[],
    userId: string,
    filename: string
  ): Promise<string[]> {
    console.log(`[EpisodeService] ===== ADDING CODE CHUNKS =====`);
    console.log(`[EpisodeService] File: ${filename}`);
    console.log(`[EpisodeService] Chunks: ${chunks.length}`);
    console.log(`[EpisodeService] User: ${userId}`);

    if (chunks.length === 0) {
      console.warn('[EpisodeService] No code chunks to process');
      return [];
    }

    // Build episodes from code chunks
    const episodes: GraphitiEpisode[] = chunks.map((chunk, index) => {
      // Create rich episode body with context
      const episodeBody = this.formatCodeChunk(chunk);

      // Source description with metadata
      const sourceDescription = JSON.stringify({
        type: 'code',
        filename,
        chunkType: chunk.chunkType,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        entities: chunk.entities.map(e => e.name),
        language: filename.split('.').pop(),
        chunkIndex: index,
      });

      return {
        name: `${filename}:${chunk.chunkType}:${chunk.startLine}-${chunk.endLine}`,
        episode_body: episodeBody,
        source_description: sourceDescription,
        reference_time: new Date().toISOString(),
        group_id: userId,
      };
    });

    console.log(`[EpisodeService] Built ${episodes.length} episodes from code chunks`);
    console.log(`[EpisodeService] First episode: ${episodes[0]?.name}`);

    // Use bulk processing
    const result = await this.client.addEpisodesBulk({
      episodes,
      group_id: userId,
    });

    console.log(`[EpisodeService] ===== CODE CHUNKS PROCESSED =====`);
    console.log(`[EpisodeService] Episodes created: ${result.episode_ids.length}`);
    console.log(`[EpisodeService] Entities: ${result.total_entities}`);
    console.log(`[EpisodeService] Relations: ${result.total_relations}`);

    return result.episode_ids;
  }

  /**
   * Format code chunk for Graphiti processing
   */
  private formatCodeChunk(chunk: CodeChunk): string {
    const parts = [
      `File: ${chunk.filePath}`,
      `Lines: ${chunk.startLine}-${chunk.endLine}`,
      `Type: ${chunk.chunkType}`,
      '',
    ];

    // Add imports if present
    if (chunk.imports.length > 0) {
      parts.push('=== IMPORTS ===');
      parts.push(...chunk.imports);
      parts.push('');
    }

    // Add entity definitions
    if (chunk.entities.length > 0) {
      parts.push('=== DEFINITIONS ===');
      parts.push(...chunk.entities.map(e =>
        `${e.type}: ${e.name} (lines ${e.startLine}-${e.endLine})${e.signature ? ' - ' + e.signature : ''}`
      ));
      parts.push('');
    }

    // Add dependencies
    if (chunk.dependencies.length > 0) {
      parts.push('=== DEPENDENCIES ===');
      parts.push(chunk.dependencies.join(', '));
      parts.push('');
    }

    // Add the actual code
    parts.push('=== CODE ===');
    parts.push(chunk.content);

    return parts.join('\n');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const episodeService = new EpisodeService();
