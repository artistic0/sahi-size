import { describe, expect, it } from 'vitest'
import { coverRect, containSize, pxOf, shrinkSteps } from '../../src/engine/dims'
import { applyExifOrientation, autoLevels, cropRaster, flattenOnWhite, rotate90 } from '../../src/engine/enhance'
import { cleanInk, inkFill, otsu } from '../../src/engine/ink'
import { createRaster, luma, meanLuma, type Raster } from '../../src/engine/raster'
import { resize } from '../../src/engine/resample'
import { photoRaster, pixel, signatureRaster } from './helpers'

/** A 3×2 image whose pixels are numbered 1…6 in the red channel, to follow them around. */
function numbered(): Raster {
  const r = createRaster(3, 2)
  for (let i = 0; i < 6; i++) r.data[i * 4] = i + 1
  return r
}
const reds = (r: Raster) => Array.from({ length: r.width * r.height }, (_, i) => r.data[i * 4])

describe('dims', () => {
  it('converts centimetres at a DPI', () => {
    expect(pxOf({ cm: [3.5, 4.5], dpi: 200 })).toEqual({ w: 276, h: 354 })
    expect(pxOf({ w: 200, h: 230 })).toEqual({ w: 200, h: 230 })
  })
  it('finds cover rectangles and contained sizes', () => {
    expect(coverRect(400, 400, 0.5)).toEqual({ x: 100, y: 0, w: 200, h: 400 })
    expect(containSize(1000, 500, 140, 60)).toEqual({ w: 120, h: 60 })
  })
  it('only shrinks within the accepted range', () => {
    expect(shrinkSteps({ w: 200, h: 230 })).toEqual([])
    const steps = shrinkSteps({ w: 1000, h: 1000 }, { minW: 350, maxW: 1000, minH: 350, maxH: 1000 })
    expect(steps.length).toBeGreaterThan(3)
    expect(steps.every((s) => s.w >= 350 && s.w < 1000)).toBe(true)
  })
})

describe('resample', () => {
  it('averages a checkerboard to flat grey when shrinking', () => {
    const r = createRaster(64, 64)
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if ((x + y) % 2) r.data.fill(0, (y * 64 + x) * 4, (y * 64 + x) * 4 + 3)
    const out = resize(r, 8, 8)
    expect(out.width).toBe(8)
    for (let i = 0; i < out.data.length; i += 4) expect(Math.abs(out.data[i] - 127.5)).toBeLessThanOrEqual(1)
  })
  it('keeps flat colour flat at any scale', () => {
    const r = createRaster(37, 23, [10, 200, 90, 255])
    for (const [w, h] of [
      [7, 3],
      [100, 61],
      [37, 5],
    ]) {
      const out = resize(r, w, h)
      expect([out.width, out.height]).toEqual([w, h])
      expect(pixel(out, w - 1, h - 1)).toEqual([10, 200, 90, 255])
      expect(pixel(out, 0, 0)).toEqual([10, 200, 90, 255])
    }
  })
  it('enlarges with bilinear interpolation', () => {
    const r = createRaster(2, 1)
    r.data.set([0, 0, 0, 255], 0)
    const out = resize(r, 4, 1)
    const rs = reds(out)
    expect(rs[0]).toBe(0)
    expect(rs[3]).toBe(255)
    expect(rs[1]).toBeGreaterThan(0)
    expect(rs[2]).toBeLessThan(255)
  })
})

