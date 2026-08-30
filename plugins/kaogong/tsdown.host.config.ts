import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [/^@deepseek-ai\//, 'zod', 'node:crypto', 'node:http'],
  outputOptions: {
    entryFileNames: 'index.js',
  },
})
