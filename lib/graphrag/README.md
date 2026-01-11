# GraphRAG Module

**Knowledge Graph-Enhanced Retrieval-Augmented Generation**

This module provides automatic document processing and knowledge graph integration for enhanced AI chat responses.

---

## Overview

The GraphRAG module automatically:
1. Parses documents (PDF, TXT, MD, DOCX)
2. Extracts entities and relationships via Graphiti
3. Stores knowledge in Neo4j graph database
4. Enhances chat responses with relevant context
5. Provides citation tracking

---

## Architecture

```
┌─────────────────────────────────────────┐
│           GraphRAG Module               │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────┐  ┌──────────┐  ┌────────┐│
│  │ Config  │  │  Types   │  │ Utils  ││
│  └─────────┘  └──────────┘  └────────┘│
│                                         │
│  ┌─────────────────────────────────┐   │
│  │         Parsers                 │   │
│  │  PDF | TXT | MD | DOCX          │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      Graphiti Client            │   │
│  │  Episodes | Search | Health     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │        Storage                  │   │
│  │  Document CRUD (Supabase)       │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │        Services                 │   │
│  │  Document | GraphRAG | Search   │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
         │              │
         ▼              ▼
    Supabase         Neo4j
   PostgreSQL      (via Graphiti)
```

---

## Directory Structure

```
lib/graphrag/
├── index.ts                 # Main module exports
├── config.ts                # Configuration management
├── types.ts                 # TypeScript interfaces
│
├── parsers/                 # Document parsers
│   ├── pdf-parser.ts        # PDF extraction
│   ├── text-parser.ts       # TXT/MD parsing
│   ├── docx-parser.ts       # DOCX parsing
│   └── index.ts             # Parser factory
│
├── graphiti/                # Graphiti integration
│   ├── client.ts            # HTTP client
│   ├── episode-service.ts   # Episode management
│   ├── search-service.ts    # Graph search
│   └── index.ts             # Exports
│
├── storage/                 # Persistence layer
│   ├── document-storage.ts  # Supabase CRUD
│   └── index.ts             # Exports
│
└── service/                 # Business logic
    ├── document-service.ts  # Upload & processing
    ├── graphrag-service.ts  # Chat enhancement
    └── index.ts             # Service exports
```

---

## Quick Start

### 1. Import Services

```typescript
import {
  documentService,
  graphragService,
  searchService,
} from '@/lib/graphrag';
```

### 2. Upload & Process Document

```typescript
const result = await documentService.uploadAndProcess({
  userId: 'user-123',
  file: '/path/to/file.pdf',
  metadata: {
    title: 'My Document',
  }
});
```

### 3. Search Knowledge Graph

```typescript
const searchResult = await searchService.search(
  'What is GraphRAG?',
  'user-123'
);

console.log(searchResult.context);
console.log(searchResult.sources);
```

### 4. Enhance Chat

```typescript
const enhanced = await graphragService.enhancePrompt(
  'user-123',
  'Tell me about my documents'
);

console.log(enhanced.enhancedPrompt); // Prompt with context
console.log(enhanced.citations);      // Source citations
```

---

## Configuration

Set these environment variables:

```bash
# Enable/Disable
GRAPHRAG_ENABLED=true

# Neo4j Database
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password

# Graphiti Service
GRAPHITI_API_URL=http://localhost:8001

# Search Settings
GRAPHRAG_SEARCH_TOP_K=10
GRAPHRAG_SEARCH_METHOD=hybrid

# Processing Settings
GRAPHRAG_CHUNK_SIZE=1000
GRAPHRAG_CHUNK_OVERLAP=200

# Logging
GRAPHRAG_LOG_LEVEL=info
```

Access via:
```typescript
import { graphragConfig } from '@/lib/graphrag/config';

console.log(graphragConfig.enabled);
console.log(graphragConfig.neo4j.uri);
```

---

## Types Reference

### Document
```typescript
interface Document {
  id: string;
  userId: string;
  filename: string;
  fileType: 'pdf' | 'txt' | 'md' | 'docx';
  uploadPath: string;
  processed: boolean;
  neo4jEpisodeIds: string[];
  createdAt: Date;
  metadata: DocumentMetadata;
}
```

### SearchResult
```typescript
interface SearchResult {
  context: string;            // Formatted context text
  sources: SearchSource[];    // Source documents
  metadata: SearchMetadata;   // Query metadata
}
```

### EnhancedPrompt
```typescript
interface EnhancedPrompt {
  originalPrompt: string;     // User's original message
  enhancedPrompt: string;     // With injected context
  citations: Citation[];      // Sources used
  contextsUsed: number;       // Number of contexts
}
```

See `lib/graphrag/types.ts` for complete type definitions.

---

## Services API

### DocumentService

```typescript
// Upload and process new document
await documentService.uploadAndProcess({
  userId: string,
  file: string,              // File path
  metadata?: object
});

// Re-process existing document
await documentService.processDocument(
  documentId: string,
  options?: ProcessingOptions
);

// Delete document
await documentService.deleteDocument(
  documentId: string,
  options?: DeleteOptions
);
```

### GraphRAGService

```typescript
// Enhance chat prompt with context
const result = await graphragService.enhancePrompt(
  userId: string,
  userMessage: string,
  options?: EnhanceOptions
);
```

### SearchService

