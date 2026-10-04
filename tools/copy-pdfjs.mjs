// Copies pdf.js's own decoder files (wasm, cmaps, standard fonts, ICC profiles) into public/pdfjs/,
// so they are served from our origin. The pdf.js worker may fetch them (and nothing else); see
// src/worker/lockdownPdf.ts. The JavaScript-sandbox files (quickjs) are left out: we never run PDF scripts.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const src = join(process.cwd(), 'node_modules', 'pdfjs-dist')
const dest = join(process.cwd(), 'public', 'pdfjs')
const version = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).version
const stamp = join(dest, 'VERSION')

if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === version) process.exit(0)

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  if (!existsSync(join(src, dir))) continue
  cpSync(join(src, dir), join(dest, dir), { recursive: true, filter: (p) => !/quickjs/i.test(p) })
}
cpSync(join(src, 'LICENSE'), join(dest, 'LICENSE'))
writeFileSync(stamp, `${version}\n`)
console.log(`pdf.js ${version} decoder files copied to public/pdfjs/`)