describe('enhance', () => {
  it('turns transparent pixels white, not black', () => {
    const r = createRaster(2, 1, [0, 0, 0, 0])
    expect(pixel(flattenOnWhite(r), 0, 0)).toEqual([255, 255, 255, 255])
  })
  it('rotates clockwise', () => {
    const r = rotate90(numbered(), 1)
    expect([r.width, r.height]).toEqual([2, 3])
    expect(reds(r)).toEqual([4, 1, 5, 2, 6, 3])
    expect(reds(rotate90(numbered(), 2))).toEqual([6, 5, 4, 3, 2, 1])
    expect(reds(rotate90(numbered(), 3))).toEqual([3, 6, 2, 5, 1, 4])
  })
  it('applies every EXIF orientation', () => {
    // Expected upright images for a 3×2 source stored with each orientation.
    expect(reds(applyExifOrientation(numbered(), 1))).toEqual([1, 2, 3, 4, 5, 6])
    expect(reds(applyExifOrientation(numbered(), 2))).toEqual([3, 2, 1, 6, 5, 4])
    expect(reds(applyExifOrientation(numbered(), 3))).toEqual([6, 5, 4, 3, 2, 1])
    expect(reds(applyExifOrientation(numbered(), 4))).toEqual([4, 5, 6, 1, 2, 3])
    expect(reds(applyExifOrientation(numbered(), 5))).toEqual([1, 4, 2, 5, 3, 6]) // transpose
    expect(reds(applyExifOrientation(numbered(), 6))).toEqual([4, 1, 5, 2, 6, 3])
    expect(reds(applyExifOrientation(numbered(), 7))).toEqual([6, 3, 5, 2, 4, 1]) // transverse
    expect(reds(applyExifOrientation(numbered(), 8))).toEqual([3, 6, 2, 5, 1, 4])
  })
  it('crops, filling outside areas with white', () => {
    const c = cropRaster(numbered(), { x: 1, y: -1, w: 3, h: 2 })
    expect(reds(c)).toEqual([255, 255, 255, 2, 3, 255])
  })
  it('brightens a dark photo and leaves a good one nearly alone', () => {
    const dark = photoRaster(120, 150)
    for (let i = 0; i < dark.data.length; i += 4) {
      dark.data[i] *= 0.35
      dark.data[i + 1] *= 0.35
      dark.data[i + 2] *= 0.35
    }
    const before = meanLuma(dark)
    expect(meanLuma(autoLevels(dark))).toBeGreaterThan(before + 60)
    const good = photoRaster(120, 150)
    const m = meanLuma(good)
    expect(Math.abs(meanLuma(autoLevels(good)) - m)).toBeLessThan(25)
  })
})

describe('ink: cleaning a phone photo of a signature', () => {
  const { raster, strokes } = signatureRaster(900, 360)

  it('makes the paper white and keeps the strokes dark, despite the shadow', () => {
    const out = cleanInk(raster, { mode: 'signature', color: 'original', darkness: 0, trim: false }).raster
    let paperWhite = 0
    let paper = 0
    for (let y = 0; y < out.height; y += 3) {
      for (let x = 0; x < out.width; x += 3) {
        const inStrokeArea = x >= strokes.x0 - 12 && x <= strokes.x1 + 12 && y >= strokes.y0 - 12 && y <= strokes.y1 + 12
        if (inStrokeArea) continue
        paper++
        const [r, g, b] = pixel(out, x, y)
        if (luma(r, g, b) >= 250) paperWhite++
      }
    }
    expect(paperWhite / paper).toBeGreaterThan(0.99)
    // Middle of the stroke near the left (shadowed) end is still dark.
    const cx = strokes.x0 + 5
    let darkest = 255
    for (let y = 0; y < out.height; y++) {
      const [r, g, b] = pixel(out, cx, y)
      darkest = Math.min(darkest, luma(r, g, b))
    }
    expect(darkest).toBeLessThan(110)
  })

  it('trims to the ink with a small margin', () => {
    const res = cleanInk(raster, { mode: 'signature', color: 'black', darkness: 0, trim: true })
    expect(res.box).not.toBeNull()
    const b = res.box!
    expect(Math.abs(b.x - strokes.x0)).toBeLessThanOrEqual(3)
    expect(Math.abs(b.x + b.w - 1 - strokes.x1)).toBeLessThanOrEqual(3)
    expect(res.raster.width).toBe(b.w + 2 * res.pad)
    expect(inkFill(res.raster)).toBeGreaterThan(0.85)
  })

  it('finds nothing on a blank page and does not invent ink', () => {
    const blank = createRaster(400, 200, [200, 200, 195, 255])
    const res = cleanInk(blank, { mode: 'signature', color: 'original', darkness: 0, trim: true })
    expect(res.box).toBeNull()
    expect(meanLuma(res.raster)).toBeGreaterThan(250)
  })

  it('picks a sensible Otsu threshold for two groups', () => {
    const v = new Float32Array(1000)
    v.fill(40, 0, 100)
    v.fill(240, 100)
    const t = otsu(v)
    expect(t).toBeGreaterThanOrEqual(40)
    expect(t).toBeLessThan(240)
  })
})
