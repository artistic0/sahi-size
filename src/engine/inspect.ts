import type { Preset } from '../data/types'
import { fitsAccept, pxOf } from './dims'
import { readJpeg, type JpegInfo } from './jpeg'
import { formatKb, formatRule, judgeKb, type KbVerdict } from './kb'
import { readPng, type PngInfo } from './png'
import { EXTENSIONS, extensionOf, KIND_LABEL, sniff, type FileKind } from './sniff'

/**
 * The checker: what a portal will think of a file, rule by rule. Runs on files people bring and on
 * every file we make (the result card shows the same checks). Checks carry codes and numbers only;
 * the words live in src/i18n/en.ts.
 */
export type CheckStatus = 'pass' | 'warn' | 'fail'
export type CheckId = 'format' | 'size' | 'dims' | 'dpi' | 'color' | 'progressive' | 'orientation' | 'filename' | 'encrypted'

export interface Check {
  id: CheckId
  status: CheckStatus
  params: Record<string, string | number>
}

export interface FileFacts {
  name: string
  bytes: number
  kind: FileKind
  width: number | null
  height: number | null
  dpi: number | null
  jpeg: JpegInfo | null
  png: PngInfo | null
  /** PDFs only: has an /Encrypt dictionary (password-protected). */
  encrypted: boolean | null
}

function hasEncrypt(b: Uint8Array): boolean {
  const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74] // "/Encrypt"
  outer: for (let i = 0; i + needle.length <= b.length; i++) {
    for (let k = 0; k < needle.length; k++) if (b[i + k] !== needle[k]) continue outer
    return true
  }
  return false
}

export function readFacts(name: string, data: Uint8Array): FileFacts {
  const kind = sniff(data)
  const facts: FileFacts = { name, bytes: data.length, kind, width: null, height: null, dpi: null, jpeg: null, png: null, encrypted: null }
  try {
    if (kind === 'jpeg') {
      const j = readJpeg(data)
      Object.assign(facts, { jpeg: j, width: j.width, height: j.height, dpi: j.dpi })
      // Width and height as a viewer shows them, after EXIF rotation.
      if (j.exif?.orientation && j.exif.orientation >= 5) Object.assign(facts, { width: j.height, height: j.width })
    } else if (kind === 'png') {
      const p = readPng(data)
      Object.assign(facts, { png: p, width: p.width, height: p.height, dpi: p.dpi })
    } else if (kind === 'pdf') {
      facts.encrypted = hasEncrypt(data)
    }
  } catch {
    // Damaged header: the format check still reports the real type; sizes stay unknown.
  }
  return facts
}

export type FilenameProblem = 'spaces' | 'special' | 'double-ext' | 'wrong-ext' | 'long' | 'name'

export function filenameProblems(name: string, kind: FileKind, required?: string): FilenameProblem[] {
  const out: FilenameProblem[] = []
  const ext = extensionOf(name)
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name
  if (/\s/.test(name)) out.push('spaces')
  if (/[^A-Za-z0-9._-]/.test(name.replace(/\s/g, ''))) out.push('special')
  if (/\.(jpe?g|png|pdf|heic|webp)$/i.test(stem)) out.push('double-ext')
  if (kind !== 'unknown' && ext && !EXTENSIONS[kind].includes(ext)) out.push('wrong-ext')
  if (name.length > 60) out.push('long')
  if (required && stem.toLowerCase() !== required.toLowerCase()) out.push('name')
  return out
}

export function inspect(f: FileFacts, p: Preset): Check[] {
  const checks: Check[] = []
  const want = p.format

  checks.push(
    f.kind === want
      ? { id: 'format', status: 'pass', params: { kind: KIND_LABEL[f.kind] } }
      : { id: 'format', status: 'fail', params: { kind: KIND_LABEL[f.kind], want: KIND_LABEL[want] } },
  )

  const verdict: KbVerdict = judgeKb(f.bytes, p.kb)
  checks.push({
    id: 'size',
    status: verdict === 'both' ? 'pass' : verdict === 'neither' ? 'fail' : 'warn',
    params: { size: formatKb(f.bytes), bytes: f.bytes, rule: formatRule(p.kb), verdict, over: f.bytes / 1024 > p.kb.max ? 1 : 0 },
  })

  if (want === 'jpeg' && f.width && f.height) {
    const actual = { w: f.width, h: f.height }
    // "Preferred" or "about" sizes: a different size is worth a warning, not a failure.
    const miss = p.approx ? 'warn' : 'fail'
    if (p.accept) {
      checks.push({ id: 'dims', status: fitsAccept(actual, p.accept) ? 'pass' : miss, params: { w: f.width, h: f.height, ...rangeParams(p), approx: p.approx ? 1 : 0 } })
    } else if (p.px) {
      const e = pxOf(p.px)
      const exact = e.w === f.width && e.h === f.height
      checks.push({ id: 'dims', status: exact ? 'pass' : miss, params: { w: f.width, h: f.height, ww: e.w, wh: e.h, approx: p.approx ? 1 : 0 } })
    }
  }

  if (want === 'jpeg' && p.dpi && f.kind === 'jpeg') {
    checks.push({ id: 'dpi', status: f.dpi === p.dpi ? 'pass' : 'warn', params: { dpi: f.dpi ?? 0, want: p.dpi } })
  }

  if (f.jpeg) {
    if (f.jpeg.color === 'cmyk' || f.jpeg.color === 'ycck') checks.push({ id: 'color', status: 'fail', params: { color: f.jpeg.color } })
    if (f.jpeg.progressive) checks.push({ id: 'progressive', status: 'warn', params: {} })
    const o = f.jpeg.exif?.orientation
    if (o && o !== 1) checks.push({ id: 'orientation', status: 'warn', params: { orientation: o } })
  }

  if (f.kind === 'pdf' && f.encrypted) checks.push({ id: 'encrypted', status: 'fail', params: {} })

  const problems = filenameProblems(f.name, f.kind, p.filename)
  checks.push({
    id: 'filename',
    status: problems.length ? 'warn' : 'pass',
    params: { name: f.name, problems: problems.join(','), required: p.filename ?? '' },
  })
  return checks
}

function rangeParams(p: Preset): Record<string, number> {
  const a = p.accept ?? {}
  return { minW: a.minW ?? 0, maxW: a.maxW ?? 0, minH: a.minH ?? 0, maxH: a.maxH ?? 0 }
}
