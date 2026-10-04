import { expect, test } from '@playwright/test'
import { readJpeg } from '../../src/engine/jpeg'
import { safeWindow } from '../../src/engine/kb'
import { choose, downloadResult, files, openPage, panel } from './helpers'

// Runs in Chromium, Firefox and WebKit: each has its own JPEG encoder and canvas, so the sizes it
// produces differ. The promise (exact pixels, inside the KB window) must hold in all of them.
test('photo, signature and a ranged preset hit their windows in this browser', async ({ page }) => {
  test.setTimeout(120_000)
  await openPage(page, 'ibps-photo-signature-size/')
  const photo = panel(page, 'ibps-photo')
  await choose(photo, files.photo())
  let { bytes } = await downloadResult(page, photo)
  let info = readJpeg(bytes)
  expect([info.width, info.height]).toEqual([200, 230])
  let w = safeWindow({ min: 20, max: 50 })
  expect(bytes.length).toBeGreaterThanOrEqual(w.lo)
  expect(bytes.length).toBeLessThanOrEqual(w.hi)

  await page.getByRole('tab', { name: 'Signature' }).click()
  const sig = panel(page, 'ibps-signature')
  await choose(sig, files.signature())
  ;({ bytes } = await downloadResult(page, sig))
  info = readJpeg(bytes)
  expect([info.width, info.height]).toEqual([140, 60])
  w = safeWindow({ min: 10, max: 20 })
  expect(bytes.length).toBeGreaterThanOrEqual(w.lo)
  expect(bytes.length).toBeLessThanOrEqual(w.hi)

  await openPage(page, 'upsc-photo-signature-size/')
  const up = panel(page, 'upsc-photo')
  await choose(up, files.photo())
  ;({ bytes } = await downloadResult(page, up))
  w = safeWindow({ min: 20, max: 200 })
  expect(bytes.length).toBeGreaterThanOrEqual(w.lo)
  expect(bytes.length).toBeLessThanOrEqual(w.hi)
})
