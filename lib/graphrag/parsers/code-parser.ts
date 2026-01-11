/**
 * Code Parser
 * High-level code parser that dispatches to language-specific AST parsers
 */

import { TypeScriptASTParser } from './ast/typescript-ast-parser';
import { PythonASTParser } from './ast/python-ast-parser';
import type { DocumentFileType, CodeMetadata } from '../types';
import type { ASTParseResult } from './ast/base-ast-parser';

export interface CodeParseResult {
  astResult: ASTParseResult;
  rawContent: string;
  metadata: CodeMetadata;
}

export class CodeParser {
  /**
   * Parse code file using AST
   */
  async parse(buffer: Buffer, filename: string): Promise<CodeParseResult> {
    const content = buffer.toString('utf-8');
    const fileType = this.detectCodeType(filename);
    const language = this.mapFileTypeToLanguage(fileType);

    console.log(`[CodeParser] Parsing ${filename} as ${language}`);

    let astResult: ASTParseResult;

    try {
      switch (language) {
        case 'typescript':
        case 'javascript': {
          const parser = new TypeScriptASTParser(filename, content, language);
          astResult = await parser.parse();
          break;
        }

        case 'python': {
          const parser = new PythonASTParser(filename, content);
          try {
            astResult = await parser.parse();
          } catch (error) {
            // Fallback to text-based parsing for Python
            console.warn(`[CodeParser] Python AST parsing failed, using text fallback:`, error);
            astResult = await this.textBasedFallback(content, filename, 'python');
          }
          break;
        }

        default:
          throw new Error(`Unsupported language: ${language}`);
      }
    } catch (error) {
      console.error(`[CodeParser] AST parsing failed:`, error);
      // Fallback to text-based parsing
      astResult = await this.textBasedFallback(content, filename, language);
    }

    // Build metadata
    const metadata: CodeMetadata = {
      language,
      fileType,
      filePath: filename,
      lineCount: content.split('\n').length,
      functionCount: astResult.entities.filter(e => e.type === 'function').length,
      classCount: astResult.entities.filter(e => e.type === 'class').length,
      importCount: astResult.entities.filter(e => e.type === 'import').length,
      userId: '', // Will be set by caller
      filename,
      documentName: filename,
    };

    return {
      astResult,
      rawContent: content,
      metadata,
    };
  }

  /**
   * Detect code file type from extension
   */
  private detectCodeType(filename: string): 'ts' | 'tsx' | 'js' | 'jsx' | 'py' {
    const ext = filename.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'ts': return 'ts';
      case 'tsx': return 'tsx';
      case 'js': return 'js';
      case 'jsx': return 'jsx';
      case 'py': return 'py';
      default:
        throw new Error(`Unknown code file extension: ${ext}`);
    }
  }

  /**
   * Map file type to language
   */
  private mapFileTypeToLanguage(
    fileType: 'ts' | 'tsx' | 'js' | 'jsx' | 'py'
  ): 'typescript' | 'javascript' | 'python' {
    switch (fileType) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
    }
  }

  /**
   * Validate if buffer is valid code
   */
  isValidCode(buffer: Buffer, fileType: DocumentFileType): boolean {
    try {
      const content = buffer.toString('utf-8');
      // Basic validation: check if it's valid UTF-8 and has code-like content
      return content.length > 0 && !content.includes('\ufffd'); // No replacement characters
    } catch {
      return false;
    }
  }

  /**
   * Fallback to text-based parsing when AST fails
   */
  private async textBasedFallback(
    content: string,
    filename: string,
    language: string
  ): Promise<ASTParseResult> {
    console.log('[CodeParser] Using text-based fallback for', filename);

    // Simple regex-based entity extraction as fallback
    const lines = content.split('\n');
    const entities = [];

    // Extract function-like patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // TypeScript/JavaScript functions
      if (/^(export\s+)?(async\s+)?function\s+\w+/.test(line)) {
        const match = line.match(/function\s+(\w+)/);
        if (match) {
          entities.push({
            type: 'function' as const,
            name: match[1],
            startLine: i + 1,
            endLine: i + 1, // Approximate
            filePath: filename,
          });
        }
      }

      // Classes
      if (/^(export\s+)?class\s+\w+/.test(line)) {
        const match = line.match(/class\s+(\w+)/);
        if (match) {
          entities.push({
            type: 'class' as const,
            name: match[1],
            startLine: i + 1,
            endLine: i + 1,
            filePath: filename,
          });
        }
      }

      // Python functions
      if (/^def\s+\w+/.test(line.trim())) {
        const match = line.match(/def\s+(\w+)/);
        if (match) {
          entities.push({
            type: 'function' as const,
            name: match[1],
            startLine: i + 1,
            endLine: i + 1,
            filePath: filename,
          });
        }
      }
    }

    return {
      entities,
      relations: [],
      chunks: [], // Will be handled by document service
      metadata: {
        language,
        fileType: filename.split('.').pop() || '',
        parseTime: 0,
        totalLines: lines.length,
        totalEntities: entities.length,
      },
    };
  }
}

export const codeParser = new CodeParser();
