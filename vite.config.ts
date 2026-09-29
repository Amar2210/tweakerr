import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The whole editor is built into one self-contained dist/tweakerr.html
// that works when opened straight from disk (file://).
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: { open: '/tweakerr.html' },
  build: {
    rollupOptions: { input: 'tweakerr.html' },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
