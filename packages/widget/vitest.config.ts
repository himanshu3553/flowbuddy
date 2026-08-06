import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Root paths match NOTHING by design (route-pattern.ts), so the tests need a real route.
    environmentOptions: { jsdom: { url: 'http://app.test/projects' } },
    setupFiles: ['./src/test-setup.ts'],
  },
});
