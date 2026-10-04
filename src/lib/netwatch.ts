/**
 * Every file the page loaded after it finished opening (adapted from KharchaLens networkWatch.ts).
 * Shown as live proof that nothing carrying your data left the page: the list only ever holds this
 * site's own code, like the PDF engine when you first use it. The CSP would block anything else.
 */
export interface Loaded {
  url: string
  type: string
}

let start = 0
const seen: Loaded[] = []
const listeners = new Set<() => void>()

export function startNetWatch(): void {
  if (start || typeof PerformanceObserver === 'undefined') return
  start = performance.now()
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceResourceTiming[]) seen.push({ url: e.name, type: e.initiatorType })
      listeners.forEach((l) => l())
    }).observe({ type: 'resource', buffered: false })
  } catch {
    // Unsupported: the CSP still blocks requests; we just can't list them.
  }
}

export function loadedSinceStart(): readonly Loaded[] {
  return seen
}

export function onLoaded(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
