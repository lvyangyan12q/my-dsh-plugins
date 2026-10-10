export default [
  { entry: { index: 'src/index.ts' }, dts: false, outDir: 'lib', format: 'esm', platform: 'node', clean: true, external: [/^@deepseek-ai\//], outputOptions: { entryFileNames: 'index.js' } },
  { entry: { client: 'src/client.tsx' }, dts: false, outDir: 'lib', format: 'cjs', platform: 'browser', clean: false, external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-personal-workbench/client'], outputOptions: { entryFileNames: 'client.js', banner: 'window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-reading-statistics", factory: (require) => {', intro: 'var module = { exports: {} }; var exports = module.exports;', footer: 'return module.exports; } });' } },
]
