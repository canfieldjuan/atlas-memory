/**
 * Temporal Classifier Unit Tests
 * Tests for temporal intent detection in search queries
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment before import
vi.stubGlobal('process', {
  env: {
    GRAPHRAG_TEMPORAL_LATEST_DAYS: '30',
  },
});

import {
  TemporalClassifier,
  detectTemporalIntent,
  temporalClassifier,
} from '../../utils/temporal-classifier';

describe('TemporalClassifier', () => {
  let classifier: TemporalClassifier;

  beforeEach(() => {
    vi.clearAllMocks();
    classifier = new TemporalClassifier();
  });

  describe('Latest Query Detection', () => {
    it('should detect "latest" keyword', () => {
      const intent = classifier.detect('What is the latest update?');
      expect(intent.requiresLatest).toBe(true);
      expect(intent.dateFrom).toBeDefined();
    });

    it('should detect "newest" keyword', () => {
      const intent = classifier.detect('Show me the newest features');
      expect(intent.requiresLatest).toBe(true);
    });

    it('should detect "recent" keyword', () => {
      const intent = classifier.detect('Find recent changes');
      expect(intent.requiresLatest).toBe(true);
    });

    it('should detect "current" keyword', () => {
      const intent = classifier.detect('What is the current status?');
      expect(intent.requiresLatest).toBe(true);
    });

    it('should detect "today" keyword', () => {
      const intent = classifier.detect('What happened today?');
      expect(intent.requiresLatest).toBe(true);
    });

    it('should detect "this week" phrase', () => {
      const intent = classifier.detect('Updates from this week');
      expect(intent.requiresLatest).toBe(true);
    });

    it('should detect "this month" phrase', () => {
      const intent = classifier.detect('What changed this month?');
      expect(intent.requiresLatest).toBe(true);
    });

    it('should detect "up to date" phrase', () => {
      const intent = classifier.detect('Is this information up to date?');
      expect(intent.requiresLatest).toBe(true);
    });

    it('should detect "up-to-date" hyphenated phrase', () => {
      const intent = classifier.detect('Get up-to-date data');
      expect(intent.requiresLatest).toBe(true);
    });
  });

  describe('Historical Query Detection', () => {
    it('should detect "history" keyword', () => {
      const intent = classifier.detect('Show me the history');
      expect(intent.isHistorical).toBe(true);
    });

    it('should detect "historical" keyword', () => {
      const intent = classifier.detect('Historical data analysis');
      expect(intent.isHistorical).toBe(true);
    });

    it('should detect "past" keyword', () => {
      const intent = classifier.detect('What happened in the past?');
      expect(intent.isHistorical).toBe(true);
    });

    it('should detect "previous" keyword', () => {
      const intent = classifier.detect('Previous version details');
      expect(intent.isHistorical).toBe(true);
    });

    it('should detect "archive" keyword', () => {
      const intent = classifier.detect('Check the archive');
      expect(intent.isHistorical).toBe(true);
    });

    it('should detect "used to" phrase', () => {
      const intent = classifier.detect('What did it used to look like?');
      expect(intent.isHistorical).toBe(true);
    });

    it('should detect "years ago" phrase', () => {
      const intent = classifier.detect('What happened 5 years ago?');
      expect(intent.isHistorical).toBe(true);
    });

    it('should detect "back in" phrase', () => {
      const intent = classifier.detect('Back in 2020, what was the policy?');
      expect(intent.isHistorical).toBe(true);
    });
  });

  describe('Relative Date Detection', () => {
    it('should detect "last week" and set dateFrom', () => {
      const intent = classifier.detect('Changes from last week');
      expect(intent.dateFrom).toBeDefined();

      const dateFrom = new Date(intent.dateFrom!);
      const daysDiff = Math.round(
        (Date.now() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysDiff).toBeGreaterThanOrEqual(6);
      expect(daysDiff).toBeLessThanOrEqual(8);
    });

    it('should detect "last month" and set dateFrom', () => {
      const intent = classifier.detect('Report from last month');
      expect(intent.dateFrom).toBeDefined();

      const dateFrom = new Date(intent.dateFrom!);
      const daysDiff = Math.round(
        (Date.now() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysDiff).toBeGreaterThanOrEqual(29);
      expect(daysDiff).toBeLessThanOrEqual(31);
    });

    it('should detect "last year" and set dateFrom', () => {
      const intent = classifier.detect('Data from last year');
      expect(intent.dateFrom).toBeDefined();

      const dateFrom = new Date(intent.dateFrom!);
      const daysDiff = Math.round(
        (Date.now() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysDiff).toBeGreaterThanOrEqual(364);
      expect(daysDiff).toBeLessThanOrEqual(366);
    });

    it('should detect "last N days" pattern', () => {
      const intent = classifier.detect('Changes in the last 14 days');
      expect(intent.dateFrom).toBeDefined();

      const dateFrom = new Date(intent.dateFrom!);
      const daysDiff = Math.round(
        (Date.now() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysDiff).toBeGreaterThanOrEqual(13);
      expect(daysDiff).toBeLessThanOrEqual(15);
    });

    it('should detect "yesterday"', () => {
      const intent = classifier.detect('What happened yesterday?');
      expect(intent.dateFrom).toBeDefined();

      const dateFrom = new Date(intent.dateFrom!);
      const daysDiff = Math.round(
        (Date.now() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)
      );
      // Allow for timing variations (0-2 days due to timezone edge cases)
      expect(daysDiff).toBeGreaterThanOrEqual(0);
      expect(daysDiff).toBeLessThanOrEqual(2);
    });
  });

  describe('Explicit Date Detection', () => {
    it('should detect ISO date format', () => {
      const intent = classifier.detect('Data from 2024-06-15');
      expect(intent.dateFrom).toBe('2024-06-15');
    });

    it('should set dateFrom for past dates', () => {
      const pastDate = '2023-01-15';
      const intent = classifier.detect(`Report from ${pastDate}`);
      expect(intent.dateFrom).toBe(pastDate);
    });

    it('should not set dateFrom for future dates', () => {
      const futureYear = new Date().getFullYear() + 2;
      const futureDate = `${futureYear}-06-15`;
      const intent = classifier.detect(`Scheduled for ${futureDate}`);
      // Should not set dateFrom for future dates
      expect(intent.dateFrom).toBeUndefined();
    });
  });

  describe('applyToSearchParams', () => {
    it('should apply isHistorical to params', () => {
      const intent = { isHistorical: true };
      const params = { query: 'test' };

      const result = classifier.applyToSearchParams(params, intent);

      expect(result.is_historical).toBe(true);
      expect(result.query).toBe('test');
    });

    it('should apply dateFrom to params', () => {
      const intent = { dateFrom: '2024-01-01' };
      const params = { query: 'test' };

      const result = classifier.applyToSearchParams(params, intent);

      expect(result.date_from).toBe('2024-01-01');
    });

    it('should apply dateTo to params', () => {
      const intent = { dateTo: '2024-12-31' };
      const params = { query: 'test' };

      const result = classifier.applyToSearchParams(params, intent);

      expect(result.date_to).toBe('2024-12-31');
    });

    it('should apply dataSourceType to params', () => {
      const intent = { dataSourceType: 'document' };
      const params = { query: 'test' };

      const result = classifier.applyToSearchParams(params, intent);

      expect(result.data_source_type).toBe('document');
    });

    it('should not modify original params object', () => {
      const intent = { isHistorical: true };
      const params = { query: 'test' };

      classifier.applyToSearchParams(params, intent);

      expect(params).not.toHaveProperty('is_historical');
    });
  });

  describe('Edge Cases', () => {
    it('should return empty intent for neutral queries', () => {
      const intent = classifier.detect('How does this feature work?');
      expect(intent.isHistorical).toBeUndefined();
      expect(intent.requiresLatest).toBeUndefined();
      expect(intent.dateFrom).toBeUndefined();
      expect(intent.dateTo).toBeUndefined();
    });

    it('should handle empty query', () => {
      const intent = classifier.detect('');
      expect(intent).toEqual({});
    });

    it('should be case insensitive', () => {
      const intent = classifier.detect('LATEST UPDATES');
      expect(intent.requiresLatest).toBe(true);
    });

    it('should handle queries with both historical and latest markers', () => {
      // In this case, both should be detected
      const intent = classifier.detect('latest history of changes');
      expect(intent.requiresLatest).toBe(true);
      expect(intent.isHistorical).toBe(true);
    });
  });

  describe('Standalone Function', () => {
    it('should work the same as class method', () => {
      const classIntent = classifier.detect('latest updates');
      const funcIntent = detectTemporalIntent('latest updates');

      expect(funcIntent.requiresLatest).toBe(classIntent.requiresLatest);
    });
  });

  describe('Singleton Export', () => {
    it('should export a singleton instance', () => {
      expect(temporalClassifier).toBeInstanceOf(TemporalClassifier);
    });
  });
});
