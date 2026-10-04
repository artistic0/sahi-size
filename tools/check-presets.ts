// npm run presets:check: fails on broken preset data or page text that disagrees with it, and
// lists rules that need (re-)checking against the official notice.
import { validatePresets } from '../src/data/validate.ts'

const { errors, warnings } = validatePresets()
for (const w of warnings) console.warn(`warning: ${w}`)
for (const e of errors) console.error(`error: ${e}`)
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`)
process.exit(errors.length ? 1 : 0)
