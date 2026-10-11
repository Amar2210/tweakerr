import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The whole editor is built into one self-contained dist/tweakerr.html
// that works when opened straight from disk (file://).
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: {
    open: '/tweakerr.html',
    // Windows edits on /mnt/c do not reliably emit file events inside WSL.
    // Poll there so the local preview cannot keep serving old source modules.
    watch: process.env.WSL_DISTRO_NAME ? { usePolling: true, interval: 300 } : undefined,
  },
  build: {
    rollupOptions: { input: 'tweakerr.html' },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
