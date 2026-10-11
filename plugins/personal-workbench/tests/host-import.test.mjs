import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'

test('the real Host artifact imports with its installed dependencies', () => {
  // Import only: no Host boot, authentication, network, config or provider calls.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    try {
      const plugin = await import(process.argv[1]);
      if (plugin.name !== 'personal-workbench' || typeof plugin.apply !== 'function'
        || !plugin.Config || !plugin.inject.includes('webServer')) throw new Error('Invalid Host exports');
    } catch (error) {
      console.error(JSON.stringify({ code: error.code ?? error.name,
        message: String(error.message).replace(/https?:\\/\\/\\S+/g, '<URL omitted>') }));
      process.exitCode = 1;
    }
  `, process.env.HOST_ARTIFACT_URL ?? new URL('../lib/index.js', import.meta.url).href], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    encoding: 'utf8', timeout: 5000,
  })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
})
