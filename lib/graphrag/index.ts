/**
 * GraphRAG Main Exports
 * Centralized exports for the GraphRAG system
 */

// Types
export * from './types';

// Configuration
export { graphragConfig, validateGraphRAGConfig } from './config';

// Parsers
export { parseDocument, parserFactory } from './parsers';
export type { ParseResult } from './parsers';
// Note: Individual parsers (pdfParser, docxParser, textParser) are internal to ParserFactory
// and should not be exported to prevent duplicate module loading

// Graphiti Services
export {
  getGraphitiClient,
  episodeService,
  searchService,
  traversalService,
  type GraphitiEpisode,
  type GraphitiSearchParams,
  type AddEpisodeResult,
  type TraversalOptions,
  type GraphPath,
  type TraversalResult,
} from './graphiti';

// Utils
export {
  temporalClassifier,
  detectTemporalIntent,
  type TemporalIntent,
} from './utils/temporal-classifier';

export {
  queryDecomposer,
  type SubQuery,
  type DecomposedQuery,
} from './utils/query-decomposer';

// Storage
export {
  documentStorage,
  type CreateDocumentData,
} from './storage';

// Services
export {
  documentService,
  graphragService,
} from './service';

export type {
  UploadOptions,
  ProcessingOptions,
  DeleteOptions,
  EnhanceOptions,
  EnhancedPrompt,
  Citation,
  GraphRAGRetrievalMetadata,
  SearchSource,
  SearchMetadata,
} from './service';
