import { clamp, coverRect, type Rect } from '../engine/dims'

/**
 * Crop geometry. The frame has a fixed shape (the output's aspect ratio); the image moves and
 * zooms behind it. A view is { zoom, cx, cy }: zoom 1 = the largest frame-shaped area that fits
 * in the image, cx/cy = the crop's centre as a fraction of the (rotated) image.
 */
export interface View {
  zoom: number
  cx: number
  cy: number
}

export const MAX_ZOOM = 10

export function rotatedSize(w: number, h: number, rotate: number): { iw: number; ih: number } {
  return rotate % 2 ? { iw: h, ih: w } : { iw: w, ih: h }
}

export function zoomRange(iw: number, ih: number, aspect: number, allowOutside: boolean): { min: number; max: number } {
  if (!allowOutside) return { min: 1, max: MAX_ZOOM }
  const base = coverRect(iw, ih, aspect)
  // Small enough to show the whole image inside the frame (the rest is white paper).
  return { min: Math.min(base.w / iw, base.h / ih, 1), max: MAX_ZOOM }
}

export function clampView(v: View, iw: number, ih: number, aspect: number, allowOutside: boolean): View {
  const { min, max } = zoomRange(iw, ih, aspect, allowOutside)
  const zoom = clamp(v.zoom, min, max)
  if (allowOutside) return { zoom, cx: clamp(v.cx, 0, 1), cy: clamp(v.cy, 0, 1) }
  const base = coverRect(iw, ih, aspect)
  const hw = base.w / zoom / 2 / iw
  const hh = base.h / zoom / 2 / ih
  return { zoom, cx: clamp(v.cx, hw, 1 - hw), cy: clamp(v.cy, hh, 1 - hh) }
}

/** The crop as a normalized rectangle of the rotated image (may reach outside 0–1). */
export function cropOf(v: View, iw: number, ih: number, aspect: number): Rect {
  const base = coverRect(iw, ih, aspect)
  const w = base.w / v.zoom / iw
  const h = base.h / v.zoom / ih
  return { x: v.cx - w / 2, y: v.cy - h / 2, w, h }
}

/** A view that frames a box (normalized) with some room around it. */
export function viewForBox(box: Rect, iw: number, ih: number, aspect: number, room = 1.3, allowOutside = true): View {
  const base = coverRect(iw, ih, aspect)
  const needW = Math.max(box.w * iw * room, box.h * ih * room * aspect)
  const v = { zoom: base.w / needW, cx: box.x + box.w / 2, cy: box.y + box.h / 2 }
  return clampView(v, iw, ih, aspect, allowOutside)
}
