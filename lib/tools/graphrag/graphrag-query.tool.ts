/**
 * GraphRAG Query Tool - Executor
 * Allows LLM to actively query user's knowledge graph
 */

import { graphragService } from '../../graphrag';

export async function executeGraphRAGQuery(
  args: { query: string; maxResults?: number },
  userId?: string,
  traceContext?: unknown
): Promise<unknown> {
  if (!userId) {
    throw new Error('User ID is required to query knowledge graph. Please ensure you are logged in.');
  }

  const { query, maxResults = 30 } = args;
  const safeMaxResults = Math.min(Math.max(1, maxResults), 50);

  console.log('[GraphRAG Tool] Querying knowledge graph:', {
    userId,
    query: query || '(list all)',
    maxResults: safeMaxResults
  });

  // Use existing GraphRAG service to search
  const enhanced = await graphragService.enhancePrompt(
    userId,
    query || 'list all documents and entities',
    {
      maxSources: safeMaxResults,
      includeMetadata: true,
      traceContext
    }
  );

  // Check if any results found
  if (!enhanced.contextUsed || !enhanced.sources || enhanced.sources.length === 0) {
    console.log('[GraphRAG Tool] No results found');

    return {
      found: false,
      message: query
        ? `No relevant information found for "${query}" in your uploaded documents.`
        : 'You have no documents uploaded yet. Upload documents to build your knowledge graph.',
      query,
      suggestion: 'Try uploading documents first, or refine your search query.'
    };
  }

  // Format results for LLM consumption
  const results = enhanced.sources.map((source, index) => ({
    rank: index + 1,
    fact: source.fact,
    entity: source.entity,
    relation: source.relation,
    sourceDescription: source.sourceDescription || 'No source description',
    confidence: Math.round(source.confidence * 100) / 100 // Round to 2 decimals
  }));

  console.log('[GraphRAG Tool] Found', results.length, 'results');

  // Build summary statistics
  const uniqueEntities = new Set(results.map(r => r.entity)).size;
  const uniqueSources = new Set(results.map(r => r.sourceDescription)).size;
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

  return {
    found: true,
    query: query || 'all documents',
    resultsCount: results.length,
    summary: {
      totalFacts: results.length,
      uniqueEntities,
      uniqueSources,
      averageConfidence: Math.round(avgConfidence * 100) / 100
    },
    results,
    metadata: enhanced.metadata
  };
}
