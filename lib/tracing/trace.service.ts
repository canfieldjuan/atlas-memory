/**
 * Trace Service — emits GraphRAG operation spans to the Fine-Tune Labs
 * analytics backend (finetunelab.com).
 *
 * GraphRAG threads a `TraceContext` through search/retrieval. This client opens
 * a span (`startTrace` / `createChildSpan`) and closes it (`endTrace`), POSTing
 * both to `${TRACE_BASE_URL}/api/analytics/traces` in the same wire format the
 * backend ingests. It is non-blocking (fire-and-forget) and degrades
 * gracefully: any config or network error is swallowed so tracing never breaks
 * the main retrieval flow.
 *
 * Configuration (environment variables):
 *   GRAPHRAG_TRACE_URL       Base URL of the trace backend.
 *                            Default: https://finetunelab.com
 *                            (falls back to NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_APP_URL).
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
  const url =
    process.env.GRAPHRAG_TRACE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    DEFAULT_TRACE_URL;
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
 * Start a new span and emit a "running" record to the backend.
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

  // Fire-and-forget — never block the caller on telemetry.
  void post({
    trace_id: context.traceId,
    span_id: context.spanId,
    parent_trace_id: context.parentSpanId || null,
    span_name: params.spanName,
    user_id: context.userId,
    start_time: context.startTime.toISOString(),
    operation_type: params.operationType,
    model_name: params.modelName || null,
    model_provider: params.modelProvider || null,
    conversation_id: context.conversationId || null,
    message_id: context.messageId || null,
    session_tag: params.sessionTag || null,
    status: 'running',
    metadata: {
      ...(params.metadata || {}),
      environment: context.environment,
      tags: context.tags,
      previous_message_id: context.previousMessageId,
    },
  });

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
    if (!res.ok) {
      console.error(`[Trace Service] POST ${url} failed: ${res.status}`);
    }
  } catch (err) {
    // Graceful degradation — tracing must never break the main flow.
    console.error('[Trace Service] Error sending trace:', err);
  } finally {
    clearTimeout(timer);
  }
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
