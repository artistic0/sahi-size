import { pxOf } from '../engine/dims'
import { formatRule } from '../engine/kb'
import type { Preset } from './types'

/** Plain-text descriptions of a preset's numbers, for spec tables and page copy. */
export function describePx(p: Preset): string | null {
  if (p.accept) {
    const a = p.accept
    const w = a.minW === a.maxW ? `${a.minW}` : `${a.minW ?? 0}–${a.maxW ?? '∞'}`
    const h = a.minH === a.maxH ? `${a.minH}` : `${a.minH ?? 0}–${a.maxH ?? '∞'}`
    return `${w} × ${h} px`
  }
  if (!p.px) return null
  const s = pxOf(p.px)
  if ('cm' in p.px) return `${s.w} × ${s.h} px (${p.px.cm[0]} × ${p.px.cm[1]} cm at ${p.px.dpi} DPI)`
  return `${s.w} × ${s.h} px${p.dpi ? ` at ${p.dpi} DPI` : ''}`
}

export function describeKb(p: Preset): string {
  return formatRule(p.kb)
}

export function describeType(p: Preset): string {
  return p.format === 'pdf' ? 'PDF' : 'JPG'
}

export function newestVerified(presets: Preset[]): string | null {
  const dates = presets.map((p) => p.source?.verifiedOn).filter((d): d is string => !!d)
  return dates.length ? dates.sort().at(-1)! : null
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
