import { expect, test } from '@playwright/test'
import { readJpeg } from '../../src/engine/jpeg'
import { choose, downloadResult, files, openPage, panel } from './helpers'

test.describe('on a phone', () => {
  test('the exam page fits the screen and the photo flow works', async ({ page }) => {
    await openPage(page, 'ibps-photo-signature-size/')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const p = panel(page, 'ibps-photo')
    // Buttons are big enough to tap.
    const box = await p.getByRole('button', { name: 'Choose file' }).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    await choose(p, files.photo())
    const info = readJpeg((await downloadResult(page, p)).bytes)
    expect([info.width, info.height]).toEqual([200, 230])
    const after = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(after).toBeLessThanOrEqual(0)
  })

  test('the menu opens and links work', async ({ page }) => {
    await openPage(page, '')
    await page.getByLabel('Menu').click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Compress PDF' }).click()
    await expect(page.locator('h1')).toContainText('Compress a PDF')
  })
})
