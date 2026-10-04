import { BASE } from './paths'

/**
 * Registers the service worker (built by integrations/privacy.ts) and hands it the list of files
 * this page has already loaded, so the page opens again with no connection. Production only.
 */
export function startOffline(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const go = () => {
    navigator.serviceWorker
      .register(`${BASE}sw.js`, { scope: BASE })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Islands and their chunks finish loading shortly after `load`.
        setTimeout(() => {
          const urls = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map((e) => e.name)]
          reg.active?.postMessage({ type: 'cache-urls', urls })
        }, 1500)
      })
      .catch(() => {
        // No offline support (private mode, old browser): the site still works online.
      })
  }
  if (document.readyState === 'complete') go()
  else window.addEventListener('load', go, { once: true })
}
