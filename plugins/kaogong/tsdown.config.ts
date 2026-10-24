import { defineConfig } from 'tsdown'
import {fileURLToPath} from 'node:url'

export default defineConfig({
  entry: { client: 'src/client.tsx' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  dts: false,
  sourcemap: false,
  clean: false,
  external: ['react', 'react/jsx-runtime'],
  alias: { 'dsh-worktable/sdk':fileURLToPath(new URL('../worktable/01_content/src/sdk.mjs',import.meta.url)), 'lucide-react': 'lucide-react/dist/esm/lucide-react.js' },
  noExternal: ['marked', 'dompurify', 'dsh-worktable/sdk'],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-tool-kaogong", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
