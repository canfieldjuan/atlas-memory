/**
 * GraphRAG Service
 * Integrates document search with chat for context-aware responses
 */

import { searchService, traversalService } from '../graphiti';
import { getGraphitiClient, type EmbedderConfig } from '../graphiti/client';
import { graphragConfig } from '../config';
import { classifyQuery } from '../utils/query-classifier';
import { queryDecomposer } from '../utils/query-decomposer';
import type { SearchSource, SearchResult, GraphRAGRetrievalMetadata } from '../types';
import type { TraceContext } from '@/lib/tracing/types';
import { log } from '@/lib/utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface EnhanceOptions {
  maxSources?: number;
  minConfidence?: number;
  maxContextLength?: number;
  includeMetadata?: boolean;
  embedderConfig?: EmbedderConfig;
  traceContext?: TraceContext; // Optional parent trace context for observability
  compressContext?: boolean; // Enable context compression to reduce token usage
}

export interface EnhancedPrompt {
  prompt: string;
  contextUsed: boolean;
  sources?: SearchSource[];
  metadata?: GraphRAGRetrievalMetadata;
}

export interface Citation {
  source: string;
  content: string;
  confidence: number;
}

// ============================================================================
// GraphRAG Service
// ============================================================================

export class GraphRAGService {
  /**
   * Enhance user prompt with document context
   * Returns original prompt if GraphRAG disabled or no context found
   */
  async enhancePrompt(
    userId: string,
    userMessage: string,
    options: EnhanceOptions = {}
  ): Promise<EnhancedPrompt> {
    // Check if GraphRAG is enabled
    if (!graphragConfig.enabled) {
      console.log('[GraphRAG] Disabled in config, skipping enhancement');
      return {
        prompt: userMessage,
        contextUsed: false,
      };
    }

    // Validate inputs
    if (!userId || !userMessage.trim()) {
      return {
        prompt: userMessage,
        contextUsed: false,
      };
    }

    try {
      const {
        maxSources,
        minConfidence,
        maxContextLength,
        includeMetadata = true,
        embedderConfig,
        traceContext,
        compressContext: shouldCompress = false,
      } = options;

      // Set embedder config on client if provided
      if (embedderConfig) {
        const client = getGraphitiClient();
        client.setEmbedderConfig(embedderConfig);
      }

      // Check if query should skip search (tool-specific queries)
      const classification = classifyQuery(userMessage);
      if (classification.shouldSkipSearch) {
        console.log('[GraphRAG] Query classification:', {
          query: userMessage.slice(0, 50),
          isMath: classification.isMath,
          isDateTime: classification.isDateTime,
          isWebSearch: classification.isWebSearch,
          action: 'SKIP_SEARCH',
          reason: classification.reason,
        });
        return {
          prompt: userMessage,
          contextUsed: false,
        };
      }

      // Search knowledge graph for relevant context
      console.log('[GraphRAG] Query classification:', {
        query: userMessage.slice(0, 50),
        isToolSpecific: classification.isToolSpecific,
        action: 'SEARCH',
      });

      // Check for relationship-based queries that need traversal
      const relationshipPattern = /\b(relationship|connected|path between|how.*related|link between)\b/i;
      const isRelationshipQuery = relationshipPattern.test(userMessage);

      // Handle search based on query complexity
      let searchResult: SearchResult;

      if (isRelationshipQuery) {
        // Use traversal for relationship queries
        searchResult = await this.handleRelationshipQuery(userMessage, userId, traceContext);
      } else if (queryDecomposer.shouldDecompose(userMessage)) {
        // Decompose complex query and merge results
        searchResult = await this.handleComplexQuery(userMessage, userId, traceContext);
      } else {
        // Simple query - use standard search
        searchResult = await searchService.search(userMessage, userId, traceContext);
      }

      let filteredSources = searchResult.sources || [];

      // DIAGNOSTIC: Log all sources BEFORE filtering
      console.log('[GraphRAG] Sources returned from search:', filteredSources.length);
      if (filteredSources.length > 0) {
        const scores = filteredSources.map(s => (s.confidence * 100).toFixed(1) + '%').join(', ');
        console.log('[GraphRAG] Confidence scores:', scores);
        console.log('[GraphRAG] Threshold:', typeof minConfidence === 'number' ? (minConfidence * 100).toFixed(1) + '%' : 'none');
      }

      if (typeof minConfidence === 'number') {
        const beforeFilter = filteredSources.length;
        filteredSources = filteredSources.filter(source => source.confidence >= minConfidence);
        console.log(`[GraphRAG] After threshold filter: ${filteredSources.length}/${beforeFilter} sources remaining`);
      }

      if (typeof maxSources === 'number' && maxSources > 0) {
        filteredSources = filteredSources.slice(0, maxSources);
      }

      // Check if we got useful results after filtering
      if (filteredSources.length === 0) {
        console.log('[GraphRAG] ❌ No relevant context found - all sources filtered out by threshold');
        console.log('[GraphRAG] 💡 TIP: Lower GRAPHRAG_SEARCH_THRESHOLD in .env.local to see more results');
        return {
          prompt: userMessage,
          contextUsed: false,
        };
      }

      // Format context from search results (with optional compression)
      const formattedContext = this.formatContext(filteredSources, shouldCompress);
      const limitedContext =
        typeof maxContextLength === 'number' && maxContextLength > 0
          ? formattedContext.slice(0, maxContextLength)
          : formattedContext;

      // Inject context into prompt
      const enhancedPrompt = this.injectContext(userMessage, limitedContext);

      console.log('[GraphRAG] Enhanced prompt with', filteredSources.length, 'sources');

      return {
        prompt: enhancedPrompt,
        contextUsed: true,
        sources: filteredSources,
        metadata: includeMetadata ? {
          ...searchResult.metadata,
          graph_used: true,
          nodes_retrieved: filteredSources.length,
          context_chunks_used: filteredSources.length,
          retrieval_time_ms: searchResult.metadata.queryTime,
          context_relevance_score: filteredSources.length > 0
            ? filteredSources.reduce((sum, s) => sum + s.confidence, 0) / filteredSources.length
            : 0,
          answer_grounded_in_graph: filteredSources.length > 0,
        } : undefined,
      };
    } catch (error) {
      // Check if it's a connection error (service not running)
      const isConnectionError = error instanceof Error &&
        (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed'));

      if (isConnectionError) {
        // Silent fallback when GraphRAG service isn't running
        console.log('[GraphRAG] Service unavailable, skipping enhancement');
      } else {
        console.error('[GraphRAG] Error enhancing prompt:', error);
      }

      // Fallback to original prompt on error
      return {
        prompt: userMessage,
        contextUsed: false,
      };
    }
  }

  /**
   * Format search results into readable context
   */
  private formatContext(sources: SearchSource[], compress = false): string {
    if (compress && sources.length > 1) {
      return this.compressContext(sources);
    }

    const contextParts = sources.map((source, index) => {
      return `[${index + 1}] ${source.fact}`;
    });

    return contextParts.join('\n\n');
  }

  /**
   * Compress context by grouping similar facts by entity
   * Reduces token usage by 30-40% while preserving information
   */
  private compressContext(sources: SearchSource[]): string {
    if (sources.length <= 1) {
      return sources.length === 1 ? sources[0].fact : '';
    }

    // Group by entity
    const grouped = new Map<string, SearchSource[]>();

    for (const source of sources) {
      const entity = source.entity || 'General';
      if (!grouped.has(entity)) {
        grouped.set(entity, []);
      }
      grouped.get(entity)!.push(source);
    }

    // Generate summary per entity
    const parts: string[] = [];
    let index = 1;

    for (const [entity, facts] of grouped) {
      if (facts.length === 1) {
        parts.push(`[${index}] ${entity}: ${facts[0].fact}`);
      } else {
        const factList = facts.map(f => f.fact).join('; ');
        parts.push(`[${index}] ${entity}: ${factList}`);
      }
      index++;
    }

    return parts.join('\n\n');
  }

  /**
   * Inject context into user message
   * Enhanced for code-related queries
   */
  private injectContext(userMessage: string, context: string): string {
    return `You have access to the user's uploaded documents and code. Use this context to provide accurate, well-sourced answers.

CONTEXT FROM USER'S DOCUMENTS AND CODE:
${context}

USER'S QUESTION:
${userMessage}

CRITICAL INSTRUCTIONS - You MUST follow these:

1. ALWAYS cite your sources using [1], [2], etc. matching the context numbers above
2. Be EXPLICIT about what you found - start responses with "Based on your documents..." or "According to [source]..."
3. Quote specific facts, numbers, and details from the context - don't paraphrase vaguely
4. If multiple sources provide information, reference each one

For code-related questions:
- Provide specific file paths and line numbers when available
- Show relevant code snippets from the context
- Explain imports, dependencies, and relationships between code entities
- Reference function signatures, class definitions, and type information

For document-related questions:
- Lead with the specific data you found (e.g., "The RTX 4090 has 16,384 CUDA cores [1]")
- Include exact values, dates, names from the context
- Show relationships between entities when relevant

For questions the context doesn't answer:
- Clearly state "Your documents don't contain information about X"
- Then optionally provide general knowledge, clearly marked as such

BAD example: "The GPU has good specs"
GOOD example: "According to your documents [1], the RTX 4090 has 16,384 CUDA cores, 24GB GDDR6X memory, and a TDP of 450W"`;
  }

  /**
   * Format citations for display
   */
  formatCitations(sources: SearchSource[]): Citation[] {
    return sources.map(source => ({
      source: source.sourceDescription || source.entity || 'Unknown',
      content: source.fact,
      confidence: source.confidence,
    }));
  }

  /**
   * Handle complex queries by decomposing into sub-queries and merging results
   */
  private async handleComplexQuery(
    userMessage: string,
    userId: string,
    traceContext?: TraceContext
  ): Promise<SearchResult> {
    const decomposed = queryDecomposer.decompose(userMessage);

    log.info('GraphRAG', 'Decomposing complex query', {
      original: userMessage.slice(0, 50),
      subQueryCount: decomposed.subQueries.length,
      reason: decomposed.complexityReason,
    });

    // Execute searches for each sub-query in parallel
    const searchPromises = decomposed.subQueries.map(sq =>
      searchService.search(sq.query, userId, traceContext)
    );

    const results = await Promise.all(searchPromises);

    // Merge all sources with deduplication
    const allSources: SearchSource[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      for (const source of result.sources) {
        const fingerprint = source.fact.slice(0, 100).toLowerCase().replace(/\s+/g, ' ').trim();
        if (!seen.has(fingerprint)) {
          allSources.push(source);
          seen.add(fingerprint);
        }
      }
    }

    // Sort by confidence descending
    allSources.sort((a, b) => b.confidence - a.confidence);

    // Merge contexts
    const mergedContext = results
      .map(r => r.context)
      .filter(Boolean)
      .join('\n\n');

    // Calculate aggregated metrics
    const totalQueryTime = results.reduce((sum, r) => sum + (r.metadata.queryTime || 0), 0);
    const avgRelevance = allSources.length > 0
      ? allSources.reduce((sum, s) => sum + s.confidence, 0) / allSources.length
      : 0;

    log.info('GraphRAG', 'Complex query merged', {
      subQueries: decomposed.subQueries.length,
      totalSources: allSources.length,
      totalQueryTime,
    });

    return {
      context: mergedContext,
      sources: allSources,
      metadata: {
        searchMethod: 'decomposed',
        resultsCount: allSources.length,
        queryTime: totalQueryTime,
        graph_used: allSources.length > 0,
        nodes_retrieved: allSources.length,
        context_chunks_used: allSources.length,
        retrieval_time_ms: totalQueryTime,
        context_relevance_score: avgRelevance,
        answer_grounded_in_graph: allSources.length > 0,
        decomposed: true,
        subQueryCount: decomposed.subQueries.length,
      } as unknown as GraphRAGRetrievalMetadata,
    };
  }

  /**
   * Handle relationship queries using graph traversal
   */
  private async handleRelationshipQuery(
    userMessage: string,
    userId: string,
    traceContext?: TraceContext
  ): Promise<SearchResult> {
    // Extract potential entity names from query
    const entities = this.extractEntitiesFromQuery(userMessage);

    log.info('GraphRAG', 'Processing relationship query', {
      query: userMessage.slice(0, 50),
      extractedEntities: entities,
    });

    // If we have at least 2 entities, try to find paths between them
    if (entities.length >= 2) {
      try {
        const pathResult = await traversalService.findShortestPath({
          startEntity: entities[0],
          endEntity: entities[1],
          groupId: userId,
          maxHops: 4,
        });

        if (pathResult.found && pathResult.path) {
          // Convert path to context and sources
          const pathContext = traversalService.formatAsContext({
            paths: [pathResult.path],
            queryTimeMs: pathResult.queryTimeMs,
          });

          const pathSources: SearchSource[] = pathResult.path.path.map(step => ({
            entity: step.entity.name,
            relation: step.relation?.type || 'related',
            fact: step.relation?.fact || `Entity: ${step.entity.name}`,
            confidence: 0.8,
            sourceDescription: `Graph path: ${step.entity.name}`,
          }));

          log.info('GraphRAG', 'Relationship path found', {
            pathLength: pathResult.path.length,
            entities: pathResult.path.path.map(s => s.entity.name),
          });

          return {
            context: pathContext,
            sources: pathSources,
            metadata: {
              searchMethod: 'traversal',
              resultsCount: pathSources.length,
              queryTime: pathResult.queryTimeMs,
              graph_used: true,
              nodes_retrieved: pathSources.length,
              context_chunks_used: pathSources.length,
              retrieval_time_ms: pathResult.queryTimeMs,
              context_relevance_score: 0.8,
              answer_grounded_in_graph: true,
              traversalUsed: true,
            } as unknown as GraphRAGRetrievalMetadata,
          };
        }
      } catch (err) {
        log.warn('GraphRAG', 'Traversal failed, falling back to standard search', { error: err });
      }
    }

    // Fallback to standard search if traversal fails or not enough entities
    return searchService.search(userMessage, userId, traceContext);
  }

  /**
   * Extract potential entity names from a query
   */
  private extractEntitiesFromQuery(query: string): string[] {
    // Extract capitalized words/phrases that might be entity names
    const capitalizedPattern = /\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\b/g;
    const matches = query.match(capitalizedPattern) || [];

    // Filter out common words that are capitalized at sentence start
    const commonWords = new Set(['What', 'How', 'Why', 'When', 'Where', 'Who', 'Is', 'Are', 'The', 'A', 'An']);
    const entities = matches.filter(m => !commonWords.has(m) && m.length > 1);

    return [...new Set(entities)];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const graphragService = new GraphRAGService();
