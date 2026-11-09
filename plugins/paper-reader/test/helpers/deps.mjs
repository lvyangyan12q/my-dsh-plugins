/**
 * Test dependency resolver.
 *
 * The plugin is developed inside a DSH checkout where react, react-dom,
 * react-test-renderer and jsdom are installed outside this package. Point
 * PAPER_READER_TEST_DEPS at a directory with those packages (for example the
 * worktable package root) and import this module from tests.
 */
import { createRequire } from 'node:module'

const root = process.env.PAPER_READER_TEST_DEPS
if (!root) {
  throw new Error('Set PAPER_READER_TEST_DEPS to a package directory that has react, react-dom, react-test-renderer and jsdom')
}

export const requireTestDeps = createRequire(`${root.replace(/[\\/]+$/, '')}/package.json`)
