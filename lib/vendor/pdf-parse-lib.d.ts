// Type declaration for the pdf-parse internal entrypoint used by
// lib/vendor/pdf-parse.ts. @types/pdf-parse only declares the package root,
// not the `/lib/pdf-parse.js` subpath we import to bypass its debug shim.
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdfParse from 'pdf-parse';
  export * from 'pdf-parse';
  export default pdfParse;
}
