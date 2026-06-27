# GraphRAG Configuration Guide

All GraphRAG parameters are now configurable via environment variables in your `.env` file.

## Search Configuration

### `GRAPHRAG_ENABLED`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable/disable GraphRAG system entirely
- **Example**: `GRAPHRAG_ENABLED=false`

### `GRAPHRAG_TOP_K`
- **Type**: Number (1-100)
- **Default**: `5`
- **Description**: Number of facts/edges to retrieve from Neo4j per query
- **Example**: `GRAPHRAG_TOP_K=10`
- **Impact**: More results = more context but higher token usage

### `GRAPHRAG_SEARCH_THRESHOLD`
- **Type**: Float (0.0-1.0)
- **Default**: `0.7`
- **Description**: Minimum confidence score for results (0=all, 1=only perfect matches)
- **Example**: `GRAPHRAG_SEARCH_THRESHOLD=0.5`
- **Impact**: Lower = more results but less relevant

### `GRAPHRAG_SEARCH_METHOD`
- **Type**: String
- **Options**: `semantic`, `keyword`, `hybrid`
- **Default**: `hybrid`
- **Description**: Search strategy for finding relevant context
  - `semantic`: Vector similarity only (understands meaning)
  - `keyword`: Text matching only (exact words)
  - `hybrid`: Both combined (recommended)
- **Example**: `GRAPHRAG_SEARCH_METHOD=semantic`

## Query Classification (Skip Patterns)

Control when GraphRAG searches are skipped for tool-specific queries:

### `GRAPHRAG_SKIP_MATH`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Skip GraphRAG search for math calculations (e.g., "50*2", "calculate 100/4")
- **Example**: `GRAPHRAG_SKIP_MATH=false`
- **Why**: Math should use calculator tool, not documents

### `GRAPHRAG_SKIP_DATETIME`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Skip GraphRAG search for date/time queries (e.g., "what time is it")
- **Example**: `GRAPHRAG_SKIP_DATETIME=false`
- **Why**: DateTime should use datetime tool, not documents

### `GRAPHRAG_SKIP_WEBSEARCH`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Skip GraphRAG search for explicit web search requests (e.g., "search for X")
- **Example**: `GRAPHRAG_SKIP_WEBSEARCH=false`
- **Why**: Web search should use web_search tool, not documents

## Document Processing

### `GRAPHRAG_MAX_FILE_SIZE`
- **Type**: Number (bytes)
- **Default**: `10485760` (10MB)
- **Description**: Maximum size for uploaded documents
- **Example**: `GRAPHRAG_MAX_FILE_SIZE=20971520` (20MB)

### `GRAPHRAG_CHUNK_SIZE`
- **Type**: Number (characters)
- **Default**: `2000`
- **Description**: Characters per document chunk when processing
- **Example**: `GRAPHRAG_CHUNK_SIZE=3000`
- **Impact**: Larger chunks = more context per fact but fewer total facts

## Example Configurations

### High Recall (Get more results)
```bash
GRAPHRAG_TOP_K=10
GRAPHRAG_SEARCH_THRESHOLD=0.5
GRAPHRAG_SEARCH_METHOD=hybrid
```

### High Precision (Get only best matches)
```bash
GRAPHRAG_TOP_K=3
GRAPHRAG_SEARCH_THRESHOLD=0.85
GRAPHRAG_SEARCH_METHOD=semantic
```

### Disable Query Skipping (Search everything)
```bash
GRAPHRAG_SKIP_MATH=false
GRAPHRAG_SKIP_DATETIME=false
GRAPHRAG_SKIP_WEBSEARCH=false
```

### Disable GraphRAG Completely
```bash
GRAPHRAG_ENABLED=false
```

## Tracing / Observability

GraphRAG retrieval spans can be sent to the Fine-Tune Labs analytics backend
(`finetunelab.com`) via `lib/tracing/trace.service.ts`. Tracing is non-blocking
and degrades gracefully — if it's disabled or the backend is unreachable,
retrieval is unaffected.

**Tracing is OFF by default** and never auto-enables. Because it transmits span
data *and the bearer token* to an external endpoint, it requires an explicit
opt-in flag **and** a dedicated trace token:

```bash
# Required: must be exactly "true" to enable tracing
GRAPHRAG_TRACING_ENABLED=true

# Required: dedicated bearer token for POST /api/analytics/traces.
# SECURITY: this token is sent to GRAPHRAG_TRACE_URL — use a token scoped to the
# trace endpoint. Do NOT reuse SUPABASE_SERVICE_ROLE_KEY or any broad secret.
TRACE_SERVICE_TOKEN=your_dedicated_trace_token

# Optional: base URL of the trace backend (default: https://finetunelab.com)
GRAPHRAG_TRACE_URL=https://finetunelab.com
```

Spans are only emitted when a caller threads a `TraceContext` through
(`searchService.search(query, userId, parentContext)` /
`graphragService.enhancePrompt(..., { traceContext })`).

## How It Works

1. **User sends message** → Query classification checks skip patterns
2. **If not skipped** → Search Neo4j for top K results above threshold
3. **Filter results** → Keep only results >= confidence threshold
4. **Inject context** → Add facts to user's message as context
5. **Send to model** → Model sees both context and original question

## Monitoring

Watch your server logs for these messages:
- `[GraphRAG] Enhanced prompt with X sources` - Context was added
- `[GraphRAG] No relevant context found` - No matches above threshold
- `[GraphRAG] Query classification: SKIP_SEARCH` - Skipped due to pattern
- `[API] GraphRAG context added from X sources` - Confirmed injection

## Token Usage

Approximate token cost per message:
- 0 results: +0 tokens
- 5 results: +150-300 tokens
- 10 results: +300-600 tokens

Formula: ~30-60 tokens per fact retrieved
