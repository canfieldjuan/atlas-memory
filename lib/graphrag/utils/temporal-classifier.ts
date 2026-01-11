/**
 * Temporal Classifier
 * Detects temporal intent in search queries
 */

// ============================================================================
// Types
// ============================================================================

export interface TemporalIntent {
  isHistorical?: boolean;
  dateFrom?: string;
  dateTo?: string;
  requiresLatest?: boolean;
  dataSourceType?: string;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

const LATEST_PATTERNS = [
  /\b(latest|newest|recent|current|today|now)\b/i,
  /\b(this week|this month|this year)\b/i,
  /\b(up to date|up-to-date)\b/i,
];

const HISTORICAL_PATTERNS = [
  /\b(history|historical|past|previous|old|older|archive|archived)\b/i,
  /\b(used to|formerly|originally)\b/i,
  /\b(back in|back when|years ago|months ago)\b/i,
];

const RELATIVE_DATE_PATTERNS: Array<{ pattern: RegExp; daysDelta: number }> = [
  { pattern: /\blast week\b/i, daysDelta: 7 },
  { pattern: /\blast month\b/i, daysDelta: 30 },
  { pattern: /\blast year\b/i, daysDelta: 365 },
  { pattern: /\blast (\d+) days?\b/i, daysDelta: 0 }, // Dynamic
  { pattern: /\byesterday\b/i, daysDelta: 1 },
];

const EXPLICIT_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/;

// ============================================================================
// Configuration
// ============================================================================

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

const DEFAULT_LATEST_DAYS = getEnvNumber('GRAPHRAG_TEMPORAL_LATEST_DAYS', 30);

// ============================================================================
// Temporal Classifier Implementation
// ============================================================================

export class TemporalClassifier {
  private latestDays: number;

  constructor() {
    this.latestDays = DEFAULT_LATEST_DAYS;
  }

  /**
   * Detect temporal intent from query string
   */
  detect(query: string): TemporalIntent {
    const intent: TemporalIntent = {};
    const lowerQuery = query.toLowerCase();

    // Check for "latest" queries
    if (this.matchesAny(lowerQuery, LATEST_PATTERNS)) {
      intent.requiresLatest = true;
      intent.dateFrom = this.getDateDaysAgo(this.latestDays);
    }

    // Check for historical queries
    if (this.matchesAny(lowerQuery, HISTORICAL_PATTERNS)) {
      intent.isHistorical = true;
    }

    // Check for relative date patterns
    const relativeDates = this.detectRelativeDates(lowerQuery);
    if (relativeDates.dateFrom) {
      intent.dateFrom = relativeDates.dateFrom;
    }
    if (relativeDates.dateTo) {
      intent.dateTo = relativeDates.dateTo;
    }

    // Check for explicit dates
    const explicitDate = EXPLICIT_DATE_PATTERN.exec(query);
    if (explicitDate) {
      const dateStr = explicitDate[0];
      // If date is in the past, treat as "from" filter
      if (new Date(dateStr) < new Date()) {
        intent.dateFrom = dateStr;
      }
    }

    return intent;
  }

  /**
   * Check if query matches any of the patterns
   */
  private matchesAny(query: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(query));
  }

  /**
   * Detect relative date references
   */
  private detectRelativeDates(query: string): { dateFrom?: string; dateTo?: string } {
    for (const { pattern, daysDelta } of RELATIVE_DATE_PATTERNS) {
      const match = pattern.exec(query);
      if (match) {
        // Handle dynamic days (e.g., "last 7 days")
        let days = daysDelta;
        if (daysDelta === 0 && match[1]) {
          days = parseInt(match[1], 10);
        }
        return {
          dateFrom: this.getDateDaysAgo(days),
        };
      }
    }
    return {};
  }

  /**
   * Get ISO date string for N days ago
   */
  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  /**
   * Merge detected intent with search params
   */
  applyToSearchParams(
    params: Record<string, any>,
    intent: TemporalIntent
  ): Record<string, any> {
    const updated = { ...params };

    if (intent.isHistorical !== undefined) {
      updated.is_historical = intent.isHistorical;
    }
    if (intent.dateFrom) {
      updated.date_from = intent.dateFrom;
    }
    if (intent.dateTo) {
      updated.date_to = intent.dateTo;
    }
    if (intent.dataSourceType) {
      updated.data_source_type = intent.dataSourceType;
    }

    return updated;
  }
}

// ============================================================================
// Standalone Function
// ============================================================================

/**
 * Detect temporal intent from query (standalone function)
 */
export function detectTemporalIntent(query: string): TemporalIntent {
  const classifier = new TemporalClassifier();
  return classifier.detect(query);
}

// ============================================================================
// Singleton Export
// ============================================================================

export const temporalClassifier = new TemporalClassifier();
