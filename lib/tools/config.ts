// Tool System - Centralized Configuration
// Phase 1.2: All tool configurations in one place
// Date: October 10, 2025
// NO HARDCODED VALUES - All configurable via environment variables

/**
 * Calculator Tool Configuration
 */
export const calculatorConfig = {
  enabled: process.env.TOOL_CALCULATOR_ENABLED !== 'false', // Default: true
  maxExpressionLength: parseInt(process.env.CALCULATOR_MAX_LENGTH || '1000'),
  timeout: parseInt(process.env.CALCULATOR_TIMEOUT_MS || '5000'),
  allowedFunctions: [
    'sqrt', 'pow', 'abs', 'ceil', 'floor', 'round',
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'log', 'log10', 'exp', 'min', 'max'
  ],
  // User can replace this entire config when integrating their sophisticated calculator
};

/**
 * DateTime Tool Configuration
 */
export const datetimeConfig = {
  enabled: process.env.TOOL_DATETIME_ENABLED !== 'false', // Default: true
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'UTC',
  supportedOperations: ['current', 'convert', 'format'],
  allowedTimezones: [
    'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
    'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai',
    'Australia/Sydney'
  ],
  dateFormat: process.env.DATE_FORMAT || 'YYYY-MM-DD',
  timeFormat: process.env.TIME_FORMAT || 'HH:mm:ss',
};

/**
 * Web Search Tool Configuration
 */
export const webSearchConfig = {
  enabled: process.env.TOOL_WEBSEARCH_ENABLED === 'true', // Default: false (requires setup)
  primaryProvider: process.env.SEARCH_PRIMARY_PROVIDER || 'brave',
  fallbackProvider: process.env.SEARCH_FALLBACK_PROVIDER || 'serper',
  maxResults: parseInt(process.env.SEARCH_MAX_RESULTS || '5'),
  requestTimeoutMs: parseInt(process.env.SEARCH_TIMEOUT_MS || '15000'),
  cacheEnabled: process.env.SEARCH_CACHE_ENABLED !== 'false', // Default: true
  cacheTTLSeconds: parseInt(process.env.SEARCH_CACHE_TTL || '900'), // 15 minutes
  rateLimitPerMinute: parseInt(process.env.SEARCH_RATE_LIMIT || '10'),
  minQueryLength: parseInt(process.env.SEARCH_MIN_QUERY_LENGTH || '2'),
  maxQueryLength: parseInt(process.env.SEARCH_MAX_QUERY_LENGTH || '500'),
  logResults: process.env.SEARCH_LOG_RESULTS === 'true',
  brave: {
    apiKey: process.env.BRAVE_SEARCH_API_KEY || '',
    endpoint: process.env.BRAVE_SEARCH_ENDPOINT || 'https://api.search.brave.com/res/v1/web/search',
  },
  serper: {
    apiKey: process.env.SERPER_API_KEY || '',
    endpoint: process.env.SERPER_SEARCH_ENDPOINT || 'https://google.serper.dev/search',
  },
  graphRag: {
    ingestResults: process.env.SEARCH_INGEST_TO_GRAPHRAG === 'true',
    groupId: process.env.SEARCH_INGEST_GROUP_ID || null,
  },
};

/**
 * GraphRAG Query Tool Configuration
 */
export const graphragQueryConfig = {
  enabled: process.env.TOOL_GRAPHRAG_QUERY_ENABLED !== 'false', // Default: true
  maxResults: parseInt(process.env.GRAPHRAG_QUERY_MAX_RESULTS || '30'),
  defaultConfidenceThreshold: parseFloat(process.env.GRAPHRAG_QUERY_MIN_CONFIDENCE || '0.7'),
};

/**
 * Global Tool System Configuration
 */
export const globalToolConfig = {
  enableToolExecution: process.env.ENABLE_TOOL_EXECUTION !== 'false',
  logExecutions: process.env.LOG_TOOL_EXECUTIONS !== 'false',
  maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_TOOLS || '3'),
  defaultTimeout: parseInt(process.env.TOOL_DEFAULT_TIMEOUT_MS || '30000'),
};

/**
 * Export all configs
 */
export const toolConfigs = {
  calculator: calculatorConfig,
  datetime: datetimeConfig,
  webSearch: webSearchConfig,
  graphragQuery: graphragQueryConfig,
  global: globalToolConfig,
};
