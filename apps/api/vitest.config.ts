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
  },
});
