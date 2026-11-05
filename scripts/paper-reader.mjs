#!/usr/bin/env node
/**
 * Thin executable wrapper around `src/cli/main.js`.
 *
 * `node scripts/paper-reader.mjs --date 2026-11-05` is the manual entry point;
 * the DSH Schedule ticket reuses the same command.
 */
import { main } from '../src/cli/main.js'

process.exitCode = await main(process.argv.slice(2))