```typescript
// Search knowledge graph
const result = await searchService.search(
  query: string,
  userId: string
);
```

---

## Parsers

### Supported Formats

- **PDF** - Extracts text from PDF documents
- **TXT** - Plain text files
- **MD** - Markdown files
- **DOCX** - Microsoft Word documents

### Usage

```typescript
import { parseDocument } from '@/lib/graphrag/parsers';

const parsed = await parseDocument('/path/to/file.pdf');

console.log(parsed.content);   // Extracted text
console.log(parsed.metadata);  // File metadata
console.log(parsed.pageCount); // Number of pages
```

---

## Storage

### Document CRUD

```typescript
import { documentStorage } from '@/lib/graphrag/storage';

// Create
const doc = await documentStorage.createDocument({
  userId: 'user-123',
  filename: 'example.pdf',
  fileType: 'pdf',
  uploadPath: 'path/in/storage',
  metadata: {}
});

// Read
const doc = await documentStorage.getDocument(docId);
const docs = await documentStorage.getUserDocuments(userId);

// Update
await documentStorage.updateDocument(docId, {
  processed: true,
  neo4jEpisodeIds: ['episode-1', 'episode-2']
});

// Delete
await documentStorage.deleteDocument(docId);
```

---

## Error Handling

All services use consistent error handling:

```typescript
try {
  await documentService.uploadAndProcess(...);
} catch (error) {
  if (error.message.includes('File too large')) {
    // Handle size error
  } else if (error.message.includes('Unsupported format')) {
    // Handle format error
  } else {
    // Handle other errors
  }
}
```

Enable debug logging:
```bash
GRAPHRAG_LOG_LEVEL=debug
```

---

## Extending

### Add New Parser

```typescript
// lib/graphrag/parsers/my-parser.ts
export async function parseMyFormat(
  filePath: string
): Promise<ParsedDocument> {
  // Your parsing logic
  return {
    content: 'extracted text',
    metadata: {
      title: 'Document Title',
      // ...
    }
  };
}

// Update parser factory
// lib/graphrag/parsers/index.ts
import { parseMyFormat } from './my-parser';

export async function parseDocument(filePath: string) {
  const ext = path.extname(filePath);
  switch (ext) {
    case '.myformat':
      return parseMyFormat(filePath);
    // ...
  }
}
```

### Add Custom Metadata

```typescript
// Extend DocumentMetadata type
interface CustomMetadata extends DocumentMetadata {
  customField: string;
}

// Use in upload
await documentService.uploadAndProcess({
  userId: 'user-123',
  file: '/path/to/file.pdf',
  metadata: {
    customField: 'value',
  } as CustomMetadata
});
```

---

## Testing

### Unit Tests

```typescript
import { parseDocument } from '@/lib/graphrag/parsers';

describe('PDF Parser', () => {
  it('should extract text from PDF', async () => {
    const result = await parseDocument('test.pdf');
    expect(result.content).toBeDefined();
    expect(result.metadata.title).toBeDefined();
  });
});
```

### Integration Tests

```typescript
import { documentService } from '@/lib/graphrag';

describe('Document Service', () => {
  it('should upload and process document', async () => {
    const result = await documentService.uploadAndProcess({
      userId: 'test-user',
      file: 'test.pdf',
    });
    expect(result.document.processed).toBe(false);
    // Wait for processing...
  });
});
```

---

## Performance

### Benchmarks (Expected)

| Operation | Time |
|-----------|------|
| Parse PDF (5 pages) | ~1-2s |
| Upload to Supabase | ~500ms |
| Process with Graphiti | ~10-30s |
| Search graph | <500ms |
| Enhance prompt | ~200-500ms |

### Optimization Tips

1. **Chunking:** Adjust `GRAPHRAG_CHUNK_SIZE` based on use case
2. **Parallel Processing:** Process multiple documents concurrently
3. **Caching:** Results are cached in Neo4j
4. **Connection Pooling:** Singleton clients reduce overhead

---

## Troubleshooting

### Common Issues

**"Graphiti service unavailable"**
- Check Graphiti is running: `curl http://localhost:8001/health`
- Verify `GRAPHITI_API_URL` is correct

**"Neo4j connection failed"**
- Ensure Neo4j is running
- Check credentials in environment variables

**"Document not processing"**
- Check Graphiti logs: `docker logs graphiti`
- Verify document format is supported
- Check file size is within limits

**"Search returns no results"**
- Ensure document is marked `processed: true`
- Check `neo4jEpisodeIds` array is not empty
- Verify search query matches document content

---

## Dependencies

### Production
- `pdf-parse` - PDF text extraction
- `mammoth` - DOCX parsing
- `@supabase/supabase-js` - Database client

### Peer Dependencies
- `next` - Framework
- `react` - UI (for components)

---

## Version History

### v1.0.0 (October 10, 2025)
- ✅ Initial release
- ✅ PDF, TXT, MD, DOCX parsers
- ✅ Graphiti integration
- ✅ Neo4j storage
- ✅ Chat enhancement
- ✅ Search service
- ✅ Document management

---

## Contributing

When adding features:
1. Update types in `types.ts`
2. Add service methods
3. Update documentation
4. Add tests
5. Update examples

---

## License

Same as parent project.

---

**Module Version:** 1.0.0  
**Last Updated:** October 10, 2025  
**Status:** Production Ready ✅
