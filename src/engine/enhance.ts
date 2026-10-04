import { createRaster, luma, meanLuma, type Raster } from './raster'
import type { Rect } from './dims'

/**
 * JPEG has no transparency. Browsers turn transparent pixels black when encoding, which ruins a
 * signature saved as a transparent PNG, so every pipeline composites onto white first.
 */
export function flattenOnWhite(r: Raster): Raster {
  const d = r.data
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    if (a === 255) continue
    const k = a / 255
    d[i] = d[i] * k + 255 * (1 - k)
    d[i + 1] = d[i + 1] * k + 255 * (1 - k)
    d[i + 2] = d[i + 2] * k + 255 * (1 - k)
    d[i + 3] = 255
  }
  return r
}

export function hasTransparency(r: Raster): boolean {
  const d = r.data
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true
  return false
}

export function grayscale(r: Raster): Raster {
  const d = r.data
  for (let i = 0; i < d.length; i += 4) {
    const y = luma(d[i], d[i + 1], d[i + 2])
    d[i] = y
    d[i + 1] = y
    d[i + 2] = y
  }
  return r
}

function lumaHistogram(r: Raster): Uint32Array {
  const hist = new Uint32Array(256)
  const d = r.data
  for (let i = 0; i < d.length; i += 4) hist[Math.round(luma(d[i], d[i + 1], d[i + 2]))]++
  return hist
}

function percentile(hist: Uint32Array, total: number, p: number): number {
  const target = total * p
  let seen = 0
  for (let v = 0; v < 256; v++) {
    seen += hist[v]
    if (seen >= target) return v
  }
  return 255
}

function applyLut(r: Raster, lut: Uint8ClampedArray): Raster {
  const d = r.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]]
    d[i + 1] = lut[d[i + 1]]
    d[i + 2] = lut[d[i + 2]]
  }
  return r
}

/**
 * Fix a dull or dark photo. Portals reject dark photos ("insufficient brightness" is on SSC's list
 * of rejection reasons).
 *  - white point: scale so the brightest 0.5% reaches white (blacks stay black)
 *  - black point: only for a foggy, washed-out photo, pull the darkest values down a little
 *  - midtones: if it is still dark, lift them with a gamma curve
 * Gains are capped so sensor noise isn't amplified.
 */
export function autoLevels(r: Raster, maxGain = 2.2): Raster {
  const total = r.width * r.height
  const hist = lumaHistogram(r)
  const low = percentile(hist, total, 0.005)
  const high = Math.max(1, percentile(hist, total, 0.995))
  const gain = Math.min(maxGain, 255 / high)
  const black = low > 30 && high > 200 ? (low - 10) * 0.5 : 0
  if (gain > 1.02 || black) {
    const lut = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) lut[v] = ((v - black) * 255) / (255 - black) * gain
    applyLut(r, lut)
  }
  const mean = meanLuma(r)
  if (mean < 105 && mean > 5) {
    // Gamma that moves the mean toward ~125, but never more than 0.6.
    const gamma = Math.max(0.6, Math.log(125 / 255) / Math.log(mean / 255))
    const lut = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(v / 255, gamma)
    applyLut(r, lut)
  }
  return r
}

/** brightness and contrast in −1…1 (0 = unchanged). */
export function adjust(r: Raster, brightness: number, contrast: number): Raster {
  if (!brightness && !contrast) return r
  const c = Math.tan(((Math.max(-0.95, Math.min(0.95, contrast)) + 1) * Math.PI) / 4) // 0 → 1×
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) lut[v] = (v - 128) * c + 128 + brightness * 96
  return applyLut(r, lut)
}

/** Rotate clockwise by 90° × turns. */
export function rotate90(src: Raster, turns: number): Raster {
  const t = ((turns % 4) + 4) % 4
  if (t === 0) return src
  const { width: W, height: H, data: s } = src
  const out = t === 2 ? createRaster(W, H) : createRaster(H, W)
  const d = out.data
  const OW = out.width
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let nx: number
      let ny: number
      if (t === 1) {
        nx = H - 1 - y
        ny = x
      } else if (t === 2) {
        nx = W - 1 - x
        ny = H - 1 - y
      } else {
        nx = y
        ny = W - 1 - x
      }
      const si = (y * W + x) * 4
      const di = (ny * OW + nx) * 4
      d[di] = s[si]
      d[di + 1] = s[si + 1]
      d[di + 2] = s[si + 2]
      d[di + 3] = s[si + 3]
    }
  }
  return out
}

/** Mirror image for EXIF orientations 2, 4, 5 and 7. */
export function flipHorizontal(src: Raster): Raster {
  const { width: W, height: H } = src
  const out = createRaster(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 4
      const di = (y * W + (W - 1 - x)) * 4
      out.data.set(src.data.subarray(si, si + 4), di)
    }
  }
  return out
}

/** Apply an EXIF orientation (1–8) to pixels that were decoded without it. */
export function applyExifOrientation(src: Raster, orientation: number): Raster {
  switch (orientation) {
    case 2:
      return flipHorizontal(src)
    case 3:
      return rotate90(src, 2)
    case 4:
      return rotate90(flipHorizontal(src), 2)
    case 5: // transpose: (x, y) → (y, x)
      return rotate90(flipHorizontal(src), 3)
    case 6:
      return rotate90(src, 1)
    case 7: // transverse: (x, y) → (H−1−y, W−1−x)
      return rotate90(flipHorizontal(src), 1)
    case 8:
      return rotate90(src, 3)
    default:
      return src
  }
}

/** Copy a pixel rectangle. Parts outside the source become white (paper). */
export function cropRaster(src: Raster, rect: Rect): Raster {
  const x0 = Math.round(rect.x)
  const y0 = Math.round(rect.y)
  const w = Math.max(1, Math.round(rect.w))
  const h = Math.max(1, Math.round(rect.h))
  const out = createRaster(w, h)
  const { width: W, height: H } = src
  for (let y = 0; y < h; y++) {
    const sy = y0 + y
    if (sy < 0 || sy >= H) continue
    const xa = Math.max(0, -x0)
    const xb = Math.min(w, W - x0)
    if (xb <= xa) continue
    const s = (sy * W + x0 + xa) * 4
    out.data.set(src.data.subarray(s, s + (xb - xa) * 4), (y * w + xa) * 4)
  }
  return out
}

/** Paste `src` into a white canvas of W×H at (x, y). */
export function placeOnWhite(src: Raster, W: number, H: number, x: number, y: number): Raster {
  const out = createRaster(W, H)
  for (let row = 0; row < src.height; row++) {
    const ty = y + row
    if (ty < 0 || ty >= H) continue
    const xa = Math.max(0, -x)
    const xb = Math.min(src.width, W - x)
    if (xb <= xa) continue
    const s = (row * src.width + xa) * 4
    out.data.set(src.data.subarray(s, s + (xb - xa) * 4), (ty * W + x + xa) * 4)
  }
  return out
}
