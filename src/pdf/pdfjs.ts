import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { limitSide } from '../engine/dims'
import type { Raster } from '../engine/raster'
import { asset } from '../lib/paths'

/**
 * pdf.js, loaded only when a PDF is used. Its worker removes every network API first and may
 * only fetch its own decoder files from this site (src/worker/lockdownPdf.ts).
 */
let workerReady = false
function ensureWorker() {
  if (workerReady) return
  pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('../worker/pdf.worker.ts', import.meta.url), { type: 'module', name: 'pdf' })
  workerReady = true
}

/** Start the pdf.js worker once the page is idle, so its file is fetched (and kept for offline use). */
export function warmPdf(): void {
  const go = () => ensureWorker()
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 })
  else setTimeout(go, 1500)
}

export class PdfPasswordError extends Error {
  constructor(public incorrect: boolean) {
    super('password')
  }
}

export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  ensureWorker()
  const task = pdfjs.getDocument({
    data: bytes.slice(), // pdf.js takes ownership of the buffer it is given
    password,
    enableXfa: false,
    disableFontFace: true, // glyphs drawn as shapes: no font loading, works under the CSP
    useSystemFonts: false,
    useWorkerFetch: true,
    cMapUrl: asset('pdfjs/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: asset('pdfjs/standard_fonts/'),
    wasmUrl: asset('pdfjs/wasm/'),
    iccUrl: asset('pdfjs/iccs/'),
    stopAtErrors: false,
    verbosity: 0,
  })
  try {
    return await task.promise
  } catch (e) {
    await task.destroy().catch(() => {})
    const err = e as { name?: string; code?: number }
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2)
    throw e
  }
}

/** Page size in PDF points, after the page's own rotation. */
export async function pageSize(doc: PDFDocumentProxy, index: number): Promise<{ w: number; h: number }> {
  const page = await doc.getPage(index + 1)
  const v = page.getViewport({ scale: 1 })
  return { w: v.width, h: v.height }
}

/** Draw a page on white at `dpi` (long side capped), plus extra quarter turns. */
export async function renderPage(doc: PDFDocumentProxy, index: number, dpi: number, turns = 0, maxSide = 2400): Promise<Raster> {
  const page = await doc.getPage(index + 1)
  const base = page.getViewport({ scale: 1, rotation: (page.rotate + turns * 90) % 360 })
  const want = { w: (base.width / 72) * dpi, h: (base.height / 72) * dpi }
  const size = limitSide(Math.round(want.w), Math.round(want.h), maxSide)
  const viewport = page.getViewport({ scale: size.w / base.width, rotation: (page.rotate + turns * 90) % 360 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  canvas.width = 0 // free the canvas memory now, not at garbage collection
  return { width: img.width, height: img.height, data: img.data }
}

/** A small picture of the page for the page list. */
export async function thumbnail(doc: PDFDocumentProxy, index: number): Promise<ImageBitmap> {
  const r = await renderPage(doc, index, 24, 0, 220)
  return createImageBitmap(new ImageData(r.data as ImageDataArray, r.width, r.height))
}
