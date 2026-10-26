import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {dirname,resolve,isAbsolute} from 'node:path'
export function npmCli(){const file=process.env.RELEASE_NPM_CLI??resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');assert(isAbsolute(file)&&existsSync(file),'Set RELEASE_NPM_CLI to an installed npm CLI');return file}
