/**
 * "KB" means 1000 bytes to some portals and 1024 bytes to others (a JavaScript check like
 * `file.size / 1024 <= 50` is the most common). We don't know which one a portal uses, so every
 * file we make sits inside both readings: at least min×1024 bytes and at most max×1000 bytes,
 * with a small margin so a "less than" check passes too.
 */
export interface KbRule {
  min?: number
  max: number
}

export interface ByteWindow {
  lo: number
  hi: number
}

export function safeWindow(rule: KbRule): ByteWindow {
  const lo0 = rule.min ? Math.ceil(rule.min * 1024) : 0
  const hi0 = Math.floor(rule.max * 1000)
  if (lo0 < hi0) {
    const margin = Math.min(1024, Math.max(64, Math.round((hi0 - lo0) * 0.01)))
    const lo = lo0 ? lo0 + margin : 0
    const hi = hi0 - margin
    return lo < hi ? { lo, hi } : { lo: lo0, hi: hi0 }
  }
  // The two readings don't overlap (a very narrow range): follow 1 KB = 1024 bytes, the common one.
  return { lo: Math.ceil((rule.min ?? 0) * 1024), hi: Math.floor(rule.max * 1024) }
}

export type KbVerdict = 'both' | 'kib-only' | 'kb-only' | 'neither'

/** Does a file of `bytes` pass the rule if the portal counts 1 KB as 1024 bytes, 1000 bytes, both or neither? */
export function judgeKb(bytes: number, rule: KbRule): KbVerdict {
  const ok = (unit: number) => bytes / unit <= rule.max && (rule.min == null || bytes / unit >= rule.min)
  const kib = ok(1024)
  const kb = ok(1000)
  if (kib && kb) return 'both'
  if (kib) return 'kib-only'
  if (kb) return 'kb-only'
  return 'neither'
}

/** Sizes are shown the way most portals count them (1 KB = 1024 bytes). */
export function formatKb(bytes: number): string {
  const kb = bytes / 1024
  if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB`
  return `${kb < 10 ? kb.toFixed(1) : kb.toFixed(kb < 100 ? 1 : 0)} KB`
}

export function formatBytes(bytes: number): string {
  return `${new Intl.NumberFormat('en-IN').format(bytes)} bytes`
}

export function formatRule(rule: KbRule): string {
  const max = rule.max >= 1024 && rule.max % 1024 === 0 ? `${rule.max / 1024} MB` : `${rule.max} KB`
  return rule.min ? `${rule.min}–${max}` : `up to ${max}`
}
