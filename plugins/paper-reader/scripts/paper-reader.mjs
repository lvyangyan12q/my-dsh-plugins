#!/usr/bin/env node
/**
 * Thin executable wrapper around `src/cli/main.js`.
 *
 * `node scripts/paper-reader.mjs --date 2026-11-05` is the manual entry point;
 * the DSH Schedule ticket reuses the same command.
 */
import { mainWithProxyBootstrap } from '../src/cli/main.js'

process.exitCode = await mainWithProxyBootstrap(process.argv.slice(2))
