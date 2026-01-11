/**
 * Query Expansion Utilities
 * Transforms user queries to improve GraphRAG search recall
 *
 * Purpose: Avoid false negatives by generating query variants
 * that strip command prefixes while preserving search intent
 */

// ============================================================================
// Types
// ============================================================================

export interface ExpandedQuery {
  original: string;
  variants: string[];
  transformationsApplied: string[];
}

// ============================================================================
// Query Expansion
// ============================================================================

/**
 * Expand a user query into multiple search variants
 * Helps catch relevant results that might be missed by the original phrasing
 *
 * @param query - Original user query
 * @returns Expanded query with variants and transformation info
 *
 * @example
 * expandQuery("search for RTX 4090 specs")
 * // => { variants: ["search for RTX 4090 specs", "RTX 4090 specs"], ... }
 */
export function expandQuery(query: string): ExpandedQuery {
  if (!query || typeof query !== 'string') {
    return {
      original: query || '',
      variants: [],
      transformationsApplied: [],
    };
  }

  const trimmed = query.trim();
  const variants: string[] = [trimmed];
  const transformationsApplied: string[] = [];

  // Remove "search for" or "search the web for" prefix
  const searchMatch = trimmed.match(/^search\s+(for\s+|the\s+web\s+for\s+)?(.+)$/i);
  if (searchMatch && searchMatch[2]) {
    const withoutPrefix = searchMatch[2].trim();
    if (withoutPrefix && !variants.includes(withoutPrefix)) {
      variants.push(withoutPrefix);
      transformationsApplied.push('remove_search_prefix');
    }
  }

  // Remove "in my documents" suffix
  const docMatch = trimmed.match(/^(.+?)\s+in\s+my\s+documents?\s*$/i);
  if (docMatch && docMatch[1]) {
    const withoutSuffix = docMatch[1].trim();
    if (withoutSuffix && !variants.includes(withoutSuffix)) {
      variants.push(withoutSuffix);
      transformationsApplied.push('remove_document_suffix');
    }
  }

  // Remove "look up" prefix
  const lookupMatch = trimmed.match(/^look\s+up\s+(.+)$/i);
  if (lookupMatch && lookupMatch[1]) {
    const withoutPrefix = lookupMatch[1].trim();
    if (withoutPrefix && !variants.includes(withoutPrefix)) {
      variants.push(withoutPrefix);
      transformationsApplied.push('remove_lookup_prefix');
    }
  }

  // Remove "find" prefix when followed by substantial content
  const findMatch = trimmed.match(/^find\s+(?:me\s+)?(?:information\s+(?:about|on)\s+)?(.+)$/i);
  if (findMatch && findMatch[1]) {
    const withoutPrefix = findMatch[1].trim();
    if (withoutPrefix.length > 3 && !variants.includes(withoutPrefix)) {
      variants.push(withoutPrefix);
      transformationsApplied.push('remove_find_prefix');
    }
  }

  // Remove "tell me about" prefix
  const tellMeMatch = trimmed.match(/^tell\s+me\s+(?:about\s+)?(.+)$/i);
  if (tellMeMatch && tellMeMatch[1]) {
    const withoutPrefix = tellMeMatch[1].trim();
    if (withoutPrefix && !variants.includes(withoutPrefix)) {
      variants.push(withoutPrefix);
      transformationsApplied.push('remove_tell_me_prefix');
    }
  }

  // Remove "what is" / "what are" prefix for definition queries
  const whatIsMatch = trimmed.match(/^what\s+(?:is|are)\s+(?:the\s+)?(.+?)(?:\?)?$/i);
  if (whatIsMatch && whatIsMatch[1]) {
    const withoutPrefix = whatIsMatch[1].trim();
    if (withoutPrefix.length > 2 && !variants.includes(withoutPrefix)) {
      variants.push(withoutPrefix);
      transformationsApplied.push('remove_what_is_prefix');
    }
  }

  // Handle "when was X released/announced/launched" - extract entity name
  // This helps temporal queries match entity-focused documents
  const whenWasMatch = trimmed.match(/^when\s+(?:was|were|did)\s+(?:the\s+)?(.+?)\s+(?:released|announced|launched|introduced|created|founded|established|made|built)(?:\?)?$/i);
  if (whenWasMatch && whenWasMatch[1]) {
    const entity = whenWasMatch[1].trim();
    if (entity.length > 2 && !variants.includes(entity)) {
      variants.push(entity);
      transformationsApplied.push('extract_entity_from_temporal');
    }
    // Also add "entity release" variant
    const entityRelease = `${entity} release`;
    if (!variants.includes(entityRelease)) {
      variants.push(entityRelease);
      transformationsApplied.push('add_release_variant');
    }
  }

  // Extract quoted terms as a separate variant
  const quotedMatch = trimmed.match(/"([^"]+)"/);
  if (quotedMatch && quotedMatch[1]) {
    const quotedTerm = quotedMatch[1].trim();
    if (quotedTerm && !variants.includes(quotedTerm)) {
      variants.push(quotedTerm);
      transformationsApplied.push('extract_quoted_term');
    }
  }

  return {
    original: trimmed,
    variants,
    transformationsApplied,
  };
}

/**
 * Get the best variant for searching
 * Prioritizes the most specific/cleaned variant
 *
 * @param expanded - Expanded query result
 * @returns Best query variant for search
 */
export function getBestVariant(expanded: ExpandedQuery): string {
  if (expanded.variants.length === 0) {
    return expanded.original;
  }

  // If we have transformations, the last variant is usually the cleanest
  if (expanded.transformationsApplied.length > 0 && expanded.variants.length > 1) {
    return expanded.variants[expanded.variants.length - 1];
  }

  return expanded.variants[0];
}

/**
 * Check if a query would benefit from expansion
 *
 * @param query - Original query
 * @returns True if query has expandable patterns
 */
export function shouldExpandQuery(query: string): boolean {
  if (!query || typeof query !== 'string') {
    return false;
  }

  const patterns = [
    /^search\s+/i,
    /^look\s+up\s+/i,
    /^find\s+/i,
    /^tell\s+me\s+/i,
    /^what\s+(?:is|are)\s+/i,
    /^when\s+(?:was|were|did)\s+/i,
    /in\s+my\s+documents?\s*$/i,
    /"[^"]+"/,
  ];

  return patterns.some(pattern => pattern.test(query.trim()));
}
