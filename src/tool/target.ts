import type { DocKind, Preset } from '../data/types'
import { pxOf, shrinkSteps, type Accept, type Size } from '../engine/dims'
import type { KbRule } from '../engine/kb'
import { ui } from '../i18n/en'

/** What the image tool must produce: from an exam preset, or typed in on a generic page. */
export interface Target {
  key: string
  doc: DocKind
  /** Exact output size; null keeps the crop's size. */
  size: Size | null
  accept?: Accept
  smaller: Size[]
  kb: KbRule | null
  dpi?: number
  filename?: string
  multi?: 3
  /** The preset the checks run against (a made-up one for custom targets). */
  preset: Preset
}

export function targetFromPreset(p: Preset): Target {
  const size = p.px ? pxOf(p.px) : null
  return {
    key: p.id,
    doc: p.doc,
    size,
    accept: p.accept,
    smaller: size ? shrinkSteps(size, p.accept) : [],
    kb: p.kb,
    dpi: p.dpi ?? (p.px && 'cm' in p.px ? p.px.dpi : undefined),
    filename: p.filename,
    multi: p.multi,
    preset: p,
  }
}

export interface CustomSpec {
  doc: DocKind
  minKb: string
  maxKb: string
  width: string
  height: string
  dpi: string
}

const num = (s: string) => {
  const n = Number(s.trim())
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** A custom target, or an error message key when the numbers don't make sense. */
export function targetFromCustom(c: CustomSpec): Target | { error: string } {
  const max = num(c.maxKb)
  const min = num(c.minKb)
  if (!max || (min && min >= max)) return { error: ui.custom.invalid }
  const w = num(c.width)
  const h = num(c.height)
  const size = w && h ? { w: Math.round(w), h: Math.round(h) } : null
  const dpi = num(c.dpi)
  const kb = { min, max }
  const preset: Preset = { id: 'custom', doc: c.doc, format: 'jpeg', kb, px: size ?? undefined, dpi: dpi ? Math.round(dpi) : undefined, source: null }
  return { key: `custom-${c.doc}-${min}-${max}-${w}-${h}-${dpi}`, doc: c.doc, size, smaller: [], kb, dpi: dpi ? Math.round(dpi) : undefined, preset }
}

export function labelOf(p: { id: string; doc: DocKind }): string {
  return ui.presetLabel[p.id] ?? ui.doc[p.doc]
}

/** e.g. "ibps-signature-140x60-12kb.jpg", or the exact name a portal requires ("photo.jpg"). */
export function fileNameFor(t: Target, prefix: string, w: number, h: number, bytes: number): string {
  if (t.filename) return `${t.filename}.jpg`
  return `${prefix}-${t.doc}-${w}x${h}-${Math.max(1, Math.round(bytes / 1024))}kb.jpg`
}
