/**
 * Tracing Service — no-op shim for Atlas Memory.
 *
 * The full tracing/analytics backend (Supabase-backed usage metering and the
 * `/api/analytics/traces` sink) lives in the Fine-Tune Labs web app. GraphRAG
 * treats tracing as *optional* observability, so within atlas-memory we provide
 * a self-contained no-op implementation that satisfies the same interface
 * without emitting any telemetry. The span objects it returns are valid
 * `TraceContext` values, so callers that thread context through (e.g.
 * `searchService.search(..., parentContext)`) keep working unchanged.
 *
 * To enable real tracing, replace this module with an implementation that POSTs
 * spans to your telemetry backend.
 */
import type {
  TraceContext,
  TraceResult,
  StartTraceParams,
  OperationType,
} from './types';

/** Flip to true and wire up `sink()` to emit real spans. */
const TRACING_ENABLED = false;

let spanCounter = 0;

function nextId(prefix: string): string {
  spanCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${spanCounter.toString(36)}`;
}

/**
 * Begin a new (root or child) span. Returns a valid TraceContext that can be
 * passed back into `endTrace` or used as a parent for `createChildSpan`.
 */
export async function startTrace(params: StartTraceParams): Promise<TraceContext> {
  const parent = params.parentContext;

  return {
    traceId: parent?.traceId ?? nextId('trace'),
    spanId: nextId('span'),
    parentSpanId: parent?.spanId,
    userId: params.userId ?? parent?.userId ?? 'system',
    conversationId: params.conversationId ?? parent?.conversationId,
    messageId: params.messageId ?? parent?.messageId,
    startTime: new Date(),
    spanName: params.spanName,
    operationType: params.operationType,
  };
}

/**
 * Create a child span under an existing parent context.
 * Mirrors the signature of the full trace service used by GraphRAG.
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
 * Close out a span. No-op in this shim; replace `sink()` to persist spans.
 */
export async function endTrace(context: TraceContext, result: TraceResult): Promise<void> {
  if (TRACING_ENABLED) {
    await sink(context, result);
  }
}

/** Placeholder telemetry sink. Intentionally does nothing in the shim. */
async function sink(_context: TraceContext, _result: TraceResult): Promise<void> {
  // No telemetry backend configured in atlas-memory.
}

export const traceService = {
  startTrace,
  createChildSpan,
  endTrace,
};

export default traceService;
