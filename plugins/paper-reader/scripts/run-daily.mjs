#!/usr/bin/env node
/**
 * Daily entry point that reuses DSH's local model credential.
 *
 * The translation service intentionally reads `PAPER_READER_LLM_*`, never the
 * DSH credential store. This wrapper is the explicit opt-in: it resolves one
 * named reference from `$DSH_HOME/.credentials.yaml` into the process
 * environment, then starts the normal CLI. It never prints the secret and does
 * not persist it.
 *
 *   node scripts/run-daily.mjs --date 2026-11-05
 *
 * Overrides:
 *   PAPER_READER_DSH_CREDENTIAL_REF  credential reference (default ZAI_CODING_CN_API_KEY)
 *   PAPER_READER_LLM_BASE_URL        required unless config sets translation.baseUrl
 *   PAPER_READER_LLM_MODEL           required unless config sets translation.model
 *   HTTP_PROXY / HTTPS_PROXY         explicit proxy; NODE_USE_ENV_PROXY is set when present
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const home = process.env.DSH_HOME || join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh')
const credentialsPath = join(home, '.credentials.yaml')
const configPath = join(home, 'paper-reader', 'config.json')

/** Read the `refs` map (reference name -> value) without exposing values. */
function readRefs(path) {
  if (!existsSync(path)) return {}
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  const start = lines.findIndex(line => /^refs:\s*$/.test(line))
  if (start < 0) return {}
  const refs = {}
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!/^\s+\S/.test(line)) break
    const match = /^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line)
    if (match) refs[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return refs
}

const env = { ...process.env }

if (!env.PAPER_READER_LLM_API_KEY) {
  const ref = env.PAPER_READER_DSH_CREDENTIAL_REF || 'ZAI_CODING_CN_API_KEY'
  const refs = readRefs(credentialsPath)
  if (refs[ref]) {
    env.PAPER_READER_LLM_API_KEY = refs[ref]
    env.PAPER_READER_LLM_BASE_URL ||= 'https://open.bigmodel.cn/api/paas/v4'
    env.PAPER_READER_LLM_MODEL ||= 'glm-4-flash'
  } else {
    process.stderr.write(`paper-reader: credential reference ${ref} was not found in ${credentialsPath}\n`)
  }
}

// A configured proxy applies to this child only; never hardcode the address.
try {
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    const proxy = config?.proxy?.url
    if (typeof proxy === 'string' && proxy.trim()) {
      env.HTTP_PROXY ||= proxy
      env.HTTPS_PROXY ||= proxy
      env.NODE_USE_ENV_PROXY ||= '1'
    }
  }
} catch {
  // The CLI validates the config; a malformed file is reported there.
}

const child = spawn(process.execPath, [join(here, 'paper-reader.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
})
child.on('error', (error) => {
  process.stderr.write(`paper-reader: failed to start the CLI: ${error.message}\n`)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
