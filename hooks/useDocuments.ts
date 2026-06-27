import { useState, useEffect, useCallback } from 'react';
import type { Document } from '@/lib/graphrag/types';
import { supabase } from '@/lib/supabaseClient';

interface UseDocumentsOptions {
  autoFetch?: boolean;
  userId?: string;
  processed?: boolean;
  fileType?: string;
  search?: string;
}

interface UseDocumentsReturn {
  documents: Document[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
}

export function useDocuments(options: UseDocumentsOptions = {}): UseDocumentsReturn {
  const { autoFetch = true, userId, processed, fileType, search } = options;
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!userId) {
      console.log('[useDocuments] No userId, skipping fetch');
      return;
    }

    console.log('[useDocuments] Fetching documents for userId:', userId);
    setLoading(true);
    setError(null);

    try {
      // Get session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('[useDocuments] No active session');
        throw new Error('No active session');
      }

      console.log('[useDocuments] Session valid, access_token exists:', !!session.access_token);

      // Build query params
      const params = new URLSearchParams();
      if (processed !== undefined) params.append('processed', String(processed));
      if (fileType) params.append('fileType', fileType);
      if (search) params.append('search', search);

      const url = `/api/graphrag/documents?${params}`;
      console.log('[useDocuments] Fetching from:', url);

      // Add timeout to prevent blocking page load
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[useDocuments] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useDocuments] Error response:', errorText);
        throw new Error(`Failed to fetch documents: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[useDocuments] Received data:', {
        documentsCount: data.documents?.length || 0,
        documents: data.documents
      });
      setDocuments(data.documents || []);
    } catch (err) {
      // Handle timeout gracefully - don't block page load
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn('[useDocuments] Request timed out after 5s - continuing without documents');
        setDocuments([]);
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('[useDocuments] Error fetching documents:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, processed, fileType, search]);

  const deleteDocument = useCallback(async (id: string) => {
    if (!userId) return;

    try {
      // Get session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(`/api/graphrag/delete/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete document: ${response.statusText}`);
      }

      // Refresh documents list
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error deleting document:', err);
      throw err;
    }
  }, [userId, fetchDocuments]);

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    if (autoFetch && userId) {
      console.log('[useDocuments] Auto-fetch triggered for userId:', userId);
      fetchDocuments();
    }
    // Only re-run when autoFetch, userId, or filter params change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch, userId, processed, fileType, search]);

  return {
    documents,
    loading,
    error,
    refetch: fetchDocuments,
    deleteDocument,
  };
}
