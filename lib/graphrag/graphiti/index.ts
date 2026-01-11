/**
 * Graphiti Module Exports
 * Client, episode management, and search services
 */

// Client
export {
  GraphitiClient,
  getGraphitiClient,
  resetGraphitiClient,
  type GraphitiConfig,
  type GraphitiEpisode,
  type GraphitiEpisodeResponse,
  type GraphitiSearchParams,
  type GraphitiSearchResult,
  type GraphitiHealthResponse,
} from './client';

// Episode Service
export {
  EpisodeService,
  episodeService,
  type AddEpisodeResult,
  type AddDocumentOptions,
} from './episode-service';

// Search Service
export {
  SearchService,
  searchService,
} from './search-service';

// Traversal Service
export {
  TraversalService,
  traversalService,
  type TraversalOptions,
  type GraphPath,
  type GraphPathStep,
  type TraversalResult,
  type ShortestPathOptions,
  type ShortestPathResult,
} from './traversal-service';
