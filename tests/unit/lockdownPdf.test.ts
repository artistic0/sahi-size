import { beforeAll, expect, it, vi } from 'vitest'

const realFetch = vi.fn(async () => new Response('ok'))

// The pdf.js worker may GET its own decoder files (under <base>pdfjs/) and nothing else.
// In Vitest the base is "/", so the allowed prefix is "/pdfjs/".
beforeAll(async () => {
  Object.assign(globalThis, { self: globalThis, fetch: realFetch })
  Object.defineProperty(globalThis, 'location', { value: new URL('https://site.example/worker.js'), configurable: true })
  await import('../../src/worker/lockdownPdf')
})

it('lets through plain GETs of its own decoder files', async () => {
  const before = realFetch.mock.calls.length
  await expect(fetch('/pdfjs/wasm/openjpeg.wasm')).resolves.toBeInstanceOf(Response)
  expect(realFetch.mock.calls.length).toBe(before + 1)
})

it('blocks everything else', async () => {
  const before = realFetch.mock.calls.length
  await expect(fetch('https://evil.example/pdfjs/x')).rejects.toThrow(/disabled/)
  await expect(fetch('/pdfjs/x', { method: 'POST', body: 'data' })).rejects.toThrow(/disabled/)
  await expect(fetch('/collect')).rejects.toThrow(/disabled/)
  await expect(fetch('/pdfjs/x?leak=secret')).rejects.toThrow(/disabled/)
  expect(realFetch.mock.calls.length).toBe(before)
})
