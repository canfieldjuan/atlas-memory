/**
 * Base AST Parser
 * Abstract base class for all language-specific AST parsers
 */

import type { CodeEntity, CodeRelation, CodeChunk } from '../../types';

export interface ASTParseResult {
  entities: CodeEntity[];
  relations: CodeRelation[];
  chunks: CodeChunk[];
  metadata: {
    language: string;
    fileType: string;
    parseTime: number;
    totalLines: number;
    totalEntities: number;
  };
}

export abstract class BaseASTParser {
  protected filePath: string;
  protected content: string;

  constructor(filePath: string, content: string) {
    this.filePath = filePath;
    this.content = content;
  }

  /**
   * Parse code into AST and extract entities
   */
  abstract parse(): Promise<ASTParseResult>;

  /**
   * Chunk code intelligently based on AST structure
   */
  abstract chunkByAST(): CodeChunk[];

  /**
   * Extract imports from the code
   */
  abstract extractImports(): string[];

  /**
   * Extract exports from the code
   */
  abstract extractExports(): string[];

  /**
   * Get line count
   */
  protected getLineCount(): number {
    return this.content.split('\n').length;
  }

  /**
   * Get code slice by line numbers
   */
  protected getCodeSlice(startLine: number, endLine: number): string {
    const lines = this.content.split('\n');
    return lines.slice(startLine - 1, endLine).join('\n');
  }
}
