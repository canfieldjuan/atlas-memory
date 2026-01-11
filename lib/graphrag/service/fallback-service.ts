/**
 * Fallback Service
 * Provides alternative search methods when GraphRAG returns insufficient results
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { graphragConfig } from '../config';
import type { SearchResult, SearchSource } from '../types';
import { log } from '@/lib/utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface FallbackOptions {
  userId: string;
  query: string;
  limit?: number;
}

export interface FallbackResult {
  sources: SearchSource[];
  context: string;
  strategy: string;
  queryTimeMs: number;
}

// ============================================================================
// Fallback Service Implementation
// ============================================================================

export class FallbackService {
  private enabled: boolean;
  private strategy: string;
  private minResultsThreshold: number;

  constructor() {
    this.enabled = graphragConfig.fallback?.enabled ?? true;
    this.strategy = graphragConfig.fallback?.strategy ?? 'cascade';
    this.minResultsThreshold = graphragConfig.fallback?.minResultsThreshold ?? 3;
  }

  /**
   * Check if fallback should be triggered
   */
  shouldTriggerFallback(primaryResultCount: number): boolean {
    if (!this.enabled) return false;
    return primaryResultCount < this.minResultsThreshold;
  }

  /**
   * Execute fallback search
   */
  async executeFallback(options: FallbackOptions): Promise<FallbackResult> {
    const startTime = Date.now();

    log.debug('GraphRAG', 'Executing fallback search', {
      strategy: this.strategy,
      query: options.query.slice(0, 50),
    });

    try {
      switch (this.strategy) {
        case 'vector':
          return await this.vectorFallback(options, startTime);
        case 'keyword':
          return await this.keywordFallback(options, startTime);
        case 'cascade':
        default:
          return await this.cascadeFallback(options, startTime);
      }
    } catch (error) {
      log.error('GraphRAG', 'Fallback search failed', { error });
      return {
        sources: [],
        context: '',
        strategy: this.strategy,
        queryTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Cascade fallback: Try vector first, then keyword
   */
  private async cascadeFallback(
    options: FallbackOptions,
    startTime: number
  ): Promise<FallbackResult> {
    // Try vector search first
    const vectorResult = await this.vectorFallback(options, startTime);
    if (vectorResult.sources.length >= this.minResultsThreshold) {
      return vectorResult;
    }

    // Fall back to keyword search
    const keywordResult = await this.keywordFallback(options, startTime);

    // Merge results
    const combinedSources = this.deduplicateSources([
      ...vectorResult.sources,
      ...keywordResult.sources,
    ]);

    return {
      sources: combinedSources,
      context: this.buildContext(combinedSources),
      strategy: 'cascade',
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Vector similarity fallback using Supabase
   */
  private async vectorFallback(
    options: FallbackOptions,
    startTime: number
  ): Promise<FallbackResult> {
    const limit = options.limit || 5;

    // Search in graphrag_documents table using text search
    const { data, error } = await supabaseAdmin
      .from('graphrag_documents')
      .select('id, filename, content, metadata')
      .eq('user_id', options.userId)
      .textSearch('content', options.query)
      .limit(limit);

    if (error || !data) {
      log.warn('GraphRAG', 'Vector fallback query failed', { error });
      return {
        sources: [],
        context: '',
        strategy: 'vector',
        queryTimeMs: Date.now() - startTime,
      };
    }

    const sources = this.mapDocumentsToSources(data, 'vector_fallback');

    return {
      sources,
      context: this.buildContext(sources),
      strategy: 'vector',
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Keyword fallback using ILIKE search
   */
  private async keywordFallback(
    options: FallbackOptions,
    startTime: number
  ): Promise<FallbackResult> {
    const limit = options.limit || 5;

    // Extract keywords from query
    const keywords = this.extractKeywords(options.query);
    if (keywords.length === 0) {
      return {
        sources: [],
        context: '',
        strategy: 'keyword',
        queryTimeMs: Date.now() - startTime,
      };
    }

    // Search for documents containing keywords
    const keywordPattern = keywords.map(k => `%${k}%`).join('%');

    const { data, error } = await supabaseAdmin
      .from('graphrag_documents')
      .select('id, filename, content, metadata')
      .eq('user_id', options.userId)
      .ilike('content', keywordPattern)
      .limit(limit);

    if (error || !data) {
      log.warn('GraphRAG', 'Keyword fallback query failed', { error });
      return {
        sources: [],
        context: '',
        strategy: 'keyword',
        queryTimeMs: Date.now() - startTime,
      };
    }

    const sources = this.mapDocumentsToSources(data, 'keyword_fallback');

    return {
      sources,
      context: this.buildContext(sources),
      strategy: 'keyword',
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Map database documents to SearchSource format
   */
  private mapDocumentsToSources(
    documents: any[],
    sourceType: string
  ): SearchSource[] {
    return documents.map(doc => {
      // Extract relevant snippet from content
      const snippet = this.extractSnippet(doc.content, 500);

      return {
        entity: doc.filename,
        relation: sourceType,
        fact: snippet,
        confidence: 0.5, // Lower confidence for fallback results
        sourceDescription: `Fallback (${sourceType}): ${doc.filename}`,
      };
    });
  }

  /**
   * Extract snippet from content
   */
  private extractSnippet(content: string, maxLength: number): string {
    if (!content) return '';
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }

  /**
   * Extract keywords from query
   */
  private extractKeywords(query: string): string[] {
    // Remove common words and extract meaningful terms
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'can', 'this',
      'that', 'these', 'those', 'what', 'which', 'who', 'whom',
      'how', 'when', 'where', 'why', 'and', 'or', 'but', 'if',
      'then', 'else', 'for', 'of', 'to', 'from', 'in', 'on', 'at',
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    return [...new Set(words)];
  }

  /**
   * Build context string from sources
   */
  private buildContext(sources: SearchSource[]): string {
    if (sources.length === 0) return '';

    const facts = sources.map((source, idx) => {
      return `${idx + 1}. ${source.fact}\n   Source: ${source.sourceDescription}`;
    });

    return `Fallback search results:\n\n${facts.join('\n\n')}`;
  }

  /**
   * Deduplicate sources by content fingerprint
   */
  private deduplicateSources(sources: SearchSource[]): SearchSource[] {
    const seen = new Set<string>();
    return sources.filter(source => {
      const fingerprint = source.fact
        .slice(0, 100)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });
  }

  /**
   * Check if fallback is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      enabled: this.enabled,
      strategy: this.strategy,
      minResultsThreshold: this.minResultsThreshold,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const fallbackService = new FallbackService();
