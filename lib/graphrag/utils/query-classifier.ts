/**
 * Query Classification Utilities
 * Determines if a query should skip GraphRAG search
 *
 * Purpose: Prevent unnecessary Neo4j searches for tool-appropriate queries
 * Use Cases: Math calculations, datetime queries, web searches
 */

import { graphragConfig } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface QueryClassification {
  isMath: boolean;
  isDateTime: boolean;
  isWebSearch: boolean;
  isToolSpecific: boolean;
  shouldSkipSearch: boolean;
  reason?: string;
  detectedPattern?: string;
}

// ============================================================================
// Query Classification Logic
// ============================================================================

/**
 * Classify a user query to determine if GraphRAG search should be skipped
 * 
 * @param query - User's query string
 * @returns Classification result with reasoning
 * 
 * @example
 * classifyQuery("50*2") 
 * // => { isMath: true, shouldSkipSearch: true, reason: "Math calculation" }
 * 
 * classifyQuery("What is RTX 4090 TDP?")
 * // => { isMath: false, shouldSkipSearch: false }
 */
export function classifyQuery(query: string): QueryClassification {
  if (!query || typeof query !== 'string') {
    return {
      isMath: false,
      isDateTime: false,
      isWebSearch: false,
      isToolSpecific: false,
      shouldSkipSearch: false,
      reason: 'Invalid query',
    };
  }

  const q = query.toLowerCase().trim();

  // Check each query type (respecting config flags)
  const isMath = graphragConfig.search.skipMathQueries && detectMathQuery(q);
  const isDateTime = graphragConfig.search.skipDateTimeQueries && detectDateTimeQuery(q);
  const isWebSearch = graphragConfig.search.skipWebSearchQueries && detectWebSearchQuery(q);

  const isToolSpecific = isMath || isDateTime || isWebSearch;

  return {
    isMath,
    isDateTime,
    isWebSearch,
    isToolSpecific,
    shouldSkipSearch: isToolSpecific,
    reason: isToolSpecific ? getSkipReason(isMath, isDateTime, isWebSearch) : undefined,
    detectedPattern: isToolSpecific ? getDetectedPattern(q, isMath, isDateTime, isWebSearch) : undefined,
  };
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect if query is a PURE mathematical calculation
 * Mixed queries (math + knowledge) should NOT skip search
 */
function detectMathQuery(query: string): boolean {
  // First check: If query has knowledge-seeking keywords, don't treat as pure math
  // This handles mixed queries like "What is 50*2 and tell me about RTX 4090"
  const knowledgeKeywords = /\b(tell me about|what is .{10,}|explain|describe|about|information|details|how does|why|who|where)\b/i;
  if (knowledgeKeywords.test(query)) {
    // Check if this is truly mixed (has both math AND substantial text)
    const hasSubstantialText = query.replace(/[\d\s\+\-\*\/\%\(\)\.]+/g, '').trim().length > 20;
    if (hasSubstantialText) {
      return false; // Mixed query - don't skip search
    }
  }

  // Pattern 1: Pure arithmetic expressions (just numbers and operators)
  if (/^[\d\s\+\-\*\/\%\(\)\.]+$/.test(query)) {
    return true;
  }

  // Pattern 2: Simple math with "what is" prefix (what is 50*2)
  if (/^(what is|how much is|calculate|compute)\s+[\d\s\+\-\*\/\%\(\)\.]+\??$/i.test(query)) {
    return true;
  }

  // Pattern 3: Percentage calculations (23% of 456) - only if no other content
  if (/^\d+\s*%\s*of\s*\d+\??$/i.test(query)) {
    return true;
  }

  return false;
}

/**
 * Detect if query is about date/time
 */
function detectDateTimeQuery(query: string): boolean {
  // Pattern 1: Direct time queries
  if (/^(what time|what's the time|current time|what.*time is it)/i.test(query)) {
    return true;
  }

  // Pattern 2: Direct date queries
  if (/^(what.*date|what's the date|current date|today's date)/i.test(query)) {
    return true;
  }

  // Pattern 3: Timezone queries
  if (/(what time in|time in.*timezone|convert.*time)/i.test(query)) {
    return true;
  }

  return false;
}

/**
 * Detect if query is a web search request
 */
function detectWebSearchQuery(query: string): boolean {
  // Pattern 1: Explicit search keywords
  if (/^(search for|search the web|look up|find on web|google)/i.test(query)) {
    return true;
  }

  // Pattern 2: Latest/current information requests
  if (/(latest|current|recent|breaking).*news/i.test(query)) {
    return true;
  }

  return false;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate human-readable reason for skipping search
 */
function getSkipReason(isMath: boolean, isDateTime: boolean, isWebSearch: boolean): string {
  if (isMath) return 'Math calculation - calculator tool appropriate';
  if (isDateTime) return 'DateTime query - datetime tool appropriate';
  if (isWebSearch) return 'Web search query - web_search tool appropriate';
  return 'Tool-specific query';
}

/**
 * Get the detected pattern for logging
 */
function getDetectedPattern(
  query: string,
  isMath: boolean,
  isDateTime: boolean,
  isWebSearch: boolean
): string {
  if (isMath) {
    if (/\d+\s*%\s*of\s*\d+/i.test(query)) return 'percentage_calculation';
    if (/\d+\s*[\+\-\*\/\%]\s*\d+/.test(query)) return 'math_operator';
    if (/^(calculate|compute)/i.test(query)) return 'calculate_keyword';
    return 'arithmetic_expression';
  }
  if (isDateTime) return 'datetime_query';
  if (isWebSearch) return 'web_search_request';
  return 'unknown';
}
