import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  // Components are rendered in tests with react-dom/server, which is a real render rather
  // than an assertion about source text. Next compiles JSX itself and leaves tsconfig on
  // "preserve", so vitest needs telling which runtime to use — without this the automatic
  // one is not assumed and JSX compiles to React.createElement with React out of scope.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      // 'server-only' throws when resolved outside a React Server Component build.
      // It guards bundling, not runtime behaviour, so it is a no-op under test.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
