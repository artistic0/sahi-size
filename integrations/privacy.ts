import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

/**
 * Build-time privacy plumbing (adapted from KharchaLens tools/vite-privacy.ts): writes a tiny
 * service worker so the site keeps working with no connection after the first visit.
 *
 * Unlike KharchaLens there is no precache list. Pages lazy-load the PDF engine, so the page tells
 * the worker which files it has already used ("cache-urls" message, see src/lib/offline.ts), and
 * everything fetched later (like the PDF engine) is cached as it loads.
 *  - page navigations: network first, so exam rules stay fresh; the cache is the offline fallback
 *  - hashed assets and pdf.js decoder files: cache first
 * The worker never touches other origins and never handles anything but GET.
 */
export function privacy(): AstroIntegration {
  let base = '/'
  return {
    name: 'sahisize-privacy',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = config.base.endsWith('/') ? config.base : `${config.base}/`
      },
      'astro:build:done': async ({ dir }) => {
        const root = fileURLToPath(dir)
        const files = (await listFiles(root)).filter((f) => !f.endsWith('sw.js')).sort()
        const hash = createHash('sha256')
        for (const f of files) {
          hash.update(relative(root, f))
          hash.update(await readFile(f))
        }
        const version = hash.digest('hex').slice(0, 12)
        await writeFile(join(root, 'sw.js'), serviceWorker(version, base))
      },
    },
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(p)))
    else out.push(p)
  }
  return out
}

export function serviceWorker(version: string, base: string): string {
  return `// Generated at build by integrations/privacy.ts. Same-origin GETs only.
const CACHE = 'sahisize-${version}'
const BASE = ${JSON.stringify(base)}
const ORIGIN = self.location.origin
const inScope = (url) => url.origin === ORIGIN && url.pathname.startsWith(BASE)
const cacheable = (url) => url.pathname.startsWith(BASE + '_astro/') || url.pathname.startsWith(BASE + 'pdfjs/')

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sahisize-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// The page lists the files it has already loaded (before this worker controlled it).
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'cache-urls' || !Array.isArray(e.data.urls)) return
  const urls = e.data.urls
    .map((u) => { try { return new URL(u) } catch { return null } })
    .filter((u) => u && inScope(u))
    .map((u) => { u.hash = ''; return u.href })
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => undefined))))
      .then(() => e.source && e.source.postMessage({ type: 'cached', count: urls.length })),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (!inScope(url)) return
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
          return res
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match(BASE))),
    )
    return
  }
  e.respondWith(
    // ignoreVary: module scripts carry an Origin header the cached requests didn't.
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && cacheable(url)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    })),
  )
})
`
}
