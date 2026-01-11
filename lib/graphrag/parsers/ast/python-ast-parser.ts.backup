/**
 * Python AST Parser
 * Uses py-ast to parse Python code and extract structured entities
 */

import { parse } from 'py-ast';
import { BaseASTParser, type ASTParseResult } from './base-ast-parser';
import type { CodeEntity, CodeRelation, CodeChunk } from '../../types';

export class PythonASTParser extends BaseASTParser {
  private ast: any;

  async parse(): Promise<ASTParseResult> {
    const startTime = Date.now();

    try {
      this.ast = parse(this.content);
    } catch (error) {
      console.error('[PythonASTParser] Parse error:', error);
      throw error;
    }

    const entities: CodeEntity[] = [];
    const relations: CodeRelation[] = [];

    if (this.ast.body) {
      this.ast.body.forEach((node: any) => {
        this.extractFromNode(node, entities, relations);
      });
    }

    const chunks = this.chunkByAST();

    return {
      entities,
      relations,
      chunks,
      metadata: {
        language: 'python',
        fileType: 'py',
        parseTime: Date.now() - startTime,
        totalLines: this.getLineCount(),
        totalEntities: entities.length,
      },
    };
  }

  private extractFromNode(node: any, entities: CodeEntity[], relations: CodeRelation[]): void {
    if (!node || !node.nodeType) return;

    switch (node.nodeType) {
      case 'FunctionDef':
        this.extractFunction(node, entities);
        break;
      case 'ClassDef':
        this.extractClass(node, entities, relations);
        break;
      case 'Import':
      case 'ImportFrom':
        break;
      default:
        break;
    }
  }

  chunkByAST(): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    if (!this.ast.body) return chunks;

    this.ast.body.forEach((node: any) => {
      if (node.nodeType === 'FunctionDef') {
        chunks.push(this.createFunctionChunk(node));
      } else if (node.nodeType === 'ClassDef') {
        chunks.push(this.createClassChunk(node));
      }
    });

    return chunks;
  }

  private extractFunction(node: any, entities: CodeEntity[]): void {
    const lineno = node.lineno || 0;
    const endLineno = this.findNodeEndLine(node);

    entities.push({
      type: 'function',
      name: node.name || 'anonymous',
      startLine: lineno,
      endLine: endLineno,
      filePath: this.filePath,
      signature: this.generateFunctionSignature(node),
    });
  }

  private extractClass(node: any, entities: CodeEntity[], relations: CodeRelation[]): void {
    const lineno = node.lineno || 0;
    const endLineno = this.findNodeEndLine(node);

    const classEntity: CodeEntity = {
      type: 'class',
      name: node.name || 'anonymous',
      startLine: lineno,
      endLine: endLineno,
      filePath: this.filePath,
      properties: this.extractClassMembers(node),
    };

    entities.push(classEntity);

    if (node.bases && node.bases.length > 0) {
      node.bases.forEach((base: any) => {
        const baseName = this.getBaseName(base);
        if (baseName) {
          relations.push({
            type: 'EXTENDS',
            source: classEntity,
            target: {
              type: 'class',
              name: baseName,
              startLine: 0,
              endLine: 0,
              filePath: this.filePath,
            },
          });
        }
      });
    }
  }

  extractImports(): string[] {
    const imports: string[] = [];
    if (!this.ast.body) return imports;

    this.ast.body.forEach((node: any) => {
      if (node.nodeType === 'Import' || node.nodeType === 'ImportFrom') {
        const lineno = node.lineno || 0;
        const importLine = this.content.split('\n')[lineno - 1];
        if (importLine) {
          imports.push(importLine.trim());
        }
      }
    });

    return imports;
  }

  extractExports(): string[] {
    const allMatch = this.content.match(/__all__\s*=\s*\[(.*?)\]/);
    if (allMatch) {
      return allMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
    }
    return [];
  }

  private findNodeEndLine(node: any): number {
    if (node.end_lineno) {
      return node.end_lineno;
    }

    if (node.body && Array.isArray(node.body) && node.body.length > 0) {
      const lastChild = node.body[node.body.length - 1];
      return this.findNodeEndLine(lastChild);
    }

    return node.lineno || 0;
  }

  private generateFunctionSignature(node: any): string {
    const params = node.args?.args || [];
    const paramNames = params.map((arg: any) => arg.arg || 'param').join(', ');
    return `${node.name || 'anonymous'}(${paramNames})`;
  }

  private extractClassMembers(node: any): string[] {
    if (!node.body || !Array.isArray(node.body)) {
      return [];
    }

    return node.body
      .filter((member: any) => member.nodeType === 'FunctionDef')
      .map((member: any) => member.name || 'unknown')
      .filter((name: string) => name !== 'unknown');
  }

  private getBaseName(base: any): string | null {
    if (base.nodeType === 'Name' && base.id) {
      return base.id;
    }
    return null;
  }

  private createFunctionChunk(node: any): CodeChunk {
    const lineno = node.lineno || 0;
    const endLineno = this.findNodeEndLine(node);

    return {
      content: this.getCodeSlice(lineno, endLineno),
      entities: [],
      imports: this.extractImports(),
      exports: [],
      filePath: this.filePath,
      startLine: lineno,
      endLine: endLineno,
      chunkType: 'function',
      dependencies: this.extractDependencies(node),
    };
  }

  private createClassChunk(node: any): CodeChunk {
    const lineno = node.lineno || 0;
    const endLineno = this.findNodeEndLine(node);

    return {
      content: this.getCodeSlice(lineno, endLineno),
      entities: [],
      imports: this.extractImports(),
      exports: [],
      filePath: this.filePath,
      startLine: lineno,
      endLine: endLineno,
      chunkType: 'class',
      dependencies: [],
    };
  }

  private extractDependencies(node: any): string[] {
    const deps: string[] = [];

    const traverse = (n: any) => {
      if (!n) return;

      if (n.nodeType === 'Call' && n.func) {
        if (n.func.nodeType === 'Name' && n.func.id) {
          deps.push(n.func.id);
        } else if (n.func.nodeType === 'Attribute' && n.func.attr) {
          deps.push(n.func.attr);
        }
      }

      if (Array.isArray(n.body)) {
        n.body.forEach((child: any) => traverse(child));
      }
    };

    traverse(node);
    return Array.from(new Set(deps));
  }
}
