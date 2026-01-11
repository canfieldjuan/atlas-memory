/**
 * PDF Parser
 * Extracts text content from PDF files
 */

import pdfParse from '@/lib/vendor/pdf-parse';

export interface PDFParseResult {
  text: string;
  numPages: number;
  metadata: {
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
  };
}

export class PDFParser {
  /**
   * Parse PDF file and extract text content
   */
  async parse(buffer: Buffer): Promise<PDFParseResult> {
    try {
      const data = await pdfParse(buffer);

      return {
        text: data.text,
        numPages: data.numpages,
        metadata: {
          title: data.info?.Title,
          author: data.info?.Author,
          creator: data.info?.Creator,
          producer: data.info?.Producer,
          creationDate: data.info?.CreationDate ? new Date(data.info.CreationDate) : undefined,
        },
      };
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse PDF file from File object
   */
  async parseFromFile(file: File): Promise<PDFParseResult> {
    const buffer = Buffer.from(await file.arrayBuffer());
    return this.parse(buffer);
  }

  /**
   * Validate if buffer is a valid PDF
   */
  isValidPDF(buffer: Buffer): boolean {
    // PDF files start with %PDF-
    const pdfHeader = buffer.slice(0, 5).toString('utf-8');
    return pdfHeader === '%PDF-';
  }
}

export const pdfParser = new PDFParser();
