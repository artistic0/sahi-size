/** Pixel-size rules and rectangle maths. */
export interface Size {
  w: number
  h: number
}

/** A portal states a size either in pixels or in centimetres at a DPI. */
export type PxSpec = { w: number; h: number } | { cm: readonly [number, number]; dpi: number }

/** What a portal accepts, when it gives a range instead of one exact size. */
export interface Accept {
  minW?: number
  maxW?: number
  minH?: number
  maxH?: number
}

/** x, y, w, h. Either in pixels or normalized to 0–1, depending on the caller. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const cmToPx = (cm: number, dpi: number): number => Math.round((cm / 2.54) * dpi)

export function pxOf(spec: PxSpec): Size {
  return 'cm' in spec ? { w: cmToPx(spec.cm[0], spec.dpi), h: cmToPx(spec.cm[1], spec.dpi) } : { w: spec.w, h: spec.h }
}

export function fitsAccept(s: Size, a?: Accept): boolean {
  if (!a) return true
  return (a.minW == null || s.w >= a.minW) && (a.maxW == null || s.w <= a.maxW) && (a.minH == null || s.h >= a.minH) && (a.maxH == null || s.h <= a.maxH)
}

/** The largest rectangle of the given aspect (w/h) centred inside W×H, in pixels. */
export function coverRect(W: number, H: number, aspect: number): Rect {
  if (W / H > aspect) {
    const w = H * aspect
    return { x: (W - w) / 2, y: 0, w, h: H }
  }
  const h = W / aspect
  return { x: 0, y: (H - h) / 2, w: W, h }
}

/** W×H scaled to fit inside the box, keeping its shape (never larger than the box). */
export function containSize(W: number, H: number, boxW: number, boxH: number): Size {
  const s = Math.min(boxW / W, boxH / H)
  return { w: Math.max(1, Math.round(W * s)), h: Math.max(1, Math.round(H * s)) }
}

/** Shrink W×H so neither side is over `maxSide` (unchanged if it already fits). */
export function limitSide(W: number, H: number, maxSide: number): Size {
  if (Math.max(W, H) <= maxSide) return { w: W, h: H }
  return containSize(W, H, maxSide, maxSide)
}

/**
 * Smaller sizes to try when a file can't get under the size limit: same shape, about 12% smaller
 * each step, while the portal still accepts the size. Exact-size rules (no range) give none.
 */
export function shrinkSteps(start: Size, accept?: Accept, minSide = 48): Size[] {
  if (!accept) return []
  const steps: Size[] = []
  let s = 0.88
  for (let i = 0; i < 12; i++, s *= 0.88) {
    const next = { w: Math.round(start.w * s), h: Math.round(start.h * s) }
    if (Math.min(next.w, next.h) < minSide || !fitsAccept(next, accept)) break
    steps.push(next)
  }
  return steps
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
