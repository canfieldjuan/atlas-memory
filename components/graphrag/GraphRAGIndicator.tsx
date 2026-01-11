'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import type { Citation } from '@/lib/graphrag/service';

interface GraphRAGIndicatorProps {
  citations?: Citation[];
  contextsUsed?: number;
}

export function GraphRAGIndicator({ citations = [], contextsUsed = 0 }: GraphRAGIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  if (citations.length === 0 && contextsUsed === 0) {
    return null;
  }

  return (
    <div className="mb-4 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden bg-blue-50 dark:bg-blue-900/20">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
            Enhanced with GraphRAG Context
          </span>
          {contextsUsed > 0 && (
            <span className="px-2 py-0.5 text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-full">
              {contextsUsed} {contextsUsed === 1 ? 'source' : 'sources'}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        )}
      </button>

      {/* Expanded Content */}
      {expanded && citations.length > 0 && (
        <div className="px-4 py-3 border-t border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
            This response was enhanced using information from your documents:
          </p>
          <div className="space-y-2">
            {citations.map((citation, index) => (
              <div
                key={index}
                className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-blue-100 dark:border-blue-900"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {citation.source}
                  </p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                    {citation.content}
                  </p>
                  <div className="mt-2 flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all"
                        style={{ width: `${citation.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {Math.round(citation.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
