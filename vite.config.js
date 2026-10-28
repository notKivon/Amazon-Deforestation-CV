import { defineConfig } from 'vite';

// Import *.geojson as raw text, matching wrangler.jsonc's `Text` rule, so the browser,
// the Worker, and tests all load the Amazon outline the same way.
const geojsonText = {
  name: 'geojson-text',
  transform(code, id) {
    if (id.endsWith('.geojson')) return { code: `export default ${JSON.stringify(code)};`, map: null };
  },
};

export default defineConfig({
  plugins: [geojsonText],
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    // Node by default; DOM tests opt in with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 20_000,
  },
});
