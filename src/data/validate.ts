import { pxOf } from '../engine/dims'
import { pages, ui } from '../i18n/en'
import { EXAMS } from './exams'

/**
 * Checks the preset data and keeps the page text honest:
 *  - errors: broken data, missing text, or a KB range written in an exam page's text that no
 *    preset of that exam has (the copy drifted from the data)
 *  - warnings: rules not verified yet, or verified so long ago they should be checked again
 */
export const STALE_DAYS = 120

export function validatePresets(today = new Date()): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const ids = new Set<string>()
  const slugs = new Set<string>()
  const copy = pages.exams as Record<string, { rules: Record<string, string[]>; faq: { q: string; a: string }[]; description: string; title: string; intro: string; note?: string }>

  for (const exam of EXAMS) {
    if (slugs.has(exam.slug)) errors.push(`duplicate slug ${exam.slug}`)
    slugs.add(exam.slug)
    if (!/^[a-z0-9-]+$/.test(exam.slug)) errors.push(`${exam.id}: slug must be lowercase letters, digits and dashes`)
    const text = copy[exam.id]
    if (!text) {
      errors.push(`${exam.id}: no page text in src/i18n/en.ts`)
      continue
    }
    for (const r of exam.related) if (!EXAMS.some((e) => e.id === r)) errors.push(`${exam.id}: related exam "${r}" doesn't exist`)
    if (!exam.presets.some((p) => !p.live)) errors.push(`${exam.id}: no preset to make a file for`)

    for (const p of exam.presets) {
      const where = `${exam.id}/${p.id}`
      if (ids.has(p.id)) errors.push(`duplicate preset id ${p.id}`)
      ids.add(p.id)
      if (!(p.kb.max > 0)) errors.push(`${where}: kb.max must be positive`)
      if (p.kb.min != null && !(p.kb.min >= 0 && p.kb.min < p.kb.max)) errors.push(`${where}: kb.min must be below kb.max`)
      if (p.format === 'pdf' && (p.px || p.accept || p.dpi)) errors.push(`${where}: PDF presets have no pixel size or DPI`)
      if (p.px) {
        const s = pxOf(p.px)
        if (!(s.w >= 16 && s.h >= 16 && s.w <= 4000 && s.h <= 4000)) errors.push(`${where}: pixel size ${s.w}×${s.h} is out of range`)
        const a = p.accept
        if (a && ((a.minW && s.w < a.minW) || (a.maxW && s.w > a.maxW) || (a.minH && s.h < a.minH) || (a.maxH && s.h > a.maxH))) {
          errors.push(`${where}: the size we make (${s.w}×${s.h}) is outside the accepted range`)
        }
      }
      if (!text.rules[p.id]?.length) errors.push(`${where}: no rules text in src/i18n/en.ts`)
      if (!ui.presetLabel[p.id] && !ui.doc[p.doc]) errors.push(`${where}: no label`)
      if (!p.source) {
        warnings.push(`${where}: not verified against an official notice`)
      } else {
        if (!/^https:\/\//.test(p.source.url)) errors.push(`${where}: source URL must be https`)
        const d = new Date(`${p.source.verifiedOn}T00:00:00Z`)
        if (Number.isNaN(d.getTime())) errors.push(`${where}: verifiedOn "${p.source.verifiedOn}" is not a YYYY-MM-DD date`)
        else {
          const age = (today.getTime() - d.getTime()) / 86_400_000
          if (age < -1) errors.push(`${where}: verifiedOn is in the future`)
          if (age > STALE_DAYS) warnings.push(`${where}: last checked ${Math.floor(age)} days ago; check the latest notice again`)
        }
        if (p.source.partial) warnings.push(`${where}: only partly verified (${p.source.note ?? 'no note'})`)
      }
    }

    // Every "N–M KB" / "N KB and M KB" range in this exam's text must be a range one of its presets has.
    const ranges = new Set(exam.presets.map((p) => `${p.kb.min ?? 0}-${p.kb.max}`))
    const limits = new Set(exam.presets.flatMap((p) => [String(p.kb.max), String(p.kb.min ?? p.kb.max)]))
    const all = [text.title, text.description, text.intro, text.note ?? '', ...Object.values(text.rules).flat(), ...text.faq.flatMap((f) => [f.q, f.a])].join('\n')
    for (const m of all.matchAll(/(\d+)\s*(?:KB)?\s*(?:–|-|to|and)\s*(\d+)\s*KB/gi)) {
      if (!ranges.has(`${m[1]}-${m[2]}`)) errors.push(`${exam.id}: text mentions "${m[0]}", but no ${exam.name} preset has ${m[1]}–${m[2]} KB`)
    }
    for (const m of all.matchAll(/(?:up to|at most|under|not over|less than|over)\s+(\d+)\s*KB/gi)) {
      if (!limits.has(m[1])) errors.push(`${exam.id}: text mentions "${m[0]}", but no ${exam.name} preset has a ${m[1]} KB limit`)
    }
  }
  return { errors, warnings }
}
