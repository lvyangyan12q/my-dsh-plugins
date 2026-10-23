import {build} from 'tsdown'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const config=fileURLToPath(new URL('./tsdown.config.ts',import.meta.url))
await build({config,cwd:dirname(config)})
