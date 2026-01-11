// GraphRAG Query Tool - Main Export
// Date: December 5, 2025
// Allows LLM to actively query user's knowledge graph

import { ToolDefinition } from '../types';
import { graphragQueryConfig } from '../config';
import { executeGraphRAGQuery } from './graphrag-query.tool';

const graphragQueryTool: ToolDefinition = {
  name: 'query_knowledge_graph',
  description: `Search the user's uploaded documents and knowledge graph for relevant information.

Use this tool when:
- User asks about their uploaded documents or files
- User wants to know what's in their knowledge graph
- User asks questions that might be answered by their documents
- Examples: "what documents do I have", "search my docs for X", "what's in my knowledge graph"

Returns: Facts, entities, and relationships from their documents with confidence scores.

CRITICAL: When presenting knowledge graph results, provide comprehensive analysis:
- Summarize the main topics/themes found
- Highlight key entities and relationships
- Cite specific facts with confidence levels
- Suggest follow-up questions if relevant`,
  version: '1.0.0',

  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant information in the user\'s documents. Use empty string "" to list all documents/entities.'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 30, max: 50)',
      }
    },
    required: ['query'],
  },

  config: {
    enabled: graphragQueryConfig.enabled,
    maxResults: graphragQueryConfig.maxResults,
  },

  async execute(params: Record<string, unknown>, conversationId?: string, userId?: string, supabaseClient?: unknown, traceContext?: unknown) {
    const { query, maxResults } = params;

    if (typeof query !== 'string') {
      throw new Error(
        '[GraphRAGQuery] Parameter validation failed: ' +
        'query is required and must be a string'
      );
    }

    if (maxResults !== undefined && typeof maxResults !== 'number') {
      throw new Error(
        '[GraphRAGQuery] Parameter validation failed: ' +
        'maxResults must be a number if provided'
      );
    }

    if (!userId) {
      throw new Error(
        '[GraphRAGQuery] User ID is required to query knowledge graph. ' +
        'Please ensure user is authenticated.'
      );
    }

    return await executeGraphRAGQuery(
      {
        query,
        maxResults: maxResults as number | undefined
      },
      userId,
      traceContext
    );
  },
};

export default graphragQueryTool;
