/**
 * Trace Service — emits GraphRAG operation spans to the Fine-Tune Labs
 * analytics backend (finetunelab.com).
 *
 * GraphRAG threads a `TraceContext` through search/retrieval. `startTrace` /
 * `createChildSpan` create the span context locally (no network call), and
 * `endTrace` POSTs the single terminal record to
 * `${GRAPHRAG_TRACE_URL}/api/analytics/traces` in the wire format the backend
 * ingests. (We deliberately don't emit a separate "running" record — see the
 * note in startTrace.) It is non-blocking (fire-and-forget) and degrades
 * gracefully: any config or network error is swallowed so tracing never breaks
 * the main retrieval flow.
 *
 * Configuration (environment variables):
 *   GRAPHRAG_TRACE_URL       Base URL of the trace backend. Optional; defaults
 *                            to https://finetunelab.com when unset. (No fallback
 *                            to the app's own URL — there is no local traces
 *                            route, so that would only produce 404s.)
 *   TRACE_SERVICE_TOKEN      Dedicated API key for the traces endpoint. Required
 *                            to turn tracing on. Sent as the `X-API-Key` header
 *                            (matching atlas_brain/services/tracing.py) and also
 *                            as `Authorization: Bearer`. For the Fine-Tune Labs
 *                            backend, set this to its analytics API key. NOTE:
 *                            this token is sent to GRAPHRAG_TRACE_URL — do NOT
 *                            reuse a Supabase service-role key or other broad
 *                            secret here.
 *   GRAPHRAG_TRACING_ENABLED Must be "true" to enable. Tracing is OFF by default
 *                            because it sends span data and the bearer token to an
 *                            external endpoint — it never auto-enables.
 */
import type {
  TraceContext,
  StartTraceParams,
  TraceResult,
  OperationType,
} from './types';

const DEFAULT_TRACE_URL = 'https://finetunelab.com';
const POST_TIMEOUT_MS = 5000;

function getBaseUrl(): string {
  // Honor only an explicit GRAPHRAG_TRACE_URL; otherwise use the Fine-Tune Labs
  // default. We deliberately do NOT fall back to NEXT_PUBLIC_BASE_URL /
  // NEXT_PUBLIC_APP_URL: there is no local /api/analytics/traces route, so a
  // deployment's own app URL would just 404 every span.
  const url = process.env.GRAPHRAG_TRACE_URL || DEFAULT_TRACE_URL;
  return url.replace(/\/+$/, '');
}

function getAuthToken(): string | undefined {
  // Dedicated trace token only. We deliberately do NOT fall back to
  // SUPABASE_SERVICE_ROLE_KEY: this token is sent to an external endpoint
  // (GRAPHRAG_TRACE_URL), so reusing a broad service-role secret would risk
  // leaking it off-box.
  return process.env.TRACE_SERVICE_TOKEN;
}

function isTracingEnabled(): boolean {
  // Opt-in only. Tracing transmits span data and the bearer token to an external
  // endpoint, so it must be explicitly enabled AND given a dedicated token.
  return process.env.GRAPHRAG_TRACING_ENABLED === 'true' && Boolean(getAuthToken());
}

