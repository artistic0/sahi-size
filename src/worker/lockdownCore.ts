/// <reference lib="webworker" />
/**
 * Remove every network API from a worker before any library code runs.
 *
 * A worker takes its Content-Security-Policy from its own HTTP response, not from the page. GitHub
 * Pages can't send headers, so the page's <meta> CSP doesn't reach our workers. This makes them
 * unable to send anything anyway. Adapted from KharchaLens.
 *
 * `allowGet` can let through plain same-origin GETs for the worker's own static files (pdf.js loads
 * its wasm decoders, cmaps and fonts that way). Nothing with a body, and nothing cross-origin.
 */
const MESSAGE = 'Network access is disabled in SahiSize.'

// A plain function (not an arrow) so `new WebSocket(...)` reaches the throw with this message.
function denied(): never {
  throw new TypeError(MESSAGE)
}

export function applyLockdown(allowGet?: (url: URL) => boolean) {
  const scope = self as unknown as Record<string, unknown>
  const original = scope.fetch as typeof globalThis.fetch | undefined
  const guardedFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const req = input instanceof Request ? input : null
      const url = new URL(req ? req.url : String(input), self.location.href)
      const method = (init?.method ?? req?.method ?? 'GET').toUpperCase()
      const hasBody = init?.body != null || (req != null && req.body != null)
      if (allowGet && original && method === 'GET' && !hasBody && url.origin === self.location.origin && allowGet(url)) {
        return original.call(self, url.href, { credentials: 'same-origin', mode: 'same-origin' })
      }
    } catch {
      // Unparseable input: deny below.
    }
    return Promise.reject(new TypeError(MESSAGE))
  }

  for (const [name, value] of [
    ['fetch', guardedFetch],
    ['XMLHttpRequest', denied],
    ['WebSocket', denied],
    ['EventSource', denied],
    ['WebTransport', denied],
    ['importScripts', denied],
  ] as const) {
    // Replace it on the global and anywhere up its prototype chain it is defined.
    for (let o: object | null = scope; o; o = Object.getPrototypeOf(o)) {
      if (o !== scope && !Object.prototype.hasOwnProperty.call(o, name)) continue
      try {
        Object.defineProperty(o, name, { value, writable: false, configurable: false })
      } catch {
        // Already locked or not redefinable here: the next level covers it.
      }
    }
  }
}
