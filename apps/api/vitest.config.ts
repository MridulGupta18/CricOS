import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@cricket-os/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@cricket-os/scoring-engine': path.resolve(__dirname, '../../packages/scoring-engine/src'),
      '@cricket-os/db': path.resolve(__dirname, '../../packages/db/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Pin deterministic JWT secrets before any module loads so the dev
    // fallback (random bytes per process) doesn't change test behavior.
    setupFiles: ['./src/test-setup.ts'],
  },
});
