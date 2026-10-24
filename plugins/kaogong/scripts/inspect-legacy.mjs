import { writeLegacyInspection } from '../src/legacy-inspection.mjs'

// No implicit DSH_HOME, startup, environment config or credential discovery.
try {
  const args = process.argv.slice(2)
  const options = { materialRoots: [] }
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]
    const value = args[i + 1]
    if (!value || value.startsWith('--') || !['--home', '--output', '--material-root'].includes(key)) throw Error('INVALID_ARGUMENTS')
    if (key === '--material-root') options.materialRoots.push(value)
    else {
      const name = key.slice(2)
      if (options[name]) throw Error('INVALID_ARGUMENTS')
      options[name] = value
    }
  }
  if (!options.home || !options.output) throw Error('EXPLICIT_HOME_AND_OUTPUT_REQUIRED')
  console.log(JSON.stringify(await writeLegacyInspection(options)))
} catch (error) {
  const allowed = /^(EXPLICIT_[A-Z_]+|INVALID_ARGUMENTS|UNSUPPORTED_[A-Z_]+|SOURCE_[A-Z_]+|MALFORMED_SOURCE|OUTPUT_[A-Z_]+|MATERIAL_ROOT_UNAVAILABLE)$/
  const code = error.code ?? error.message
  console.error('INSPECTION_BLOCKED: ' + (allowed.test(code) ? code : 'INSPECTION_FAILED'))
  process.exitCode = 1
}
