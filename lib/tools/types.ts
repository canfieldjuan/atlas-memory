// Tool System - Core Type Definitions
// Phase 1.1: Shared interfaces for modular tool system
// Date: October 10, 2025

/**
 * Parameter definition for a tool
 */
export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
  required?: boolean;
}

/**
 * Tool configuration interface
 * Each tool can define its own config structure
 */
export interface ToolConfig {
  enabled: boolean;
  [key: string]: unknown;
}

/**
 * Complete tool definition
 * Each modular tool must implement this interface
 */
export interface ToolDefinition {
  name: string;
  description: string;
  version: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };
  config: ToolConfig;
  execute: (params: Record<string, unknown>, conversationId?: string, userId?: string, supabaseClient?: unknown, traceContext?: unknown) => Promise<unknown>;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTimeMs?: number;
}

/**
 * Tool parameter validation result
 */
export interface ToolParameterValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Tool validator interface
 * Validates tool parameters before execution
 */
export interface ToolValidator {
  /**
   * Validate parameters against tool definition
   * @param params - Parameters to validate
   * @param toolDef - Tool definition to validate against
   * @returns Validation result with errors if any
   */
  validateParameters(
    params: Record<string, unknown>,
    toolDef: ToolDefinition
  ): ToolParameterValidationResult;
}

/**
 * Tool metadata from database
 */
export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
  parameters: unknown;
  isEnabled: boolean;
  isBuiltin: boolean;
  createdAt?: string;
  updatedAt?: string;
}
