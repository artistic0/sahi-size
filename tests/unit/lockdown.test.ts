import { beforeAll, expect, it } from 'vitest'

// Workers run the lockdown with `self` as the global; emulate that here (each test file gets fresh globals).
beforeAll(async () => {
  Object.assign(globalThis, { self: globalThis })
  Object.defineProperty(globalThis, 'location', { value: new URL('https://artistic0.github.io/sahi-size/worker.js'), configurable: true })
  await import('../../src/worker/lockdown')
})

it('fetch is gone: every call rejects, even to its own origin', async () => {
  await expect(fetch('https://example.com')).rejects.toThrow(/disabled/)
  await expect(fetch('/sahi-size/pdfjs/wasm/openjpeg.wasm')).rejects.toThrow(/disabled/)
})

it('WebSocket and other constructors throw', () => {
  expect(() => new (globalThis as unknown as { WebSocket: new (u: string) => unknown }).WebSocket('wss://example.com')).toThrow(/disabled/)
})

it('cannot be put back', () => {
  expect(() => {
    ;(globalThis as unknown as { fetch: unknown }).fetch = () => Promise.resolve()
  }).toThrow()
  expect(() => Object.defineProperty(globalThis, 'fetch', { value: () => Promise.resolve() })).toThrow()
})
