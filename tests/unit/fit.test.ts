import { describe, expect, it } from 'vitest'
import type { Size } from '../../src/engine/dims'
import { fitToWindow } from '../../src/engine/fit'
import { padTo, readJpeg } from '../../src/engine/jpeg'
import { safeWindow } from '../../src/engine/kb'
import { createRaster } from '../../src/engine/raster'
import { resize } from '../../src/engine/resample'
import { decodeJpeg, encodeJpeg, photoRaster } from './helpers'

const base = encodeJpeg(createRaster(16, 16), 50)

/** A pretend encoder whose output size follows a formula; the bytes are a real (padded) JPEG. */
function modelEncoder(sizeOf: (s: Size, q: number) => number) {
  const calls: [Size, number][] = []
  const encode = async (s: Size, q: number) => {
    calls.push([s, q])
    return padTo(base, Math.max(base.length, Math.round(sizeOf(s, q))))
  }
  return { encode, calls }
}

describe('fitToWindow', () => {
  it('finds the highest quality under the limit in a handful of encodes', async () => {
    const w = safeWindow({ min: 20, max: 50 })
    const { encode, calls } = modelEncoder((_s, q) => 5000 + q * 600) // q 74 → 49.4 KB
    const r = await fitToWindow(encode, { window: w, sizes: [{ w: 200, h: 230 }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.bytes.length).toBeLessThanOrEqual(w.hi)
    expect(r.bytes.length).toBeGreaterThanOrEqual(w.lo)
    expect(5000 + (r.quality + 1) * 600).toBeGreaterThan(w.hi) // one step higher would not fit
    expect(calls.length).toBeLessThanOrEqual(9)
    expect(r.padded).toBe(0)
  })

  it('pads when even the best quality is under the minimum', async () => {
    const w = safeWindow({ min: 10, max: 20 })
    const { encode } = modelEncoder((_s, q) => 1200 + q * 40) // at most 5.2 KB
    const r = await fitToWindow(encode, { window: w, sizes: [{ w: 140, h: 60 }] })
    expect(r.ok && r.quality).toBe(100)
    expect(r.ok && r.padded).toBeGreaterThan(0)
    expect(r.ok && r.bytes.length).toBeGreaterThanOrEqual(w.lo)
    expect(r.ok && r.bytes.length).toBeLessThanOrEqual(w.hi)
  })

  it('refuses to pad when padding is not allowed', async () => {
    const { encode } = modelEncoder(() => 3000)
    const r = await fitToWindow(encode, { window: safeWindow({ min: 10, max: 20 }), sizes: [{ w: 140, h: 60 }], allowPad: false })
    expect(r).toMatchObject({ ok: false, reason: 'too-small' })
  })

  it('steps down to a smaller accepted size when the first is too big', async () => {
    const { encode } = modelEncoder((s, q) => (s.w * s.h) / 4 + q * 100) // 1000×1000 → 250 KB at q=0
    const sizes = [
      { w: 1000, h: 1000 },
      { w: 600, h: 600 },
      { w: 350, h: 350 },
    ]
    const r = await fitToWindow(encode, { window: safeWindow({ max: 100 }), sizes })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.size.w).toBeLessThan(1000)
  })

  it('reports too-big with the smallest file it could make', async () => {
    const { encode } = modelEncoder((s) => s.w * s.h)
    const r = await fitToWindow(encode, { window: safeWindow({ max: 10 }), sizes: [{ w: 400, h: 400 }] })
    expect(r).toMatchObject({ ok: false, reason: 'too-big' })
    if (!r.ok) expect(r.bytes).toBeGreaterThan(10_000)
  })

  it('works with a real encoder end to end', async () => {
    const photo = photoRaster(900, 1100)
    const w = safeWindow({ min: 20, max: 50 })
    const encode = async (s: Size, q: number) => encodeJpeg(resize(photo, s.w, s.h), q)
    const r = await fitToWindow(encode, { window: w, sizes: [{ w: 200, h: 230 }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const info = readJpeg(r.bytes)
    expect([info.width, info.height]).toEqual([200, 230])
    expect(r.bytes.length).toBeGreaterThanOrEqual(w.lo)
    expect(r.bytes.length).toBeLessThanOrEqual(w.hi)
    expect(decodeJpeg(r.bytes).width).toBe(200)
  })

  it('stops when cancelled', async () => {
    let n = 0
    const { encode } = modelEncoder((_s, q) => 5000 + q * 600)
    const r = fitToWindow(encode, { window: safeWindow({ max: 50 }), sizes: [{ w: 10, h: 10 }], cancelled: () => ++n > 2 })
    await expect(r).rejects.toThrow('cancelled')
  })
})
