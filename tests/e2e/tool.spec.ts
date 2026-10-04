import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from '@playwright/test'
import { EXAMS } from '../../src/data/exams'
import { pxOf } from '../../src/engine/dims'
import { inkFill } from '../../src/engine/ink'
import { readJpeg } from '../../src/engine/jpeg'
import { safeWindow } from '../../src/engine/kb'
import { luma } from '../../src/engine/raster'
import { sniff } from '../../src/engine/sniff'
import { decodeJpeg } from '../unit/helpers'
import { checksOf, choose, downloadResult, files, openPage, panel, violations } from './helpers'


test.describe('exam presets produce files that pass', () => {
  test('IBPS photo: exact pixels, inside the KB window, every check green', async ({ page }) => {
    await openPage(page, 'ibps-photo-signature-size/')
    const p = panel(page, 'ibps-photo')
    await choose(p, files.photo())
    const { bytes, name } = await downloadResult(page, p)
    expect(sniff(bytes)).toBe('jpeg')
    const info = readJpeg(bytes)
    expect([info.width, info.height]).toEqual([200, 230])
    const w = safeWindow({ min: 20, max: 50 })
    expect(bytes.length).toBeGreaterThanOrEqual(w.lo)
    expect(bytes.length).toBeLessThanOrEqual(w.hi)
    expect(info.exif).toBeNull()
    expect(name).toMatch(/^ibps-photo-200x230-\d+kb\.jpg$/)
    expect(Object.values(await checksOf(p)).every((s) => s === 'pass')).toBe(true)
    expect(await violations(page)).toEqual([])
  })

  test('IBPS signature from a shadowed phone photo: clean, padded to the minimum, fills the box', async ({ page }) => {
    await openPage(page, 'ibps-photo-signature-size/')
    await page.getByRole('tab', { name: 'Signature' }).click()
    const p = panel(page, 'ibps-signature')
    await choose(p, files.signature())
    const { bytes } = await downloadResult(page, p)
    const info = readJpeg(bytes)
    expect([info.width, info.height]).toEqual([140, 60])
    const w = safeWindow({ min: 10, max: 20 })
    expect(bytes.length).toBeGreaterThanOrEqual(w.lo)
    expect(bytes.length).toBeLessThanOrEqual(w.hi)
    await expect(p.getByTestId('padded-note')).toBeVisible()
    const r = decodeJpeg(bytes)
    expect(inkFill(r)).toBeGreaterThanOrEqual(0.8)
    // The shadowed left edge of the paper is white now.
    let edge = 0
    for (let y = 0; y < r.height; y++) edge += luma(r.data[y * r.width * 4], r.data[y * r.width * 4 + 1], r.data[y * r.width * 4 + 2])
    expect(edge / r.height).toBeGreaterThan(245)
  })

  test('thumb and declaration carry 200 DPI', async ({ page }) => {
    await openPage(page, 'sbi-photo-signature-size/')
    for (const [tab, id, w, h] of [
      ['Left thumb', 'sbi-thumb', 240, 240],
      ['Declaration', 'sbi-declaration', 800, 400],
    ] as const) {
      await page.getByRole('tab', { name: tab }).click()
      const p = panel(page, id)
      await choose(p, files.signature())
      const { bytes } = await downloadResult(page, p)
      const info = readJpeg(bytes)
      expect([info.width, info.height, info.dpi]).toEqual([w, h, 200])
    }
  })

  for (const e of EXAMS) {
    const images = e.presets.filter((p) => p.format === 'jpeg' && !p.live)
    if (!images.length) continue
    test(`${e.name}: every image preset fits its rules`, async ({ page }) => {
      await openPage(page, `${e.slug}/`)
      for (const preset of images) {
        await page.locator(`#tab-${preset.id}`).click()
        const p = panel(page, preset.id)
        await choose(p, preset.doc === 'photo' ? files.photo() : files.signature())
        const { bytes, name } = await downloadResult(page, p)
        const info = readJpeg(bytes)
        if (preset.px && !preset.accept) expect([info.width, info.height], preset.id).toEqual(Object.values(pxOf(preset.px)))
        if (preset.accept) {
          expect(info.width).toBeGreaterThanOrEqual(preset.accept.minW ?? 0)
          expect(info.width).toBeLessThanOrEqual(preset.accept.maxW ?? Infinity)
        }
        const w = safeWindow(preset.kb)
        expect(bytes.length, preset.id).toBeGreaterThanOrEqual(w.lo)
        expect(bytes.length, preset.id).toBeLessThanOrEqual(w.hi)
        if (preset.filename) expect(name).toBe(`${preset.filename}.jpg`)
        if (preset.dpi) expect(info.dpi).toBe(preset.dpi)
      }
      expect(await violations(page)).toEqual([])
    })
  }

  test('SSC explains the live photo instead of offering a resizer', async ({ page }) => {
    await openPage(page, 'ssc-photo-signature-size/')
    await expect(page.getByRole('tab', { name: 'Signature' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Photo' }).click()
    await expect(panel(page, 'ssc-photo')).toContainText('taken live')
  })
})

test.describe('things that go wrong off the happy path', () => {
  test('changing the target quickly never downloads a stale file', async ({ page }) => {
    await openPage(page, 'resize-image-to-50kb/')
    const tool = panel(page)
    await choose(tool, files.photo())
    await tool.getByTestId('result-status').filter({ hasText: 'Ready' }).waitFor()
    for (const [w, h] of [
      ['300', '300'],
      ['640', '480'],
      ['250', '400'],
    ]) {
      await page.getByTestId('custom-width').fill(w)
      await page.getByTestId('custom-height').fill(h)
    }
    // While it updates, there is nothing to download.
    await expect(tool.getByTestId('download')).toHaveCount(0)
    const { bytes } = await downloadResult(page, tool)
    const info = readJpeg(bytes)
    expect([info.width, info.height]).toEqual([250, 400])
  })

  test('a transparent PNG signature gets a white background, not black', async ({ page }) => {
    await openPage(page, 'ibps-photo-signature-size/')
    await page.getByRole('tab', { name: 'Signature' }).click()
    const p = panel(page, 'ibps-signature')
    await choose(p, files.transparentSignature())
    const r = decodeJpeg((await downloadResult(page, p)).bytes)
    const corner = luma(r.data[0], r.data[1], r.data[2])
    expect(corner).toBeGreaterThan(245)
    expect(inkFill(r)).toBeGreaterThan(0.6)
  })

  test('a huge sideways phone photo comes out upright', async ({ page }) => {
    test.setTimeout(150_000)
    await openPage(page, 'resize-image-to-200kb/')
    const tool = panel(page)
    await choose(tool, files.bigRotated())
    const info = readJpeg((await downloadResult(page, tool)).bytes)
    expect(info.height).toBeGreaterThan(info.width) // 6000×4000 stored sideways, upright 4000×6000
    expect(Math.max(info.width, info.height)).toBeLessThanOrEqual(2400)
  })

  test('a tiny photo still works, with a warning that it will look soft', async ({ page }) => {
    await openPage(page, 'ibps-photo-signature-size/')
    const p = panel(page, 'ibps-photo')
    await choose(p, files.tiny())
    await expect(p.getByText('smaller than the required size')).toBeVisible()
    const info = readJpeg((await downloadResult(page, p)).bytes)
    expect([info.width, info.height]).toEqual([200, 230])
  })

  test('a PNG renamed to .jpg becomes a real JPG', async ({ page }) => {
    await openPage(page, 'ibps-photo-signature-size/')
    const p = panel(page, 'ibps-photo')
    await choose(p, files.pngRenamed())
    expect(sniff((await downloadResult(page, p)).bytes)).toBe('jpeg')
  })

  test('an iPhone HEIC photo gets clear instructions', async ({ page }) => {
    await openPage(page, 'ibps-photo-signature-size/')
    const p = panel(page, 'ibps-photo')
    await choose(p, files.heic())
    await expect(p.getByTestId('open-error')).toContainText('Most Compatible')
  })

  test('an impossible target says so and offers no broken file', async ({ page }) => {
    await openPage(page, 'resize-image-to-10kb/')
    const tool = panel(page)
    await page.getByTestId('custom-maxKb').fill('1')
    await page.getByTestId('custom-width').fill('2000')
    await page.getByTestId('custom-height').fill('2000')
    await choose(tool, files.photo())
    await expect(tool.getByTestId('result-status')).toContainText('Can’t get under the limit')
    await expect(tool.getByTestId('download')).toHaveCount(0)
  })

  test('the crop works with the keyboard alone', async ({ page }) => {
    await openPage(page, 'ibps-photo-signature-size/')
    const p = panel(page, 'ibps-photo')
    await choose(p, files.photo())
    const first = (await downloadResult(page, p)).bytes
    await p.getByTestId('crop-canvas').focus()
    await page.keyboard.press('+')
    await page.keyboard.press('+')
    await page.keyboard.press('ArrowLeft')
    await expect(p.getByTestId('result-status')).toContainText('Updating')
    const second = (await downloadResult(page, p)).bytes
    expect(Buffer.compare(first, second)).not.toBe(0)
  })
})

test.describe('PDF', () => {
  test('password-protected PDF: wrong password, then right, then an unlocked PDF under the limit', async ({ page }) => {
    await openPage(page, 'compress-pdf-to-200kb/')
    const tool = panel(page)
    await choose(tool, await files.textPdf(2, 'RAHU1990'))
    await expect(tool.getByText('password-protected')).toBeVisible()
    await tool.getByLabel('PDF password').fill('WRONG123')
    await tool.getByRole('button', { name: 'Unlock' }).click()
    await expect(tool.getByText('Wrong password')).toBeVisible()
    await tool.getByLabel('PDF password').fill('RAHU1990')
    await tool.getByRole('button', { name: 'Unlock' }).click()
    await expect(tool.getByTestId('pdf-pages').locator('li')).toHaveCount(2)
    await tool.getByTestId('make-pdf').click()
    await tool.getByTestId('pdf-status').filter({ hasText: 'Ready' }).waitFor()
    const [download] = await Promise.all([page.waitForEvent('download'), tool.getByTestId('download').click()])
    const bytes = new Uint8Array(await (await import('node:fs/promises')).readFile((await download.path())!))
    expect(Buffer.from(bytes).includes('/Encrypt')).toBe(false)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
    expect(bytes.length).toBeLessThanOrEqual(safeWindow({ max: 200 }).hi)
  })

  test('a 20-page scan goes under 200 KB', async ({ page }) => {
    test.setTimeout(180_000)
    await openPage(page, 'compress-pdf-to-200kb/')
    const tool = panel(page)
    const scan = await files.scannedPdf(20)
    expect(scan.buffer.length).toBeGreaterThan(1_000_000)
    await choose(tool, scan)
    await expect(tool.getByTestId('pdf-pages').locator('li')).toHaveCount(20, { timeout: 60_000 })
    await tool.getByTestId('make-pdf').click()
    await tool.getByTestId('pdf-status').filter({ hasText: 'Ready' }).waitFor({ timeout: 150_000 })
    const [download] = await Promise.all([page.waitForEvent('download'), tool.getByTestId('download').click()])
    const bytes = new Uint8Array(await (await import('node:fs/promises')).readFile((await download.path())!))
    expect(bytes.length).toBeLessThanOrEqual(safeWindow({ max: 200 }).hi)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(20)
  })

  test('a PDF that already fits is left as it is', async ({ page }) => {
    await openPage(page, 'compress-pdf-to-500kb/')
    const tool = panel(page)
    await choose(tool, await files.textPdf(1))
    await tool.getByTestId('make-pdf').click()
    await expect(tool.getByText('already fits')).toBeVisible()
  })
})

test.describe('checker', () => {
  test('passes a good file and explains a bad one, with a link to fix it', async ({ page }) => {
    await openPage(page, 'check-photo-size/')
    const tool = panel(page)
    await choose(tool, files.goodIbpsPhoto())
    await expect(tool.getByTestId('checker-result')).toContainText('Looks good')
    await choose(tool, files.pngRenamed())
    const result = tool.getByTestId('checker-result')
    await expect(result).toContainText('really a PNG')
    await result.getByRole('link', { name: /Fix it now/ }).click()
    await expect(page).toHaveURL(/ibps-photo-signature-size\/#ibps-photo$/)
  })
})
