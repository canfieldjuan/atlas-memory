'use client';

import { useState, useRef } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface DocumentUploadProps {
  userId: string;
  onUploadComplete?: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/typescript',
  'text/javascript',
  'application/javascript',
  'text/x-python',
  'text/x-script.python'
];

const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx', '.ts', '.tsx', '.js', '.jsx', '.py'];

export function DocumentUpload({ userId, onUploadComplete }: DocumentUploadProps) {
  // Note: userId is available in props for future use (e.g., user-specific limits)
  console.log('[DocumentUpload] Component mounted for user:', userId);
  
  // Multi-file state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isHistorical, setIsHistorical] = useState(false);

  // Advanced chunking settings (empty string = use server defaults)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chunkSize, setChunkSize] = useState<string>('');
  const [chunkOverlap, setChunkOverlap] = useState<string>('');
  const [maxChunkChars, setMaxChunkChars] = useState<string>('');

  // Per-file tracking
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [fileProgress, setFileProgress] = useState<Record<string, number>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [fileSuccess, setFileSuccess] = useState<Set<string>>(new Set());

  // Global state
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File validation helper
  const validateFile = (file: File): string | null => {
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType = ALLOWED_TYPES.includes(file.type);
    const isValidExt = ALLOWED_EXTENSIONS.includes(fileExt);

    // Allow if either type or extension is valid (extension is more reliable for code)
    if (!isValidType && !isValidExt) {
      return 'Invalid file type. Supported: PDF, TXT, MD, DOCX, TS, JS, PY';
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`;
    }
    return null;
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleAddFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleAddFiles(files);
  };

  const handleAddFiles = (files: File[]) => {
    console.log('[DocumentUpload] ===== HANDLE ADD FILES =====');
    console.log('[DocumentUpload] Files to add:', files.length);

    const newErrors: Record<string, string> = {};
    const validFiles: File[] = [];

    files.forEach(file => {
      console.log('[DocumentUpload] Processing file:', file.name, 'size:', file.size, 'type:', file.type);

      // Skip if already added
      if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
        console.log('[DocumentUpload] File already in queue:', file.name);
        newErrors[file.name] = 'File already in queue';
        return;
      }

      // Validate file
      const error = validateFile(file);
      if (error) {
        console.error('[DocumentUpload] File validation failed:', file.name, error);
        newErrors[file.name] = error;
      } else {
        console.log('[DocumentUpload] File valid, adding to queue:', file.name);
        validFiles.push(file);
      }
    });

    console.log('[DocumentUpload] Valid files:', validFiles.length);
    console.log('[DocumentUpload] Errors:', Object.keys(newErrors).length);

    // Update states
    setFileErrors(prev => ({ ...prev, ...newErrors }));
    setSelectedFiles(prev => [...prev, ...validFiles]);

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadSingleFile = async (file: File): Promise<void> => {
    const fileName = file.name;

    console.log('[DocumentUpload] ===== UPLOAD SINGLE FILE START =====');
    console.log('[DocumentUpload] Filename:', fileName);
    console.log('[DocumentUpload] File size:', file.size);
    console.log('[DocumentUpload] File type:', file.type);

    try {
      // Mark as uploading
      setUploadingFiles(prev => new Set(prev).add(fileName));
      setFileProgress(prev => ({ ...prev, [fileName]: 0 }));

      // Get session token
      console.log('[DocumentUpload] Getting session token...');
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('[DocumentUpload] No active session found!');
        throw new Error('No active session');
      }

      console.log('[DocumentUpload] Session found, user:', session.user?.email);
      console.log('[DocumentUpload] Token length:', session.access_token.length);

      const formData = new FormData();
      formData.append('file', file);

      // Add chunking settings if provided (otherwise server uses defaults)
      if (chunkSize) {
        formData.append('chunkSize', chunkSize);
      }
      if (chunkOverlap) {
        formData.append('chunkOverlap', chunkOverlap);
      }
      if (maxChunkChars) {
        formData.append('maxChunkChars', maxChunkChars);
      }

      const uploadUrl = '/api/graphrag/upload';
      console.log('[DocumentUpload] Uploading to:', uploadUrl);
      console.log('[DocumentUpload] Timestamp:', new Date().toISOString());

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      console.log('[DocumentUpload] Response status:', response.status);
      console.log('[DocumentUpload] Response ok:', response.ok);

      if (!response.ok) {
        const data = await response.json();
        console.error('[DocumentUpload] Upload failed with error:', data.error);
        throw new Error(data.error || 'Upload failed');
      }

      const responseData = await response.json();
      console.log('[DocumentUpload] ===== UPLOAD SUCCESS =====');
      console.log('[DocumentUpload] Response:', responseData);

      // Success
      setFileProgress(prev => ({ ...prev, [fileName]: 100 }));
      setFileSuccess(prev => new Set(prev).add(fileName));

    } catch (err) {
      console.error('[DocumentUpload] ===== UPLOAD ERROR =====');
      console.error('[DocumentUpload] Error:', err);
      console.error('[DocumentUpload] Error message:', err instanceof Error ? err.message : 'Unknown error');
      console.error('[DocumentUpload] Error stack:', err instanceof Error ? err.stack : 'No stack');

      setFileErrors(prev => ({
        ...prev,
        [fileName]: err instanceof Error ? err.message : 'Upload failed'
      }));
    } finally {
      setUploadingFiles(prev => {
        const next = new Set(prev);
        next.delete(fileName);
        return next;
      });
    }
  };

  const handleUpload = async () => {
    console.log('[DocumentUpload] ===== HANDLE UPLOAD CLICKED =====');
    console.log('[DocumentUpload] Selected files count:', selectedFiles.length);
    console.log('[DocumentUpload] Files:', selectedFiles.map(f => f.name));

    if (selectedFiles.length === 0) {
      console.log('[DocumentUpload] No files selected, returning');
      return;
    }

    setIsUploading(true);

    try {
      // Upload files sequentially
      for (const file of selectedFiles) {
        // Skip already uploaded files
        if (fileSuccess.has(file.name)) {
          console.log('[DocumentUpload] Skipping already uploaded file:', file.name);
          continue;
        }

        console.log('[DocumentUpload] Starting upload for:', file.name);
        await uploadSingleFile(file);
      }

      // Call callback immediately after uploads complete
      console.log('[DocumentUpload] All uploads complete, triggering refresh');
      onUploadComplete?.();

      // Auto-clear successful files after 1.5 seconds (faster feedback)
      console.log('[DocumentUpload] Scheduling auto-clear in 1.5 seconds for', fileSuccess.size, 'files');
      setTimeout(() => {
        console.log('[DocumentUpload] Auto-clear executing, removing successful files');
        setSelectedFiles(prev => {
          const filtered = prev.filter(f => !fileSuccess.has(f.name));
          console.log('[DocumentUpload] Filtered', prev.length, 'files to', filtered.length, 'files');
          return filtered;
        });
        setFileSuccess(new Set());
        setFileErrors({});
        setFileProgress({});
      }, 1500);

    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = (fileName: string) => {
    setSelectedFiles(prev => prev.filter(f => f.name !== fileName));
    setFileErrors(prev => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });
    setFileSuccess(prev => {
      const next = new Set(prev);
      next.delete(fileName);
      return next;
    });
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
    setFileErrors({});
    setFileSuccess(new Set());
    setFileProgress({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
        Upload Document
      </h2>

      {/* Historical Data Checkbox */}
      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <label className="flex items-start space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isHistorical}
            onChange={(e) => setIsHistorical(e.target.checked)}
            disabled={isUploading}
            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Mark as Historical Data
            </span>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Historical training data from past sessions. Can process multiple documents at once.
              <br />
              <span className="font-medium">Note:</span> Larger documents and more files will take longer to process (typically 20-30 seconds per document).
            </p>
          </div>
        </label>
      </div>

      {/* Advanced Chunking Settings */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          disabled={isUploading}
          className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
        >
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span>Advanced Chunking Settings</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Leave empty to use server defaults. Chunk overlap preserves context between chunks.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Chunk Size
                </label>
                <input
                  type="number"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(e.target.value)}
                  placeholder="2000"
                  min="100"
                  max="10000"
                  disabled={isUploading}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 mt-0.5">chars/section</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Chunk Overlap
                </label>
                <input
                  type="number"
                  value={chunkOverlap}
                  onChange={(e) => setChunkOverlap(e.target.value)}
                  placeholder="200"
                  min="0"
                  max="1000"
                  disabled={isUploading}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 mt-0.5">context chars</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max Chunk Chars
                </label>
                <input
                  type="number"
                  value={maxChunkChars}
                  onChange={(e) => setMaxChunkChars(e.target.value)}
                  placeholder="4000"
                  min="500"
                  max="16000"
                  disabled={isUploading}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 mt-0.5">for LLM</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* File Input */}
      <div className="mb-4">
        <label
          htmlFor="file-upload"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className={`w-10 h-10 mb-2 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              PDF, TXT, MD, DOCX, TS, JS, PY (max 10MB per file)
            </p>
          </div>
          <input
            ref={fileInputRef}
            id="file-upload"
            type="file"
            className="hidden"
            accept=".pdf,.txt,.md,.docx,.ts,.tsx,.js,.jsx,.py"
            onChange={handleFileSelect}
            disabled={isUploading}
            multiple
          />
        </label>
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
            </p>
            <button
              onClick={handleClearAll}
              disabled={isUploading}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              Clear All
            </button>
          </div>
          
          {selectedFiles.map((file) => {
            const isUploadingFile = uploadingFiles.has(file.name);
            const isSuccess = fileSuccess.has(file.name);
            const error = fileErrors[file.name];
            const progress = fileProgress[file.name] || 0;

            return (
              <div
                key={`${file.name}-${file.size}`}
                className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    {isUploadingFile && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                    {isSuccess && <CheckCircle className="w-5 h-5 text-green-500" />}
                    {error && <AlertCircle className="w-5 h-5 text-red-500" />}
                    {!isUploadingFile && !isSuccess && !error && (
                      <File className="w-5 h-5 text-gray-500" />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                        {isSuccess && ' - Uploaded! Processing in background...'}
                        {error && ` - ${error}`}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleRemoveFile(file.name)}
                    className="text-red-500 hover:text-red-700 ml-2"
                    disabled={isUploadingFile}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Progress Bar */}
                {isUploadingFile && (
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={selectedFiles.length === 0 || isUploading}
        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
      >
        {isUploading
          ? `Uploading ${uploadingFiles.size} of ${selectedFiles.length}...`
          : `Upload ${selectedFiles.length} Document${selectedFiles.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}
