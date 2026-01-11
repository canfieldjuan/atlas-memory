/**
 * Text Parser
 * Extracts text content from plain text files (TXT, MD, etc.)
 */

export interface TextParseResult {
  text: string;
  encoding: string;
  lineCount: number;
}

export class TextParser {
  /**
   * Parse plain text file
   */
  async parse(buffer: Buffer, encoding: BufferEncoding = 'utf-8'): Promise<TextParseResult> {
    try {
      const text = buffer.toString(encoding);
      const lineCount = text.split('\n').length;

      return {
        text,
        encoding,
        lineCount,
      };
    } catch (error) {
      throw new Error(`Text parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse text file from File object
   */
  async parseFromFile(file: File, encoding: BufferEncoding = 'utf-8'): Promise<TextParseResult> {
    const buffer = Buffer.from(await file.arrayBuffer());
    return this.parse(buffer, encoding);
  }

  /**
   * Auto-detect encoding (basic implementation)
   */
  detectEncoding(buffer: Buffer): BufferEncoding {
    // Check for UTF-8 BOM
    if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return 'utf-8';
    }

    // Check for UTF-16 LE BOM
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return 'utf16le';
    }

    // Check for UTF-16 BE BOM
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      // Note: Node.js doesn't have utf16be, but we can use ucs2
      return 'utf16le';
    }

    // Default to UTF-8
    return 'utf-8';
  }

  /**
   * Parse with auto-detected encoding
   */
  async parseWithAutoEncoding(buffer: Buffer): Promise<TextParseResult> {
    const encoding = this.detectEncoding(buffer);
    return this.parse(buffer, encoding);
  }

  /**
   * Clean text (remove excessive whitespace, normalize line endings)
   */
  cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')   // Handle old Mac line endings
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .trim();
  }
}

export const textParser = new TextParser();
