import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { assemblePdf, padPdf, resavePdf } from '../../src/engine/pdf/assemble'
import { buildRasterPdf, type PageJob } from '../../src/engine/pdf/build'
import { safeWindow } from '../../src/engine/kb'
import { resize } from '../../src/engine/resample'
import { encodeJpeg, photoRaster } from './helpers'

const A4 = { w: 595.28, h: 841.89 }
const page = (q = 70) => encodeJpeg(photoRaster(620, 877), q)

describe('pdf assembly', () => {
  it('puts one JPEG on each page, embedded as-is', async () => {
    const jpgs = [page(), page(50), page(30)]
    const pdf = await assemblePdf(jpgs.map((bytes) => ({ bytes, widthPt: A4.w, heightPt: A4.h })))
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBe(3)
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595)
    // Mostly image bytes, little overhead.
    const images = jpgs.reduce((n, j) => n + j.length, 0)
    expect(pdf.length - images).toBeLessThan(4000)
    expect(new TextDecoder().decode(pdf)).not.toMatch(/Producer|CreationDate/)
  })

  it('re-saves losslessly with the same pages', async () => {
    const pdf = await assemblePdf([{ bytes: page(), widthPt: A4.w, heightPt: A4.h }])
    const r = await resavePdf(pdf)
    expect(r.pages).toBe(1)
    expect((await PDFDocument.load(r.bytes)).getPageCount()).toBe(1)
  })

  it('pads to a minimum size and stays a valid PDF', async () => {
    const pdf = await assemblePdf([{ bytes: page(20), widthPt: A4.w, heightPt: A4.h }])
    const target = pdf.length + 30_000
    const out = await padPdf(pdf, target)
    expect(out.length).toBeGreaterThanOrEqual(target)
    expect(out.length - target).toBeLessThan(400)
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
  })
})

describe('fitting a document under a limit', () => {
  const photo = photoRaster(1240, 1754)
  const job = (): PageJob => ({
    pt: A4,
    encode: async (dpi, maxBytes) => {
      const scale = dpi / 150
      const r = resize(photo, Math.round(1240 * scale), Math.round(1754 * scale))
      for (let q = 92; q >= 20; q -= 8) {
        const bytes = encodeJpeg(r, q)
        if (bytes.length <= maxBytes) return { bytes, w: r.width, h: r.height }
      }
      return null
    },
  })

  it('gets five busy pages under 200 KB', async () => {
    const w = safeWindow({ max: 200 })
    const r = await buildRasterPdf([job(), job(), job(), job(), job()], w)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.bytes.length).toBeLessThanOrEqual(w.hi)
    expect((await PDFDocument.load(r.bytes)).getPageCount()).toBe(5)
  })

  it('reaches a minimum by padding', async () => {
    const w = safeWindow({ min: 300, max: 500 })
    const r = await buildRasterPdf([job()], w)
    expect(r.ok && r.bytes.length).toBeGreaterThanOrEqual(w.lo)
    expect(r.ok && r.bytes.length).toBeLessThanOrEqual(w.hi)
  })

  it('reports failure instead of making a broken file', async () => {
    const pages = Array.from({ length: 30 }, job)
    const r = await buildRasterPdf(pages, safeWindow({ max: 20 }), () => {}, [72])
    expect(r.ok).toBe(false)
  })
})
