/**
 * DOCX Parser
 * Extracts text content from DOCX files
 */

import mammoth from 'mammoth';

export interface DOCXParseResult {
  text: string;
  messages: string[];
}

export class DOCXParser {
  /**
   * Parse DOCX file and extract text content
   */
  async parse(buffer: Buffer): Promise<DOCXParseResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });

      return {
        text: result.value,
        messages: result.messages.map(m => m.message),
      };
    } catch (error) {
      throw new Error(`DOCX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse DOCX file from File object
   */
  async parseFromFile(file: File): Promise<DOCXParseResult> {
    const buffer = Buffer.from(await file.arrayBuffer());
    return this.parse(buffer);
  }

  /**
   * Parse DOCX with HTML conversion (preserves more structure)
   */
  async parseToHTML(buffer: Buffer): Promise<{ html: string; messages: string[] }> {
    try {
      const result = await mammoth.convertToHtml({ buffer });

      return {
        html: result.value,
        messages: result.messages.map(m => m.message),
      };
    } catch (error) {
      throw new Error(`DOCX to HTML conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate if buffer is a valid DOCX file
   */
  isValidDOCX(buffer: Buffer): boolean {
    // DOCX files are ZIP archives starting with PK
    const zipHeader = buffer.slice(0, 2).toString('utf-8');
    return zipHeader === 'PK';
  }
}

export const docxParser = new DOCXParser();
