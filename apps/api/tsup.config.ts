import { defineConfig } from 'tsup';

// Bundle the API into a single CommonJS file. We inline the local workspace
// packages (@cricket-os/shared, @cricket-os/scoring-engine, @cricket-os/db)
// so the build artifact is self-contained; everything else is left external
// and resolved from node_modules at runtime.
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs'],
  target: 'node20',
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: false,
  minify: false,
  // Don't externalize the @cricket-os workspace packages — they're TypeScript
  // sources without a compiled artifact, so we need to bundle them.
  noExternal: [/^@cricket-os\//],
});
