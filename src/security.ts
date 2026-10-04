/**
 * The privacy promise, as a Content-Security-Policy. One source of truth for:
 *  - astro.config.ts, where Astro writes it into a <meta> tag on every page together with
 *    `script-src`/`style-src` ('self' plus hashes for Astro's own inline island bootstrap)
 *  - the Privacy page, which shows this exact text
 *
 * GitHub Pages can't send headers, so this <meta> policy is the page's protection. Workers don't
 * inherit it; they lock themselves down instead (src/worker/lockdown.ts).
 */
export const CSP_DIRECTIVES: string[] = [
  "default-src 'none'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  // Blocks every fetch, XHR, WebSocket and beacon, including requests to our own server.
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
]

/** The directives Astro adds itself. Shown on the Privacy page next to CSP_DIRECTIVES. */
export const CSP_ASTRO_DIRECTIVES = ["script-src 'self' (+ hashes of Astro's inline loader)", "style-src 'self' (+ hashes)"]
