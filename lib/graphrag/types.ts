/**
 * GraphRAG Types
 * Core interfaces for Graphiti-powered GraphRAG system
 */

// ============================================================================
// Document Types
// ============================================================================

export interface Document {
  id: string;
  userId: string;
  filename: string;
  fileType: DocumentFileType;
  uploadPath: string;
  documentHash: string;
  content?: string; // Optional for list views (excludes large content field)
  processed: boolean;
  neo4jEpisodeIds: string[];
  createdAt: Date;
  metadata: DocumentMetadata;
  version: number;
  parentId: string | null;
}

export type DocumentFileType = 'pdf' | 'txt' | 'md' | 'docx' | 'ts' | 'tsx' | 'js' | 'jsx' | 'py';

export interface DocumentMetadata {
  userId: string;
  filename: string;
  documentName: string;
  fileSize?: number;
  author?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface CreateDocumentData {
  userId: string;
  filename: string;
  fileType: DocumentFileType;
  uploadPath: string;
  documentHash: string;
  content: string;
  metadata?: Partial<DocumentMetadata>;
  version?: number;
  parentId?: string | null;
}

export interface UpdateDocumentData {
  filename?: string;
  processed?: boolean;
  neo4jEpisodeIds?: string[];
  metadata?: Partial<DocumentMetadata>;
}

// ============================================================================
// Graphiti Episode Types
// ============================================================================

export interface Episode {
  episodeId: string;
  name: string;
  content: string;
  source: string;
  groupId: string;
  timestamp: Date;
}

export interface EpisodeResult {
  episodeId: string;
  entitiesCreated: number;
  relationsCreated: number;
}

// ============================================================================
// Search & Retrieval Types
// ============================================================================

export interface SearchResult {
  context: string;
  sources: SearchSource[];
  metadata: SearchMetadata;
}

export interface SearchSource {
  entity: string;
  relation: string;
  fact: string;
  confidence: number;
  sourceDescription?: string;
}

export interface SearchMetadata {
  searchMethod: 'semantic' | 'keyword' | 'hybrid';
  resultsCount: number;
  queryTime: number;
}

/**
 * Enhanced metadata for GraphRAG retrieval analytics
 * Used for testing fine-tuned models with RAG to validate retrieval effectiveness
 */
export interface GraphRAGRetrievalMetadata extends SearchMetadata {
  // Core retrieval metrics
  graph_used: boolean;
  nodes_retrieved: number;
  context_chunks_used: number;
  retrieval_time_ms: number;

  // Quality signals
  context_relevance_score: number;  // 0-1 average relevance
  answer_grounded_in_graph: boolean;

  // Inherited from SearchMetadata:
  // searchMethod: 'semantic' | 'keyword' | 'hybrid';
  // resultsCount: number;
  // queryTime: number;
}

export interface SearchOptions {
  topK?: number;
  groupIds?: string[];
  searchMethod?: 'semantic' | 'keyword' | 'hybrid';
  threshold?: number;
}

// ============================================================================
// Graph Entity Types
// ============================================================================

export interface GraphEntity {
  uuid: string;
  name: string;
  labels: string[];
  summary: string;
  createdAt: Date;
}

export interface GraphRelation {
  uuid: string;
  name: string;
  fact: string;
  sourceNode: string;
  targetNode: string;
  episodes: string[];
  createdAt: Date;
  expiredAt?: Date;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface GraphRAGConfig {
  enabled: boolean;
  neo4j: Neo4jConfig;
  search: SearchConfig;
  processing: ProcessingConfig;
  reranking?: RerankingConfig;
  fallback?: FallbackConfig;
}

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database?: string;
}

export interface SearchConfig {
  topK: number;
  searchMethod: 'semantic' | 'keyword' | 'hybrid';
  threshold: number;
  skipMathQueries: boolean;
  skipDateTimeQueries: boolean;
  skipWebSearchQueries: boolean;
}

export interface ProcessingConfig {
  maxFileSize: number;
  chunkSize: number;
  chunkOverlap: number;
  maxChunkChars: number;
  supportedTypes: DocumentFileType[];
}

export interface RerankingConfig {
  enabled: boolean;
  type: 'cross-encoder' | 'heuristic' | 'none';
  model?: string;
  topK: number;
  endpoint?: string;
}

export interface FallbackConfig {
  enabled: boolean;
  strategy: 'vector' | 'keyword' | 'cascade';
  minResultsThreshold: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface UploadResponse {
  document: Document;
  message: string;
}

export type ProcessingState =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'partial_failure'
  | 'failed';

export interface ProcessingStatus {
  documentId: string;
  processed: boolean;
  episodeIds: string[];
  error?: string;
  // Enhanced tracking fields
  status?: ProcessingState;
  totalChunks?: number;
  successfulChunks?: number;
  failedChunks?: number;
}

export interface DeleteResponse {
  success: boolean;
  documentId: string;
}

// ============================================================================
// Code-Specific Types
// ============================================================================

export interface CodeMetadata extends DocumentMetadata {
  language: 'typescript' | 'javascript' | 'python';
  fileType: 'ts' | 'tsx' | 'js' | 'jsx' | 'py';
  filePath?: string;
  lineCount: number;
  functionCount: number;
  classCount: number;
  importCount: number;
}

export interface CodeEntity {
  type: 'file' | 'class' | 'function' | 'interface' | 'type' | 'import' | 'export';
  name: string;
  startLine: number;
  endLine: number;
  filePath: string;
  signature?: string;
  typeParameters?: string[];
  properties?: string[];
}

export type CodeRelationType =
  | 'IMPORTS'
  | 'EXPORTS'
  | 'CALLS'
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'DEFINES'
  | 'USES_TYPE';

export interface CodeRelation {
  type: CodeRelationType;
  source: CodeEntity;
  target: CodeEntity;
  context?: string;
}

export interface CodeChunk {
  content: string;
  entities: CodeEntity[];
  imports: string[];
  exports: string[];
  filePath: string;
  startLine: number;
  endLine: number;
  chunkType: 'function' | 'class' | 'interface' | 'type' | 'module';
  dependencies: string[];
}
