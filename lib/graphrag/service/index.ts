/**
 * Service Module Exports
 */

export {
  DocumentService,
  documentService,
} from './document-service';

export type {
  UploadOptions,
  ProcessingOptions,
  DeleteOptions,
} from './document-service';

export {
  GraphRAGService,
  graphragService,
} from './graphrag-service';

export type {
  EnhanceOptions,
  EnhancedPrompt,
  Citation,
} from './graphrag-service';

export {
  FallbackService,
  fallbackService,
  type FallbackOptions,
  type FallbackResult,
} from './fallback-service';

// Re-export types from parent types module for convenience
export type {
  GraphRAGRetrievalMetadata,
  SearchSource,
  SearchMetadata,
} from '../types';
