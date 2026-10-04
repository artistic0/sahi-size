import { describe, expect, it } from 'vitest'
import { formatRule, judgeKb, safeWindow } from '../../src/engine/kb'
import { padTo, readJpeg, setJfifDpi, stripMetadata, withExifOrientation } from '../../src/engine/jpeg'
import { readPng } from '../../src/engine/png'
import { sniff } from '../../src/engine/sniff'
import { createRaster } from '../../src/engine/raster'
import { decodeJpeg, encodeJpeg, encodePng, photoRaster } from './helpers'

const bytes = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])))

describe('sniff: what a file really is', () => {
  it('reads magic bytes, not names', () => {
    expect(sniff(encodeJpeg(createRaster(8, 8)))).toBe('jpeg')
    expect(sniff(encodePng(createRaster(8, 8)))).toBe('png')
    expect(sniff(bytes('%PDF-1.7\n'))).toBe('pdf')
    expect(sniff(bytes('junk\n%PDF-1.4'))).toBe('pdf')
    expect(sniff(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('webp')
    expect(sniff(bytes('GIF89a', 0, 0))).toBe('gif')
    expect(sniff(bytes(0, 0, 0, 24, 'ftypheic', 0, 0, 0, 0, 'mif1heic'))).toBe('heic')
    expect(sniff(bytes(0, 0, 0, 28, 'ftypavif', 0, 0, 0, 0, 'avifmif1miaf'))).toBe('avif')
    expect(sniff(bytes('hello world'))).toBe('unknown')
  })
})

describe('kb: the safe byte window', () => {
  it('sits inside both meanings of KB', () => {
    const w = safeWindow({ min: 20, max: 50 })
    expect(w.lo).toBeGreaterThanOrEqual(20 * 1024)
    expect(w.hi).toBeLessThanOrEqual(50 * 1000)
    expect(judgeKb(w.lo, { min: 20, max: 50 })).toBe('both')
    expect(judgeKb(w.hi, { min: 20, max: 50 })).toBe('both')
  })
  it('handles max-only and very narrow rules', () => {
    expect(safeWindow({ max: 10 }).lo).toBe(0)
    expect(safeWindow({ max: 10 }).hi).toBeLessThanOrEqual(10_000)
    const narrow = safeWindow({ min: 49, max: 50 })
    expect(narrow.lo).toBeLessThan(narrow.hi)
    expect(judgeKb(narrow.lo, { min: 49, max: 50 })).not.toBe('neither')
  })
  it('judges files the way portals could', () => {
    expect(judgeKb(50_500, { max: 50 })).toBe('kib-only') // 49.3 KiB but 50.5 kB
    expect(judgeKb(20_200, { min: 20, max: 50 })).toBe('kb-only') // 20.2 kB but 19.7 KiB
    expect(judgeKb(80_000, { max: 50 })).toBe('neither')
    expect(formatRule({ min: 20, max: 50 })).toBe('20–50 KB')
    expect(formatRule({ max: 200 })).toBe('up to 200 KB')
  })
})

describe('jpeg: reading and patching headers', () => {
  const src = photoRaster(240, 300)
  const file = encodeJpeg(src, 80)

  it('reads size, colour and an estimate of the quality', () => {
    const info = readJpeg(file)
    expect([info.width, info.height]).toEqual([240, 300])
    expect(info.color).toBe('ycbcr')
    expect(info.progressive).toBe(false)
    expect(Math.abs((info.quality ?? 0) - 80)).toBeLessThanOrEqual(2)
  })

  it('writes the DPI into JFIF', () => {
    const out = setJfifDpi(file, 200)
    expect(readJpeg(out).dpi).toBe(200)
    expect(out.length).toBe(file.length) // patched in place when JFIF exists
    const noJfif = stripMetadata(file).filter(() => true)
    expect(readJpeg(setJfifDpi(noJfif, 300)).dpi).toBe(300)
  })

  it('pads to an exact size without changing a single pixel', () => {
    for (const target of [file.length + 1, file.length + 5, file.length + 1000, file.length + 140_000]) {
      const out = padTo(file, target)
      expect(out.length - target).toBeGreaterThanOrEqual(0)
      expect(out.length - target).toBeLessThanOrEqual(3)
      expect(decodeJpeg(out).data).toEqual(decodeJpeg(file).data)
      expect(readJpeg(out).width).toBe(240)
    }
    expect(padTo(file, 10)).toBe(file)
  })

  it('sets and strips EXIF orientation', () => {
    const rotated = withExifOrientation(file, 6)
    expect(readJpeg(rotated).exif?.orientation).toBe(6)
    expect(decodeJpeg(rotated).data).toEqual(decodeJpeg(file).data)
    const clean = stripMetadata(rotated)
    expect(readJpeg(clean).exif).toBeNull()
    expect(readJpeg(withExifOrientation(rotated, 3)).exif?.orientation).toBe(3)
  })

  it('rejects damaged files clearly', () => {
    expect(() => readJpeg(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 99))).toThrow(/Truncated/)
    expect(() => readJpeg(bytes('not a jpeg'))).toThrow(/Not a JPEG/)
  })
})

describe('png', () => {
  it('reads size and transparency', () => {
    const r = createRaster(30, 20, [0, 0, 0, 0])
    const info = readPng(encodePng(r))
    expect(info).toMatchObject({ width: 30, height: 20, hasAlpha: true })
  })
})
