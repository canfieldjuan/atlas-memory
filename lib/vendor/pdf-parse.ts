/**
 * Thin wrapper around pdf-parse that bypasses the package's debug
 * entrypoint, which attempts to read sample PDFs whenever it is
 * imported without a parent module (e.g., during Next.js builds).
 */
import type pdfParse from 'pdf-parse';
import type { Result as PdfParseResult, Options as PdfParseOptions } from 'pdf-parse';
import pdfParseImpl from 'pdf-parse/lib/pdf-parse.js';

export type { PdfParseResult as PdfParseResult, PdfParseOptions as PdfParseOptions };
export default pdfParseImpl as typeof pdfParse;
