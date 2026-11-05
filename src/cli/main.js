/**
 * CLI entry point for the daily pipeline.
 *
 *   node scripts/paper-reader.mjs [--date YYYY-MM-DD] [--dry-run] [--source arxiv]
 *
 * The command reads `$DSH_HOME/paper-reader/config.json` (defaults when it is
 * absent), runs the pipeline and prints a short summary. Exit codes:
 *
 *   0  the day digest was written (or a dry-run completed)
 *   1  the run failed and no digest was written
 *   2  invalid arguments or configuration
 *
 * `main` takes injected streams, clock and fetch so tests can drive the real
 * entry point in-process.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../config.js'
import { runDaily } from '../pipeline/run.js'
import { isDigestDate } from '../storage.js'

const USAGE = `Usage: paper-reader [options]

Fetch the day's arXiv submissions, the Hugging Face daily board (through the
configured proxy) and DeepSeek news, select the digest and write it for the
paper-reader host.

Options:
  --date YYYY-MM-DD   digest date (default: today, local time)
  --dry-run           fetch and select without writing any file
  --source ID         run only one source (available: arxiv, hf, deepseek)
  -h, --help          show this help

Data:    $DSH_HOME/paper-reader/digest/YYYY-MM-DD.json
Index:   $DSH_HOME/paper-reader/index.json
Run log: $DSH_HOME/paper-reader/runs/YYYY-MM-DD.json
Cache:   $DSH_HOME/paper-reader/cache/
Config:  $DSH_HOME/paper-reader/config.json (optional)
Model:   PAPER_READER_LLM_BASE_URL, PAPER_READER_LLM_API_KEY, PAPER_READER_LLM_MODEL
`

function usageError(message) {
  return Object.assign(new Error(message), { code: 'usage', exitCode: 2 })
}

/** Parse the command line into options; unknown flags fail loudly. */
export function parseArgs(argv = []) {
  const options = { date: null, dryRun: false, source: null, help: false }
  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw usageError(`${flag} needs a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index])
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--date') {
      options.date = readValue(index, '--date')
      index += 1
    } else if (arg.startsWith('--date=')) {
      options.date = arg.slice('--date='.length)
    } else if (arg === '--source') {
      options.source = readValue(index, '--source')
      index += 1
    } else if (arg.startsWith('--source=')) {
      options.source = arg.slice('--source='.length)
    } else {
      throw usageError(`unknown argument: ${arg}`)
    }
  }
  return options
}

/** Local calendar date, not UTC: the digest belongs to the user's day. */
export function localDate(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `$DSH_HOME/paper-reader`, the directory the host reads. */
export function dataRoot(env = process.env) {
  const home = typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim().length > 0
    ? env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'paper-reader')
}

function summaryLine(result) {
  const sources = result.sources
    .map(source => {
      if (source.status === 'ok') return `${source.id} ok (${source.candidates})`
      if (source.status === 'skipped') return `${source.id} skipped (${source.reason})`
      return `${source.id} ${source.status}`
    })
    .join(' · ')
  const head = result.dryRun ? 'dry-run' : 'run'
  return `paper-reader ${head} ${result.date}: ${result.counts.items} items`
    + ` (${result.counts.fullText} full text, ${result.counts.excerpt} excerpt) · ${sources}`
}

function writtenLines(result) {
  if (!result.written.digest) return ''
  return `\ndigest: ${result.written.digest}\nindex: ${result.written.index}\nrun: ${result.written.run}`
}

/**
 * One extra line about translation, so a skip or a spent budget is visible on
 * the terminal and not only in the run record. The key is never printed.
 */
function translationLine(result) {
  const translation = result.translation
  if (!translation) return ''
  if (translation.status === 'skipped') {
    return `\ntranslation: skipped (${translation.reason})`
  }
  const parts = [
    `translation: ${translation.status}`,
    `${translation.tokensUsed}/${translation.tokenBudget} tokens`,
  ]
  if (translation.cacheHits > 0) parts.push(`cache ${translation.cacheHits}`)
  if (translation.budgetExceeded) parts.push('daily budget reached')
  if (translation.pendingItems > 0) parts.push(`${translation.pendingItems} item(s) pending`)
  return `\n${parts.join(' · ')}`
}

/** Run the CLI and resolve the process exit code. */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env ?? process.env
  const stdout = deps.stdout ?? process.stdout
  const stderr = deps.stderr ?? process.stderr
  const now = deps.now ?? (() => new Date())
  const fetchImpl = deps.fetch ?? globalThis.fetch

  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    stderr.write(`paper-reader: ${error.message}\n`)
    return error.exitCode ?? 2
  }
  if (options.help) {
    stdout.write(USAGE)
    return 0
  }

  const root = deps.root ?? dataRoot(env)
  const date = options.date ?? localDate(now())

  try {
    if (!isDigestDate(date)) throw usageError(`--date must be a real YYYY-MM-DD date, got ${date}`)
    const { config } = await loadConfig({ root })
    const result = await runDaily({
      root,
      date,
      config,
      source: options.source,
      dryRun: options.dryRun === true,
      fetch: fetchImpl,
      env,
      now,
    })

    stdout.write(`${summaryLine(result)}${translationLine(result)}${writtenLines(result)}\n`)
    if (result.errors.length > 0) {
      for (const message of result.errors) stderr.write(`paper-reader: ${message}\n`)
    }
    return result.exitCode
  } catch (error) {
    stderr.write(`paper-reader: ${error?.message ?? error}\n`)
    return Number.isInteger(error?.exitCode) ? error.exitCode : 1
  }
}
