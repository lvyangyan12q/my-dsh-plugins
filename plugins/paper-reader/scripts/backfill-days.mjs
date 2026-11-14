#!/usr/bin/env node
/**
 * Backfill the newest few days (default 3), one CLI run per missing day.
 *
 * Days that already have a digest are skipped (kept as-is); today always
 * reruns so the manual button refreshes the current day. Each day runs
 * through run-daily.mjs so the DSH credential and proxy handling stay in one
 * place. A failing day is reported and the next day still runs.
 *
 *   node scripts/backfill-days.mjs            # last 3 days
 *   node scripts/backfill-days.mjs --days 7   # explicit window
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_DAYS = 3
// Today and yesterday are always re-fetched: a day can be incomplete (a source
// failed, the translation stopped early), so "it exists" does not mean "it is
// final". Older days are only fetched when they are missing entirely.
const ALWAYS_REFRESH = 2

function windowDays(argv) {
  const flag = argv.indexOf('--days')
  if (flag >= 0 && flag + 1 < argv.length) {
    const value = Number(argv[flag + 1])
    if (Number.isInteger(value) && value >= 1 && value <= 30) return value
  }
  const env = Number(process.env.PAPER_READER_BACKFILL_DAYS)
  return Number.isInteger(env) && env >= 1 && env <= 30 ? env : DEFAULT_DAYS
}

const here = dirname(fileURLToPath(import.meta.url))
const home = process.env.DSH_HOME || join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh')
const indexPath = join(home, 'paper-reader', 'index.json')

const existing = new Set()
try {
  if (existsSync(indexPath)) {
    const index = JSON.parse(readFileSync(indexPath, 'utf8'))
    for (const day of index?.days ?? []) {
      if (day?.date) existing.add(day.date)
    }
  }
} catch {
  // A broken index means "nothing is known"; every day reruns.
}

function localDate(offsetDays) {
  const date = new Date(Date.now() - offsetDays * 86_400_000)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const window = windowDays(process.argv.slice(2))
const dates = []
for (let offset = window - 1; offset >= 0; offset -= 1) {
  const date = localDate(offset)
  if (offset < ALWAYS_REFRESH || !existing.has(date)) dates.push(date)
}

if (dates.length === 0) {
  console.log(`backfill: every day of the last ${window} already exists`)
  process.exit(0)
}

const wrapper = join(here, 'run-daily.mjs')
let failures = 0
for (const date of dates) {
  console.log(`backfill: running ${date}`)
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [wrapper, '--date', date], { stdio: 'inherit' })
    child.on('error', () => resolve(1))
    child.on('exit', (exitCode) => resolve(exitCode ?? 1))
  })
  if (code !== 0) {
    failures += 1
    console.error(`backfill: ${date} failed (exit ${code})`)
  }
}
console.log(`backfill: ${dates.length} day(s), ${failures} failure(s)`)
process.exit(failures === dates.length ? 1 : 0)
