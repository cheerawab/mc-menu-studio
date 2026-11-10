import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // the demo-page tests render every template (up to 4x) and take seconds; 5 s timed out on a busy machine
    testTimeout: 60_000,
  },
});
