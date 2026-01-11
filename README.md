# Atlas Memory

Personal AI memory system powered by GraphRAG (Graph-based Retrieval Augmented Generation).

## Architecture

```
atlas-memory/
├── graphiti-wrapper/     # Python FastAPI backend (Neo4j + embeddings)
├── lib/
│   ├── graphrag/         # TypeScript service layer
│   └── tools/graphrag/   # Tool integrations
├── app/api/graphrag/     # API routes
├── components/graphrag/  # React UI components
├── start-graphiti.sh     # Start the GraphRAG server
├── stop-graphiti.sh      # Stop the GraphRAG server
└── Dockerfile.graphiti   # Docker configuration
```

## Requirements

- Python 3.11+
- Node.js 18+
- Neo4j (AuraDB or local)
- OpenAI API key (for embeddings)

## Quick Start

### 1. Set up the Python backend

```bash
cd graphiti-wrapper
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
```

### 2. Start the GraphRAG server

```bash
./start-graphiti.sh
```

### 3. Test the API

```bash
curl http://localhost:8001/health
```

## Features

- **Document ingestion**: Upload and process documents into the knowledge graph
- **Semantic search**: Query your knowledge base with natural language
- **Temporal filtering**: Filter by date ranges and historical context
- **Query decomposition**: Automatically breaks complex queries into sub-queries
- **Relationship traversal**: Find connections between entities
- **Reranking**: Heuristic-based result reranking for better relevance

## Integration with Atlas

This memory system is designed to integrate with the Atlas AI assistant, providing long-term memory and knowledge retrieval capabilities.
