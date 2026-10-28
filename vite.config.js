import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    // Node by default; DOM tests opt in with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
