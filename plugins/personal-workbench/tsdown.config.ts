export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib', format: 'esm', platform: 'node', clean: false,
    external: [/^@deepseek-ai\//],
    outputOptions: { entryFileNames: 'index.js' },
  },
  {
    entry: { client: 'src/client.tsx' },
    outDir: 'lib', format: 'cjs', platform: 'browser', clean: false,
    external: ['react', 'react/jsx-runtime'],
    alias: { 'lucide-react': 'lucide-react/dist/esm/lucide-react.js' },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-personal-workbench", factory: (require) => {',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
]
