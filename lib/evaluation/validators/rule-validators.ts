/**
 * Rule validator types.
 *
 * The full rule-validator implementation (citation checks, etc.) is part of the
 * separate evaluation subsystem in the Fine-Tune Labs app and is coupled to
 * Supabase. The GraphRAG sync layer only consumes the `ValidatorResult` shape
 * to record validation events against the knowledge graph, so this module
 * provides that type contract in a self-contained form. Drop in the full
 * implementation here to wire real rule validation.
 */

/** JSON-serializable value (mirrors the app's shared JsonValue type). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ValidatorResult {
  passed: boolean;
  score?: number;
  message?: string;
  evidence?: JsonValue;
}