/** Format: trace_{timestamp}_{random} */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/** Format: span_{timestamp}_{random} */
export function generateSpanId(): string {
  return `span_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export function calculateDuration(startTime: Date, endTime: Date): number {
  return endTime.getTime() - startTime.getTime();
}

/** Context used when tracing is disabled — carries no telemetry. */
function createNoOpContext(params: StartTraceParams): TraceContext {
  return {
    traceId: params.parentContext?.traceId || 'noop',
    spanId: 'noop',
    parentSpanId: params.parentContext?.spanId,
    userId: params.userId || params.parentContext?.userId || 'noop',
    startTime: new Date(),
    spanName: params.spanName,
    operationType: params.operationType,
    conversationId: params.conversationId,
    messageId: params.messageId,
  };
}

/**
 * Create a new span context. This does NOT post anything to the backend — only
 * `endTrace` emits a record (the terminal one). See the NOTE in the body for why.
 */
export async function startTrace(params: StartTraceParams): Promise<TraceContext> {
  if (!isTracingEnabled()) return createNoOpContext(params);

  const context: TraceContext = {
    traceId: params.parentContext?.traceId || generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: params.parentContext?.spanId,
    userId: params.userId || params.parentContext?.userId || 'system',
    conversationId: params.conversationId,
    messageId: params.messageId,
    previousMessageId: params.metadata?.previousMessageId as string | undefined,
    environment:
      (params.metadata?.environment as string | undefined) ||
      process.env.NODE_ENV ||
      'development',
    tags: params.metadata?.tags as string[] | undefined,
    startTime: new Date(),
    spanName: params.spanName,
    operationType: params.operationType,
  };

  // NOTE: we intentionally do NOT emit a "running" record here. GraphRAG
  // retrieval is fire-and-forget and a caller may never reach endTrace() if the
  // search throws, which would leave a permanent dangling "running" span. We
  // only emit the terminal record in endTrace(), so a failed/abandoned span
  // simply produces no row rather than a stuck one.
  return context;
}

/**
 * Create a child span for nested operations (e.g. GraphRAG retrieval under a
 * chat completion span).
 */
export async function createChildSpan(
  parent: TraceContext,
  spanName: string,
  operationType: OperationType = 'tool_call',
): Promise<TraceContext> {
  return startTrace({
    spanName,
    operationType,
    parentContext: parent,
    conversationId: parent.conversationId,
    messageId: parent.messageId,
    userId: parent.userId,
  });
}

/**
 * Close a span and emit the final record (status, duration, RAG metrics, etc.).
 */
export async function endTrace(context: TraceContext, result: TraceResult): Promise<void> {
  if (!isTracingEnabled() || context.spanId === 'noop') return;

  const durationMs = calculateDuration(context.startTime, result.endTime);
  const totalTokens =
    result.inputTokens !== undefined && result.outputTokens !== undefined
      ? result.inputTokens + result.outputTokens
      : undefined;

  // Fire-and-forget — keep retrieval latency unaffected by telemetry.
  void post({
    trace_id: context.traceId,
    span_id: context.spanId,
    span_name: context.spanName,
    parent_trace_id: context.parentSpanId || null,
    user_id: context.userId,
    conversation_id: context.conversationId || null,
    message_id: context.messageId || null,
    start_time: context.startTime.toISOString(),
    end_time: result.endTime.toISOString(),
    duration_ms: durationMs,
    operation_type: context.operationType,
    status: result.status,
    input_tokens: result.inputTokens ?? null,
    output_tokens: result.outputTokens ?? null,
    total_tokens: totalTokens ?? null,
    cost_usd: result.costUsd ?? null,
    ttft_ms: result.ttftMs ?? null,
    tokens_per_second: result.tokensPerSecond ?? null,
    // RAG retrieval metrics
    context_tokens: result.ragContext?.contextTokens ?? null,
    retrieval_latency_ms: result.ragContext?.retrievalLatencyMs ?? null,
    rag_graph_used: result.ragContext?.graphUsed ?? false,
    rag_nodes_retrieved: result.ragContext?.nodesRetrieved ?? null,
    rag_chunks_used: result.ragContext?.chunksUsed ?? null,
    rag_relevance_score: result.ragContext?.relevanceScore ?? null,
    rag_retrieval_method: result.ragContext?.retrievalMethod ?? null,
    error_message: result.errorMessage || null,
    error_type: result.errorType || null,
    input_data: result.inputData ?? null,
    output_data: result.outputData ?? null,
    reasoning: result.reasoning ?? null,
    metadata: {
      ...(result.metadata || {}),
      environment: context.environment,
      tags: context.tags,
    },
  });
}

/**
 * Convenience helper: close a span as failed with error details.
 */
export async function captureError(context: TraceContext, error: Error): Promise<void> {
  await endTrace(context, {
    endTime: new Date(),
    status: 'failed',
    errorMessage: error.message,
    errorType: error.name,
  });
}

/** POST a span payload to the trace backend. Never throws. */
async function post(payload: Record<string, unknown>): Promise<void> {
  const token = getAuthToken();
  if (!token) return;

  const url = `${getBaseUrl()}/api/analytics/traces`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        // The Fine-Tune Labs trace ingestion endpoint authenticates external
        // clients via X-API-Key (see atlas_brain/services/tracing.py, which
        // POSTs to the same /api/analytics/traces route). We also send
        // Authorization: Bearer to remain compatible with the web app's scheme.
        'X-API-Key': token,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok && traceLogsEnabled()) {
      console.error(`[Trace Service] POST ${url} failed: ${res.status}`);
    }
  } catch (err) {
    // Graceful degradation — tracing must never break the main flow. Gate the
    // log so a down/misconfigured backend can't spam production logs.
    if (traceLogsEnabled()) {
      console.error('[Trace Service] Error sending trace:', err);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether to surface trace-delivery failures. Tracing is best-effort, so we
 * stay quiet in production unless GRAPHRAG_TRACE_DEBUG is explicitly set.
 */
function traceLogsEnabled(): boolean {
  if (process.env.GRAPHRAG_TRACE_DEBUG === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

export const traceService = {
  startTrace,
  createChildSpan,
  endTrace,
  captureError,
  generateTraceId,
  generateSpanId,
  calculateDuration,
};

export default traceService;
