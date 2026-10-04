import type { ByteWindow } from '../kb'
import { assemblePdf, padPdf, type JpegPage } from './assemble'

/**
 * Fit a whole document under a byte limit by re-drawing every page as a JPEG.
 *
 * The limit is shared out as a budget: each page gets (what's left) ÷ (pages left), so a blank
 * page leaves room for a busy one after it. Each page is encoded at the best quality that fits
 * its share. If a page can't fit even at low quality, the whole document goes down one
 * resolution step (150 → 120 → 100 → 85 → 72 DPI) and starts again.
 */
export interface PageJob {
  /** Page size in points, for pages from a PDF; photos get theirs from pixels ÷ DPI. */
  pt?: { w: number; h: number }
  /** Draw at `dpi` and encode under `maxBytes`, or null if it can't fit. */
  encode(dpi: number, maxBytes: number): Promise<{ bytes: Uint8Array; w: number; h: number } | null>
}

export const DPI_STEPS = [150, 120, 100, 85, 72]

/** pdf-lib's fixed cost: catalog, page tree, xref, plus each page's objects. */
export const overheadFor = (pages: number) => 1200 + 650 * pages

export type BuildResult = { ok: true; bytes: Uint8Array; dpi: number; padded: number } | { ok: false }

export async function buildRasterPdf(
  pages: PageJob[],
  window: ByteWindow,
  onProgress: (done: number, total: number) => void = () => {},
  dpiSteps = DPI_STEPS,
): Promise<BuildResult> {
  for (const dpi of dpiSteps) {
    let budget = window.hi - overheadFor(pages.length)
    for (let attempt = 0; attempt < 3; attempt++) {
      const out: JpegPage[] = []
      let used = 0
      let fits = true
      for (let i = 0; i < pages.length; i++) {
        onProgress(i + 1, pages.length)
        const share = Math.floor((budget - used) / (pages.length - i))
        const r = share >= 1500 ? await pages[i].encode(dpi, share) : null
        if (!r) {
          fits = false
          break
        }
        used += r.bytes.length
        const pt = pages[i].pt ?? { w: (r.w / dpi) * 72, h: (r.h / dpi) * 72 }
        out.push({ bytes: r.bytes, widthPt: pt.w, heightPt: pt.h })
      }
      if (!fits) break // next, lower resolution
      const pdf = await assemblePdf(out)
      if (pdf.length > window.hi) {
        // The fixed cost was more than estimated: tighten the budget and redo this resolution.
        budget -= pdf.length - window.hi + 512
        continue
      }
      if (pdf.length >= window.lo) return { ok: true, bytes: pdf, dpi, padded: 0 }
      const padded = await padPdf(pdf, window.lo)
      if (padded.length <= window.hi) return { ok: true, bytes: padded, dpi, padded: padded.length - pdf.length }
      return { ok: true, bytes: pdf, dpi, padded: 0 }
    }
  }
  return { ok: false }
}
