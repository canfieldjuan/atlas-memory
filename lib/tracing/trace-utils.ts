/**
 * Trace Utilities
 *
 * Truncation utilities for trace data to prevent excessive payload sizes.
 * Ensures traces remain under size limits while preserving important information.
 *
 * Date: 2025-12-20
 */

export interface TruncationLimits {
  maxStringChars: number;
  maxObjectSizeKB: number;
  maxArrayItems: number;
}

export const DEFAULT_LIMITS: TruncationLimits = {
  maxStringChars: 10_000,
  maxObjectSizeKB: 50,
  maxArrayItems: 100,
};

/**
 * Truncate string with indicator showing how much was removed
 *
 * @param str - String to truncate
 * @param maxChars - Maximum characters to keep
 * @returns Truncated string with indicator if truncated
 */
export function truncateString(str: string, maxChars: number): string {
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + `... [truncated ${str.length - maxChars} chars]`;
}

/**
 * Truncate object by estimating JSON size
 *
 * @param obj - Object to truncate
 * @param maxSizeKB - Maximum size in kilobytes
 * @returns Truncated object or fallback structure
 */
export function truncateObject(obj: unknown, maxSizeKB: number): unknown {
  const jsonStr = JSON.stringify(obj);
  const sizeKB = jsonStr.length / 1024;

  if (sizeKB <= maxSizeKB) return obj;

  const maxChars = maxSizeKB * 1024;
  const truncated = jsonStr.slice(0, maxChars);

  try {
    return JSON.parse(truncated + '"}');
  } catch {
    return {
      _truncated: true,
      _originalSizeKB: sizeKB,
      _preview: truncated
    };
  }
}

/**
 * Truncate array to maximum number of items
 *
 * @param arr - Array to truncate
 * @param maxItems - Maximum items to keep
 * @returns Truncated array
 */
export function truncateArray<T>(arr: T[], maxItems: number): T[] {
  if (arr.length <= maxItems) return arr;
  return arr.slice(0, maxItems);
}

/**
 * Specialized truncation for RAG chunks
 * Keeps top N chunks and truncates each fact text
 *
 * @param chunks - Array of RAG chunks with fact, score, and metadata
 * @param maxChunks - Maximum number of chunks to keep (default: 5)
 * @returns Truncated chunks array
 */
export function truncateRAGChunks(
  chunks: Array<{ fact: string; score: number; [key: string]: unknown }>,
  maxChunks: number = 5
): Array<{ fact: string; score: number; [key: string]: unknown }> {
  return chunks
    .slice(0, maxChunks)
    .map(chunk => ({
      ...chunk,
      fact: truncateString(chunk.fact, 500),
    }));
}
