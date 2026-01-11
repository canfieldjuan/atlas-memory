-- ============================================================================
-- GraphRAG Database Schema (Supabase)
-- Simple file tracking - Neo4j handles the knowledge graph
-- ============================================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Documents Table
-- Tracks uploaded documents and their processing status
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'txt', 'md', 'docx', 'ts', 'tsx', 'js', 'jsx', 'py')),
  upload_path TEXT NOT NULL,
  document_hash TEXT,
  content TEXT,
  processed BOOLEAN DEFAULT FALSE,
  neo4j_episode_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT valid_filename CHECK (length(filename) > 0),
  CONSTRAINT valid_upload_path CHECK (length(upload_path) > 0)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(processed);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_documents_document_hash ON documents(document_hash) WHERE document_hash IS NOT NULL;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Users can insert their own documents
CREATE POLICY "Users can insert their own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own documents
CREATE POLICY "Users can view their own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own documents
CREATE POLICY "Users can update their own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own documents
CREATE POLICY "Users can delete their own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Storage Bucket
-- For storing uploaded document files
-- ============================================================================

-- Create documents bucket (run this in Supabase Dashboard > Storage)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('documents', 'documents', false);

-- Storage RLS Policies
-- Users can upload files to their own folder
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view their own files
CREATE POLICY "Users can view own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own files
CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- Updated At Trigger
-- Automatically update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get user's document count
CREATE OR REPLACE FUNCTION get_user_document_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM documents
    WHERE user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's processed document count
CREATE OR REPLACE FUNCTION get_user_processed_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM documents
    WHERE user_id = p_user_id AND processed = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Notes
-- ============================================================================

/*
Neo4j Knowledge Graph Schema (Managed by Graphiti):
- Nodes: Entity (with name, labels, summary, embedding, timestamps)
- Edges: Relation (with name, fact, episodes, timestamps, expired_at)
- Properties: uuid, created_at, group_id (for user isolation)

Graphiti automatically creates and manages:
1. Entity extraction from text
2. Relationship detection
3. Embedding generation (via OpenAI)
4. Temporal tracking (created_at, expired_at)
5. Contradiction handling
6. Graph indices and constraints

To initialize Neo4j for Graphiti:
- Run: graphiti.build_indices_and_constraints()
- This happens automatically on first client initialization
*/
