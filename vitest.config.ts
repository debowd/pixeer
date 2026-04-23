import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/index.ts',
        'src/types.ts',
        'src/screen-capture.ts',
        'src/telemetry.ts',
        'src/transports/**',
      ],
      thresholds: {
        lines: 80,
        functions: 85,
        branches: 72,
        statements: 80,
      },
    },
  },
});
