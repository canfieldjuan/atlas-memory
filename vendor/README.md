# Vendored packages

## py-ast-1.9.0.tgz

`py-ast` (the Python-source AST parser used by the GraphRAG code parser at
`lib/graphrag/parsers/ast/python-ast-parser.ts`) is vendored here as a local
npm tarball and referenced from `package.json` as:

```json
"optionalDependencies": {
  "py-ast": "file:vendor/py-ast-1.9.0.tgz"
}
```

### Why
Some CI/registry environments return `E403` for `py-ast` from the public npm
registry. Installing from this in-repo tarball makes `npm ci` / `npm install`
fully registry-independent and reproducible, so Python-document AST parsing is
reliably available in CI rather than silently degrading to the regex fallback.

It is a pure-JS package with **no runtime dependencies**, so the tarball is
self-contained (~118 KB). It remains in `optionalDependencies` and is still
loaded via a lazy dynamic import, so a missing package never breaks the build —
the parser falls back to regex-based extraction.

### Updating
```bash
npm pack py-ast@<version> --pack-destination vendor/
# update the file: path in package.json, then:
npm install
```
