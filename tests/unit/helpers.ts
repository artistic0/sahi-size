import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { createRaster, type Raster } from '../../src/engine/raster'

/** Deterministic pseudo-random numbers, so "noisy" test images are the same every run. */
export function rng(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** A photo-like image: smooth gradients, a face-coloured ellipse and some sensor noise. */
export function photoRaster(w: number, h: number, seed = 7): Raster {
  const r = createRaster(w, h)
  const rand = rng(seed)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4
      const dx = (x - w / 2) / (w * 0.28)
      const dy = (y - h * 0.42) / (h * 0.3)
      const face = dx * dx + dy * dy < 1
      const n = (rand() - 0.5) * 24
      r.data[p] = (face ? 215 : 235 - (y / h) * 40) + n
      r.data[p + 1] = (face ? 170 : 238 - (y / h) * 30) + n
      r.data[p + 2] = (face ? 140 : 242 - (x / w) * 20) + n
    }
  }
  return r
}

/** Photo of a signature: blue strokes on paper with a strong shadow from one side. */
export function signatureRaster(w: number, h: number, seed = 3): { raster: Raster; strokes: { x0: number; x1: number; y0: number; y1: number } } {
  const r = createRaster(w, h)
  const rand = rng(seed)
  const x0 = Math.round(w * 0.2)
  const x1 = Math.round(w * 0.8)
  let y0 = h
  let y1 = 0
  const ink = new Uint8Array(w * h)
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0)
    const cy = h * 0.5 + Math.sin(t * Math.PI * 3) * h * 0.18
    const thick = Math.max(2, Math.round(h * 0.025))
    for (let k = -thick; k <= thick; k++) {
      const y = Math.round(cy + k)
      if (y < 0 || y >= h) continue
      ink[y * w + x] = 1
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4
      const light = 150 + (x / w) * 90 // shadow on the left: paper from 150 to 240
      const n = (rand() - 0.5) * 10
      if (ink[y * w + x]) {
        r.data[p] = light * 0.25 + n
        r.data[p + 1] = light * 0.3 + n
        r.data[p + 2] = light * 0.6 + n
      } else {
        r.data[p] = light + n
        r.data[p + 1] = light + n - 2
        r.data[p + 2] = light + n - 6
      }
    }
  }
  return { raster: r, strokes: { x0, x1, y0, y1 } }
}

export function encodeJpeg(r: Raster, quality = 90): Uint8Array {
  const out = jpeg.encode({ data: Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength), width: r.width, height: r.height }, quality)
  return new Uint8Array(out.data)
}

export function decodeJpeg(b: Uint8Array): Raster {
  const d = jpeg.decode(b, { useTArray: true, formatAsRGBA: true })
  return { width: d.width, height: d.height, data: new Uint8ClampedArray(d.data.buffer, d.data.byteOffset, d.data.byteLength) }
}

export function encodePng(r: Raster): Uint8Array {
  const png = new PNG({ width: r.width, height: r.height })
  png.data = Buffer.from(r.data)
  return new Uint8Array(PNG.sync.write(png, { colorType: 6 }))
}

export function pixel(r: Raster, x: number, y: number): number[] {
  const p = (y * r.width + x) * 4
  return [r.data[p], r.data[p + 1], r.data[p + 2], r.data[p + 3]]
}
