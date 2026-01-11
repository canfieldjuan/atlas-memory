/**
 * GraphRAG Configuration
 * All settings via environment variables - ZERO hardcoded values
 */

import type { GraphRAGConfig } from './types';

// ============================================================================
// Environment Variable Helpers
// ============================================================================

// Check if we're running on the server side
const isServer = typeof window === 'undefined';

const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (!value && !defaultValue) {
    // Only throw error on server side where env vars should be available
    if (isServer) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    // On client side, return empty string to avoid breaking
    console.warn(`[GraphRAG Config] ${key} not available on client side`);
    return '';
  }
  return value || defaultValue!;
};

const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
};

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

// ============================================================================
// Neo4j Configuration
// ============================================================================

export const neo4jConfig = {
  uri: getEnvVar('NEO4J_URI', 'bolt://localhost:7687'),
  user: getEnvVar('NEO4J_USER', 'neo4j'),
  password: getEnvVar('NEO4J_PASSWORD', 'dummy-password-for-build'), // Default for build-time
  database: getEnvVar('NEO4J_DATABASE', 'neo4j'),
} as const;

// ============================================================================
// Search Configuration
// ============================================================================

export const searchConfig = {
  topK: getEnvNumber('GRAPHRAG_TOP_K', 30),
  searchMethod: (getEnvVar('GRAPHRAG_SEARCH_METHOD', 'hybrid') as 'semantic' | 'keyword' | 'hybrid'),
  threshold: parseFloat(getEnvVar('GRAPHRAG_SEARCH_THRESHOLD', '0.7')),
  skipMathQueries: getEnvBoolean('GRAPHRAG_SKIP_MATH', true),
  skipDateTimeQueries: getEnvBoolean('GRAPHRAG_SKIP_DATETIME', true),
  skipWebSearchQueries: getEnvBoolean('GRAPHRAG_SKIP_WEBSEARCH', true),
};

// ============================================================================
// Processing Configuration
// ============================================================================

export const processingConfig = {
  maxFileSize: getEnvNumber('GRAPHRAG_MAX_FILE_SIZE', 10 * 1024 * 1024), // 10MB default
  chunkSize: getEnvNumber('GRAPHRAG_CHUNK_SIZE', 2000), // Characters per section
  chunkOverlap: getEnvNumber('GRAPHRAG_CHUNK_OVERLAP', 200), // Overlap between chunks
  maxChunkChars: getEnvNumber('GRAPHRAG_MAX_CHUNK_CHARS', 4000), // Max chars per chunk for LLM
  supportedTypes: ['pdf', 'txt', 'md', 'docx', 'ts', 'tsx', 'js', 'jsx', 'py'] as ('pdf' | 'txt' | 'md' | 'docx' | 'ts' | 'tsx' | 'js' | 'jsx' | 'py')[],
};

// ============================================================================
// Reranking Configuration
// ============================================================================

export const rerankingConfig = {
  enabled: getEnvBoolean('GRAPHRAG_RERANKING_ENABLED', false),
  type: (getEnvVar('GRAPHRAG_RERANKING_TYPE', 'heuristic') as 'cross-encoder' | 'heuristic' | 'none'),
  model: process.env.GRAPHRAG_RERANK_MODEL,
  topK: getEnvNumber('GRAPHRAG_RERANKING_TOP_K', 10),
  endpoint: process.env.GRAPHRAG_RERANK_ENDPOINT,
};

// ============================================================================
// Fallback Configuration
// ============================================================================

export const fallbackConfig = {
  enabled: getEnvBoolean('GRAPHRAG_FALLBACK_ENABLED', true),
  strategy: (getEnvVar('GRAPHRAG_FALLBACK_STRATEGY', 'cascade') as 'vector' | 'keyword' | 'cascade'),
  minResultsThreshold: getEnvNumber('GRAPHRAG_FALLBACK_MIN_RESULTS', 3),
};

// ============================================================================
// Global GraphRAG Configuration
// ============================================================================

export const graphragConfig: GraphRAGConfig = {
  enabled: getEnvBoolean('GRAPHRAG_ENABLED', true),
  neo4j: neo4jConfig,
  search: searchConfig,
  processing: processingConfig,
  reranking: rerankingConfig,
  fallback: fallbackConfig,
};

// ============================================================================
// Configuration Validation
// ============================================================================

export function validateGraphRAGConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Neo4j validation
  if (!neo4jConfig.uri) {
    errors.push('NEO4J_URI is required');
  }
  if (!neo4jConfig.user) {
    errors.push('NEO4J_USER is required');
  }
  if (!neo4jConfig.password) {
    errors.push('NEO4J_PASSWORD is required');
  }

  // OpenAI validation (Graphiti uses OpenAI by default)
  if (!process.env.OPENAI_API_KEY) {
    errors.push('OPENAI_API_KEY is required for Graphiti');
  }

  // Search validation
  if (searchConfig.topK < 1 || searchConfig.topK > 100) {
    errors.push('GRAPHRAG_TOP_K must be between 1 and 100');
  }
  if (searchConfig.threshold < 0 || searchConfig.threshold > 1) {
    errors.push('GRAPHRAG_SEARCH_THRESHOLD must be between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Configuration Export
// ============================================================================

export default graphragConfig;
