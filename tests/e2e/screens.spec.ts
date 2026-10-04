import { test } from '@playwright/test'
import { choose, downloadResult, files, openPage, panel } from './helpers'

// Not a check: saves screenshots of the main states (phone, dark, desktop) for a human to look at.
// npm run screens  →  test-results/screens/
const out = process.env.SCREENS_DIR ?? 'test-results/screens'
test.skip(!process.env.SCREENS && process.env.npm_lifecycle_event !== 'screens', 'run with: npm run screens')

for (const [name, viewport, scheme] of [
  ['phone', { width: 360, height: 780 }, 'light'],
  ['phone-dark', { width: 360, height: 780 }, 'dark'],
  ['desktop', { width: 1280, height: 900 }, 'light'],
] as const) {
  test(`screens ${name}`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme: scheme })
    await openPage(page, '')
    await page.screenshot({ path: `${out}/${name}-home.png`, fullPage: true })
    await openPage(page, 'ibps-photo-signature-size/')
    await page.screenshot({ path: `${out}/${name}-exam.png`, fullPage: true })
    const p = panel(page, 'ibps-photo')
    await choose(p, files.photo())
    await downloadResult(page, p)
    await page.screenshot({ path: `${out}/${name}-photo-result.png`, fullPage: true })
    await page.getByRole('tab', { name: 'Signature' }).click()
    const s = panel(page, 'ibps-signature')
    await choose(s, files.signature())
    await downloadResult(page, s)
    await page.screenshot({ path: `${out}/${name}-signature-result.png`, fullPage: true })
    await openPage(page, 'compress-pdf-to-200kb/')
    await choose(panel(page), await files.scannedPdf(3))
    await panel(page).getByTestId('make-pdf').click()
    await panel(page).getByTestId('pdf-status').filter({ hasText: 'Ready' }).waitFor()
    await page.screenshot({ path: `${out}/${name}-pdf.png`, fullPage: true })
    await openPage(page, 'check-photo-size/')
    await choose(panel(page), files.pngRenamed())
    await page.screenshot({ path: `${out}/${name}-checker.png`, fullPage: true })
  })
}
