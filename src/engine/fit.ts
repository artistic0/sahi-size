import type { Size } from './dims'
import { padTo } from './jpeg'
import type { ByteWindow } from './kb'

/**
 * Hit a byte window, e.g. 20–50 KB, with the best quality possible.
 *
 *  1. At the preferred size, binary-search the JPEG quality (whole numbers 1–100, so at most ~8
 *     encodes, each remembered) for the highest quality that is still under the limit.
 *  2. Too big even at the lowest quality: try the next smaller size the portal accepts.
 *  3. Too small even at quality 100 (a clean signature is often only a few KB): pad the file with
 *     a comment segment up to the minimum. The picture is unchanged; only the byte count grows.
 *  4. If the best quality is poor (< 40) and a smaller accepted size exists, try it: a smaller
 *     sharp image beats a big blocky one. Keep whichever had the higher quality.
 * Every number reported is measured on the real output bytes.
 */
export type Encode = (size: Size, quality: number) => Promise<Uint8Array>

export interface FitOptions {
  window: ByteWindow
  /** Preferred size first, then smaller sizes the portal also accepts. */
  sizes: Size[]
  allowPad?: boolean
  qMin?: number
  qMax?: number
  /** Below this quality, a smaller accepted size is worth trying. */
  qGood?: number
  /** Stop early (the user changed something). Checked between encodes. */
  cancelled?: () => boolean
}

export interface FitSuccess {
  ok: true
  bytes: Uint8Array
  size: Size
  quality: number
  /** Bytes of padding added to reach the minimum. */
  padded: number
  encodes: number
}

export interface FitFailure {
  ok: false
  reason: 'too-big' | 'too-small' | 'cancelled'
  /** Smallest file we could make (too-big), or largest (too-small). */
  bytes: number
  size: Size
  encodes: number
}

export class Cancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

export async function fitToWindow(encode: Encode, o: FitOptions): Promise<FitSuccess | FitFailure> {
  const { lo, hi } = o.window
  const qMin = o.qMin ?? 8
  const qMax = o.qMax ?? 100
  const qGood = o.qGood ?? 40
  const allowPad = o.allowPad ?? true
  let encodes = 0
  let best: FitSuccess | null = null
  let smallest: { bytes: number; size: Size } | null = null

  for (let k = 0; k < o.sizes.length; k++) {
    const size = o.sizes[k]
    const memo = new Map<number, Uint8Array>()
    const at = async (q: number) => {
      let out = memo.get(q)
      if (!out) {
        if (o.cancelled?.()) throw new Cancelled()
        out = await encode(size, q)
        encodes++
        memo.set(q, out)
      }
      return out
    }
    const done = (bytes: Uint8Array, quality: number): FitSuccess => {
      if (bytes.length >= lo) return { ok: true, bytes, size, quality, padded: 0, encodes }
      const padded = padTo(bytes, lo)
      return { ok: true, bytes: padded, size, quality, padded: padded.length - bytes.length, encodes }
    }

    const top = await at(qMax)
    if (top.length <= hi) {
      if (top.length >= lo || allowPad) return done(top, qMax)
      return { ok: false, reason: 'too-small', bytes: top.length, size, encodes }
    }
    const bottom = await at(qMin)
    if (bottom.length > hi) {
      if (!smallest || bottom.length < smallest.bytes) smallest = { bytes: bottom.length, size }
      continue
    }
    // Invariant: at(a) ≤ hi < at(b).
    let a = qMin
    let b = qMax
    while (b - a > 1) {
      const m = (a + b) >> 1
      if ((await at(m)).length <= hi) a = m
      else b = m
    }
    const bytes = await at(a)
    if (bytes.length < lo && !allowPad) {
      // The window is narrower than one quality step. Rare; report it rather than guess.
      return { ok: false, reason: 'too-small', bytes: bytes.length, size, encodes }
    }
    const result = done(bytes, a)
    if (a >= qGood || k === o.sizes.length - 1) return best && best.quality > a ? best : result
    if (!best || a > best.quality) best = result
  }
  if (best) return { ...best, encodes }
  const s = smallest ?? { bytes: 0, size: o.sizes[0] }
  return { ok: false, reason: 'too-big', bytes: s.bytes, size: s.size, encodes }
}
