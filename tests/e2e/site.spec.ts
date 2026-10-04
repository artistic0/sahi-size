import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { choose, downloadResult, files, openPage, panel, recordRequests, violations } from './helpers'

/** Every page in the built sitemap, as paths under the base. */
async function sitemapPaths(): Promise<string[]> {
  const xml = await readFile('dist/sitemap-0.xml', 'utf8')
  return [...xml.matchAll(/<loc>https:\/\/artistic0\.github\.io\/sahi-size\/([^<]*)<\/loc>/g)].map((m) => m[1])
}

test.describe('the privacy promise', () => {
  test('a PDF compressed offline, after one visit online', async ({ page, context }) => {
    test.setTimeout(150_000)
    await openPage(page, 'compress-pdf-to-200kb/')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await page.waitForTimeout(5000) // the PDF engine warms up in the background and is cached
    const requests = recordRequests(context)
    await context.setOffline(true)
    await page.reload()
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'))
    const tool = panel(page)
    await choose(tool, await files.scannedPdf(3))
    await expect(tool.getByTestId('pdf-pages').locator('li')).toHaveCount(3)
    await tool.getByTestId('make-pdf').click()
    await expect(tool.getByTestId('pdf-status')).toContainText('Ready', { timeout: 60_000 })
    for (const r of requests) {
      expect(r.method(), r.url()).toBe('GET')
      expect(new URL(r.url()).origin, r.url()).toBe('http://localhost:4339')
    }
    expect(await violations(page)).toEqual([])
  })

  test('photo and signature made offline with no data leaving the page', async ({ page, context }) => {
    test.setTimeout(150_000)
    await openPage(page, 'ibps-photo-signature-size/')
    // Let the service worker take control and cache this page's files.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await page.waitForTimeout(2500)
    const requests = recordRequests(context)
    await context.setOffline(true)
    await page.reload()
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'))

    const photo = panel(page, 'ibps-photo')
    await choose(photo, files.photo())
    await downloadResult(page, photo)
    await page.getByRole('tab', { name: 'Signature' }).click()
    const sig = panel(page, 'ibps-signature')
    await choose(sig, files.signature())
    await downloadResult(page, sig)

    // Every request made: plain GETs of this site's own files, none carrying a body.
    for (const r of requests) {
      expect(r.method(), r.url()).toBe('GET')
      expect(r.postDataBuffer(), r.url()).toBeNull()
      expect(new URL(r.url()).origin, r.url()).toBe('http://localhost:4339')
    }
    expect(await violations(page)).toEqual([])
  })

  test('the page cannot send data anywhere, even to its own server', async ({ page }) => {
    await openPage(page, 'privacy/')
    const results = await page.evaluate(async () => {
      const attempt = async (fn: () => Promise<unknown>) => {
        try {
          await fn()
          return 'sent'
        } catch {
          return 'blocked'
        }
      }
      return {
        external: await attempt(() => fetch('https://example.com/collect', { method: 'POST', body: 'secret' })),
        sameOrigin: await attempt(() => fetch('/collect', { method: 'POST', body: 'secret' })),
        beacon: navigator.sendBeacon('/collect', 'secret') ? 'queued' : 'blocked',
      }
    })
    expect(results.external).toBe('blocked')
    expect(results.sameOrigin).toBe('blocked')
    expect((await violations(page)).some((v) => v.startsWith('connect-src'))).toBe(true)
    // The demo button on the page says the same.
    await page.getByRole('button', { name: 'Try to send data from this page' }).click()
    await expect(page.getByText('Blocked by your browser')).toBeVisible()
  })

  test('every worker locks itself down before anything else runs', async () => {
    // The lockdown's behaviour is unit-tested (tests/unit/lockdown*.test.ts); here: it is the first import.
    for (const f of ['src/worker/image.worker.ts', 'src/worker/pdf.worker.ts']) {
      const first = (await readFile(f, 'utf8')).split('\n').find((l) => l.startsWith('import'))
      expect(first, f).toMatch(/'\.\/lockdown(Pdf)?'/)
    }
  })
})

test.describe('every page', () => {
  test('has a unique title and description, a correct canonical, one h1, valid JSON-LD and no CSP violations', async ({ page }) => {
    test.setTimeout(180_000)
    const paths = await sitemapPaths()
    expect(paths.length).toBeGreaterThan(25)
    const titles = new Set<string>()
    const descriptions = new Set<string>()
    for (const p of paths) {
      await openPage(page, p)
      const title = await page.title()
      expect(titles.has(title), `duplicate title on ${p}`).toBe(false)
      titles.add(title)
      const description = await page.locator('meta[name="description"]').getAttribute('content')
      expect(description && description.length > 50, p).toBe(true)
      expect(descriptions.has(description!), `duplicate description on ${p}`).toBe(false)
      descriptions.add(description!)
      expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`https://artistic0.github.io/sahi-size/${p}`)
      await expect(page.locator('h1')).toHaveCount(1)
      for (const json of await page.locator('script[type="application/ld+json"]').allTextContents()) expect(() => JSON.parse(json)).not.toThrow()
      expect(await violations(page), p).toEqual([])
    }
  })

  test('has no broken internal links, and no page is an orphan', async ({ page, request }) => {
    test.setTimeout(180_000)
    const paths = await sitemapPaths()
    const seen = new Set<string>()
    const linkedTo = new Set<string>()
    for (const p of paths) {
      await page.goto(p)
      for (const href of await page.locator('a[href^="/sahi-size/"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).pathname))) {
        if (href !== `/sahi-size/${p}`) linkedTo.add(href)
        if (seen.has(href)) continue
        seen.add(href)
        const res = await request.get(`http://localhost:4339${href}`)
        expect(res.status(), `${href} linked from ${p}`).toBe(200)
      }
    }
    // Search engines find pages through links: every page in the sitemap is linked from another page.
    expect(paths.filter((p) => !linkedTo.has(`/sahi-size/${p}`))).toEqual([])
  })

  test('passes axe accessibility checks (no serious or critical issues)', async ({ page }) => {
    test.setTimeout(180_000)
    const pages = ['', 'ibps-photo-signature-size/', 'resize-image-to-50kb/', 'compress-pdf-to-200kb/', 'check-photo-size/', 'privacy/', 'how-it-works/']
    for (const p of pages) {
      await openPage(page, p)
      const { violations: v } = await new AxeBuilder({ page }).analyze()
      const bad = v.filter((x) => x.impact === 'serious' || x.impact === 'critical')
      expect(bad.map((x) => `${p}: ${x.id} (${x.nodes.length})`)).toEqual([])
    }
    // The working tool too: crop, controls and result.
    await openPage(page, 'ibps-photo-signature-size/')
    await choose(panel(page, 'ibps-photo'), files.photo())
    await downloadResult(page, panel(page, 'ibps-photo'))
    const { violations: v } = await new AxeBuilder({ page }).analyze()
    expect(v.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => x.id)).toEqual([])
  })

  test('unknown pages get the 404 page', async ({ page }) => {
    const res = await page.goto('no-such-page/')
    expect(res?.status()).toBe(404)
    await expect(page.locator('h1')).toHaveText('Page not found')
  })

  test('dark mode renders', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await openPage(page, 'ibps-photo-signature-size/')
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(12, 19, 17)')
  })
})
