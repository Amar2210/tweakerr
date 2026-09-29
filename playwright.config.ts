import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Machines without sudo can unpack Chromium's missing system libraries
// (libnss3, libnspr4, libasound2) into ~/.local/pw-libs — see CONTRIBUTING.md.
const localLibs = join(homedir(), '.local/pw-libs/root/usr/lib/x86_64-linux-gnu');
if (existsSync(localLibs)) {
  process.env.LD_LIBRARY_PATH = [localLibs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
});
