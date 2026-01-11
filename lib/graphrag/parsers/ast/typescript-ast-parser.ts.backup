/**
 * TypeScript/JavaScript AST Parser
 * Uses Babel to parse TS/JS code and extract structured entities
 */

import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { CodeEntity, CodeRelation, CodeChunk } from '../../types';
import { BaseASTParser, type ASTParseResult } from './base-ast-parser';

export class TypeScriptASTParser extends BaseASTParser {
  private ast: any;
  private language: 'typescript' | 'javascript';

  constructor(filePath: string, content: string, language: 'typescript' | 'javascript') {
    super(filePath, content);
    this.language = language;
  }

  async parse(): Promise<ASTParseResult> {
    const startTime = Date.now();

    try {
      // Parse with Babel - supports TS, TSX, JS, JSX
      this.ast = babelParse(this.content, {
        sourceType: 'module',
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'optionalChaining',
          'nullishCoalescingOperator',
        ],
      });
    } catch (error) {
      console.error('[TypeScriptASTParser] Parse error:', error);
      throw error;
    }

    const entities: CodeEntity[] = [];
    const relations: CodeRelation[] = [];

    // Traverse AST and extract entities
    traverse(this.ast, {
      // Extract functions
      FunctionDeclaration: (path) => {
        const entity = this.extractFunction(path);
        if (entity) entities.push(entity);
      },

      // Extract arrow functions assigned to exports
      VariableDeclaration: (path) => {
        path.node.declarations.forEach((decl) => {
          if (t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init)) {
            const entity = this.extractFunctionFromVariable(path, decl);
            if (entity) entities.push(entity);
          }
        });
      },

      // Extract classes
      ClassDeclaration: (path) => {
        const classEntity = this.extractClass(path);
        if (classEntity) {
          entities.push(classEntity);

          // Extract extends/implements relationships
          if (path.node.superClass && t.isIdentifier(path.node.superClass)) {
            relations.push(this.createRelation('EXTENDS', classEntity, path.node.superClass.name));
          }
          if (path.node.implements) {
            path.node.implements.forEach((impl) => {
              if (t.isTSExpressionWithTypeArguments(impl) && t.isIdentifier(impl.expression)) {
                relations.push(this.createRelation('IMPLEMENTS', classEntity, impl.expression.name));
              }
            });
          }
        }
      },

      // Extract interfaces (TypeScript)
      TSInterfaceDeclaration: (path) => {
        const entity = this.extractInterface(path);
        if (entity) entities.push(entity);
      },

      // Extract type aliases (TypeScript)
      TSTypeAliasDeclaration: (path) => {
        const entity = this.extractTypeAlias(path);
        if (entity) entities.push(entity);
      },
    });

    // Generate intelligent chunks
    const chunks = this.chunkByAST();

    return {
      entities,
      relations,
      chunks,
      metadata: {
        language: this.language,
        fileType: this.filePath.split('.').pop() || 'ts',
        parseTime: Date.now() - startTime,
        totalLines: this.getLineCount(),
        totalEntities: entities.length,
      },
    };
  }

  chunkByAST(): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    // Strategy: Create chunks for top-level declarations
    traverse(this.ast, {
      // Each function becomes a chunk
      FunctionDeclaration: (path) => {
        if (path.getFunctionParent() === null) {
          // Top-level function
          chunks.push(this.createFunctionChunk(path));
        }
      },

      // Each class becomes a chunk
      ClassDeclaration: (path) => {
        chunks.push(this.createClassChunk(path));
      },

      // Interfaces and types - create individual chunks
      TSInterfaceDeclaration: (path) => {
        chunks.push(this.createInterfaceChunk(path));
      },

      TSTypeAliasDeclaration: (path) => {
        chunks.push(this.createTypeChunk(path));
      },
    });

    return chunks;
  }

  extractImports(): string[] {
    const imports: string[] = [];

    traverse(this.ast, {
      ImportDeclaration: (path) => {
        if (path.node.start !== null && path.node.end !== null) {
          imports.push(this.content.slice(path.node.start, path.node.end));
        }
      },
    });

    return imports;
  }

  extractExports(): string[] {
    const exports: string[] = [];

    traverse(this.ast, {
      ExportNamedDeclaration: (path) => {
        if (path.node.start !== null && path.node.end !== null) {
          exports.push(this.content.slice(path.node.start, path.node.end));
        }
      },
      ExportDefaultDeclaration: (path) => {
        if (path.node.start !== null && path.node.end !== null) {
          exports.push(this.content.slice(path.node.start, path.node.end));
        }
      },
    });

    return exports;
  }

  // Helper methods
  private extractFunction(path: any): CodeEntity | null {
    const node = path.node;
    const loc = node.loc;

    if (!loc || !node.id) return null;

    return {
      type: 'function',
      name: node.id.name || 'anonymous',
      startLine: loc.start.line,
      endLine: loc.end.line,
      filePath: this.filePath,
      signature: this.generateFunctionSignature(node),
    };
  }

  private extractFunctionFromVariable(path: any, decl: any): CodeEntity | null {
    const loc = path.node.loc;
    if (!loc || !t.isIdentifier(decl.id)) return null;

    return {
      type: 'function',
      name: decl.id.name,
      startLine: loc.start.line,
      endLine: loc.end.line,
      filePath: this.filePath,
      signature: `${decl.id.name}()`,
    };
  }

  private extractClass(path: any): CodeEntity | null {
    const node = path.node;
    const loc = node.loc;

    if (!loc || !node.id) return null;

    return {
      type: 'class',
      name: node.id.name || 'anonymous',
      startLine: loc.start.line,
      endLine: loc.end.line,
      filePath: this.filePath,
      properties: this.extractClassMembers(node),
    };
  }

  private extractInterface(path: any): CodeEntity | null {
    const node = path.node;
    const loc = node.loc;

    if (!loc || !node.id) return null;

    return {
      type: 'interface',
      name: node.id.name || 'anonymous',
      startLine: loc.start.line,
      endLine: loc.end.line,
      filePath: this.filePath,
      properties: this.extractInterfaceProperties(node),
    };
  }

  private extractTypeAlias(path: any): CodeEntity | null {
    const node = path.node;
    const loc = node.loc;

    if (!loc || !node.id) return null;

    return {
      type: 'type',
      name: node.id.name || 'anonymous',
      startLine: loc.start.line,
      endLine: loc.end.line,
      filePath: this.filePath,
    };
  }

  private createFunctionChunk(path: any): CodeChunk {
    const node = path.node;
    const loc = node.loc;

    return {
      content: this.getCodeSlice(loc.start.line, loc.end.line),
      entities: [this.extractFunction(path)!].filter(Boolean),
      imports: this.extractImports(),
      exports: [],
      filePath: this.filePath,
      startLine: loc.start.line,
      endLine: loc.end.line,
      chunkType: 'function',
      dependencies: this.extractDependencies(path),
    };
  }

  private createClassChunk(path: any): CodeChunk {
    const node = path.node;
    const loc = node.loc;

    return {
      content: this.getCodeSlice(loc.start.line, loc.end.line),
      entities: [this.extractClass(path)!].filter(Boolean),
      imports: this.extractImports(),
      exports: [],
      filePath: this.filePath,
      startLine: loc.start.line,
      endLine: loc.end.line,
      chunkType: 'class',
      dependencies: this.extractDependencies(path),
    };
  }

  private createInterfaceChunk(path: any): CodeChunk {
    const node = path.node;
    const loc = node.loc;

    return {
      content: this.getCodeSlice(loc.start.line, loc.end.line),
      entities: [this.extractInterface(path)!].filter(Boolean),
      imports: [],
      exports: [],
      filePath: this.filePath,
      startLine: loc.start.line,
      endLine: loc.end.line,
      chunkType: 'interface',
      dependencies: [],
    };
  }

  private createTypeChunk(path: any): CodeChunk {
    const node = path.node;
    const loc = node.loc;

    return {
      content: this.getCodeSlice(loc.start.line, loc.end.line),
      entities: [this.extractTypeAlias(path)!].filter(Boolean),
      imports: [],
      exports: [],
      filePath: this.filePath,
      startLine: loc.start.line,
      endLine: loc.end.line,
      chunkType: 'type',
      dependencies: [],
    };
  }

  private generateFunctionSignature(node: any): string {
    const params = node.params.map((p: any) => {
      if (t.isIdentifier(p)) {
        return p.name;
      } else if (t.isObjectPattern(p)) {
        return '{ ... }';
      } else if (t.isArrayPattern(p)) {
        return '[ ... ]';
      }
      return 'param';
    }).join(', ');

    return `${node.id?.name || 'anonymous'}(${params})`;
  }

  private extractClassMembers(node: any): string[] {
    return node.body.body.map((member: any) => {
      if ((t.isClassMethod(member) || t.isClassProperty(member)) && t.isIdentifier(member.key)) {
        return member.key.name;
      }
      return 'unknown';
    }).filter((name: string) => name !== 'unknown');
  }

  private extractInterfaceProperties(node: any): string[] {
    if (!node.body || !node.body.body) return [];

    return node.body.body.map((prop: any) => {
      if (prop.key && t.isIdentifier(prop.key)) {
        return prop.key.name;
      }
      return 'unknown';
    }).filter((name: string) => name !== 'unknown');
  }

  private extractDependencies(path: any): string[] {
    const deps: string[] = [];

    // Traverse the node to find function calls
    path.traverse({
      CallExpression: (callPath: any) => {
        if (t.isIdentifier(callPath.node.callee)) {
          deps.push(callPath.node.callee.name);
        } else if (t.isMemberExpression(callPath.node.callee) && t.isIdentifier(callPath.node.callee.property)) {
          deps.push(callPath.node.callee.property.name);
        }
      },
    });

    return Array.from(new Set(deps));
  }

  private createRelation(type: 'EXTENDS' | 'IMPLEMENTS', source: CodeEntity, targetName: string): CodeRelation {
    return {
      type,
      source,
      target: {
        type: 'class',
        name: targetName,
        startLine: 0,
        endLine: 0,
        filePath: this.filePath,
      },
    };
  }
}
