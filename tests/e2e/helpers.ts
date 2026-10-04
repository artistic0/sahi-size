import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib'
import type { BrowserContext, Download, Locator, Page, Request } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { padTo, withExifOrientation } from '../../src/engine/jpeg'
import { createRaster } from '../../src/engine/raster'
import { resize } from '../../src/engine/resample'
import { encodeJpeg, encodePng, photoRaster, signatureRaster } from '../unit/helpers'

export type FilePayload = { name: string; mimeType: string; buffer: Buffer }
const jpg = (name: string, bytes: Uint8Array): FilePayload => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from(bytes) })

/** Test files, made in Node. None of them is a real person or a real document. */
export const files = {
  photo: () => jpg('IMG 2041.jpg', encodeJpeg(photoRaster(1500, 2000), 92)),
  /** 6000×4000 stored sideways with EXIF orientation 6: a phone photo held upright. */
  bigRotated: () => jpg('PXL_rotated.jpg', withExifOrientation(encodeJpeg(photoRaster(6000, 4000, 11), 80), 6)),
  tiny: () => jpg('tiny.jpg', encodeJpeg(photoRaster(120, 150), 90)),
  signature: () => jpg('signature photo.jpg', encodeJpeg(signatureRaster(1600, 900).raster, 90)),
  /** Black strokes on a fully transparent background: becomes black-on-black if flattened wrongly. */
  transparentSignature: () => {
    const r = createRaster(800, 300, [0, 0, 0, 0])
    for (let x = 150; x < 650; x++) {
      const y = Math.round(150 + Math.sin(x / 40) * 60)
      for (let k = -4; k <= 4; k++) r.data.set([10, 10, 10, 255], ((y + k) * 800 + x) * 4)
    }
    return { name: 'sign.png', mimeType: 'image/png', buffer: Buffer.from(encodePng(r)) }
  },
  pngRenamed: () => ({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(encodePng(resize(photoRaster(400, 460), 200, 230))) }),
  heic: () => ({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from([0, 0, 0, 24, ...Buffer.from('ftypheic'), 0, 0, 0, 0, ...Buffer.from('mif1heic'), 0, 0, 0, 0]) }),
  goodIbpsPhoto: () => jpg('photo.jpg', padTo(encodeJpeg(resize(photoRaster(400, 460), 200, 230), 92), 30_000)),
  textPdf: async (pages = 2, password?: string) => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    for (let p = 0; p < pages; p++) {
      const page = doc.addPage([595.28, 841.89])
      for (let i = 0; i < 40; i++) page.drawText(`Certificate page ${p + 1}, line ${i + 1}: test text, not a real document.`, { x: 50, y: 790 - i * 18, size: 11, font })
    }
    if (password) doc.encrypt({ userPassword: password, ownerPassword: `${password}-owner` })
    return { name: password ? 'e-aadhaar-test.pdf' : 'certificate.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) }
  },
  /** A "scanned" PDF: one big noisy photo per page, far over 200 KB. */
  scannedPdf: async (pages: number) => {
    const doc = await PDFDocument.create()
    for (let p = 0; p < pages; p++) {
      // A different picture per page: pdf-lib would store one shared image only once.
      const img = await doc.embedJpg(encodeJpeg(photoRaster(1000, 1414, 100 + p), 85))
      doc.addPage([595.28, 841.89]).drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 })
    }
    return { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save({ useObjectStreams: false })) }
  },
}

/** Open a page and wait until the tool island is interactive. Records CSP violations. */
export async function openPage(page: Page, path: string) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] }
    w.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  await page.goto(path)
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'))
}

export const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)

export function recordRequests(context: BrowserContext): Request[] {
  const seen: Request[] = []
  context.on('request', (r) => seen.push(r))
  return seen
}

/** The visible tab panel (exam pages) or the whole tool. */
export function panel(page: Page, presetId?: string): Locator {
  return presetId ? page.locator(`#panel-${presetId}`) : page.getByTestId('tool')
}

export async function choose(scope: Locator, file: FilePayload | FilePayload[]) {
  await scope.getByTestId('file-input').first().setInputFiles(file)
}

/** Wait for a finished result in `scope`, download it and return the bytes and name. */
export async function downloadResult(page: Page, scope: Locator): Promise<{ bytes: Buffer; name: string; download: Download }> {
  await scope.getByTestId('result-status').filter({ hasText: 'Ready' }).waitFor()
  const [download] = await Promise.all([page.waitForEvent('download'), scope.getByTestId('download').click()])
  const bytes = await readFile((await download.path())!)
  return { bytes, name: download.suggestedFilename(), download }
}

export async function checksOf(scope: Locator): Promise<Record<string, string>> {
  const items = scope.locator('[data-check]')
  const out: Record<string, string> = {}
  for (const el of await items.all()) out[(await el.getAttribute('data-check'))!] = (await el.getAttribute('data-status'))!
  return out
}
