import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['./src/index.ts', './src/vite-plugin.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: false,
    clean: true,
    minify: false,
    platform: 'node',
    outDir: 'dist',
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.mjs' };
    },
  },
  {
    entry: ['./src/cli.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: false,
    clean: false,
    minify: false,
    platform: 'node',
    outDir: 'dist',
    banner: { js: '#!/usr/bin/env node' },
    outExtension() {
      return { js: '.mjs' };
    },
  },
]);
