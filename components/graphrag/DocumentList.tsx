'use client';

import { useState, useEffect, useMemo } from 'react';
import { File, Trash2, CheckCircle, Clock, AlertCircle, Search } from 'lucide-react';
import { useDocuments } from '@/hooks/useDocuments';
import type { Document } from '@/lib/graphrag/types';

interface DocumentListProps {
  userId: string;
}

export function DocumentList({ userId }: DocumentListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProcessed, setFilterProcessed] = useState<boolean | undefined>(undefined);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const { documents, loading, error, refetch, deleteDocument } = useDocuments({
    userId,
    search: searchQuery || undefined,
    processed: filterProcessed,
  });

  // Track initial load completion
  useEffect(() => {
    if (!loading && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Memoize whether there are processing documents to avoid effect loop
  const hasProcessingDocs = useMemo(
    () => documents.some(doc => !doc.processed),
    [documents]
  );

  // Auto-refresh every 3 seconds if there are processing documents
  // Stop after 5 minutes to prevent infinite polling
  useEffect(() => {
    // Only set up interval if there are processing docs and no error
    if (!hasProcessingDocs || error) {
      console.log('[DocumentList] No processing docs or error present, skipping auto-refresh');
      return;
    }

    console.log('[DocumentList] Setting up auto-refresh for processing documents');
    const startTime = Date.now();
    const MAX_POLLING_DURATION = 5 * 60 * 1000; // 5 minutes

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed > MAX_POLLING_DURATION) {
        console.warn('[DocumentList] Polling timeout reached (5 minutes). Stopping auto-refresh.');
        console.warn('[DocumentList] Documents may still be processing. Please refresh manually.');
        clearInterval(interval);
        return;
      }

      console.log('[DocumentList] Auto-refreshing for processing documents');
      refetch();
    }, 3000);

    return () => {
      console.log('[DocumentList] Clearing auto-refresh interval');
      clearInterval(interval);
    };
  }, [hasProcessingDocs, error, refetch]);

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
      return;
    }

    try {
      await deleteDocument(id);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (processed: boolean) => {
    if (processed) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    return <Clock className="w-5 h-5 text-yellow-500 animate-pulse" />;
  };

  const getStatusText = (processed: boolean) => {
    return processed ? 'Processed' : 'Processing';
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          My Documents
        </h2>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterProcessed === undefined ? 'all' : filterProcessed ? 'processed' : 'processing'}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'all') {
                setFilterProcessed(undefined);
              } else if (value === 'processed') {
                setFilterProcessed(true);
              } else {
                setFilterProcessed(false);
              }
            }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="processed">Processed</option>
            <option value="processing">Processing</option>
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Loading State - Only show on initial load */}
      {loading && !initialLoadComplete && (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading documents...</p>
        </div>
      )}

      {/* Empty State */}
      {initialLoadComplete && documents.length === 0 && (
        <div className="text-center py-12">
          <File className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            {searchQuery || filterProcessed !== undefined
              ? 'No documents found matching your filters'
              : 'No documents uploaded yet'}
          </p>
        </div>
      )}

      {/* Document List */}
      {initialLoadComplete && documents.length > 0 && (
        <div className="space-y-3">
          {documents.map((doc: Document) => (
            <div
              key={doc.id}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <File className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {doc.filename}
                    </h3>
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center space-x-1">
                        {getStatusIcon(doc.processed)}
                        <span>{getStatusText(doc.processed)}</span>
                      </span>
                      <span className="uppercase">{doc.fileType}</span>
                      {doc.metadata.fileSize && (
                        <span>{(doc.metadata.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                      )}
                      <span>{formatDate(doc.createdAt)}</span>
                      {doc.neo4jEpisodeIds.length > 0 && (
                        <span className="text-green-600 dark:text-green-400">
                          {doc.neo4jEpisodeIds.length} episode{doc.neo4jEpisodeIds.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <button
                  onClick={() => handleDelete(doc.id, doc.filename)}
                  className="ml-4 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Delete document"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Refresh Button */}
      {initialLoadComplete && documents.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            Refresh List
          </button>
        </div>
      )}
    </div>
  );
}
