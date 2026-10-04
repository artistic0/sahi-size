import * as Comlink from 'comlink'
import type { EngineErrorCode, OpenInfo, RenderJob, RenderResult } from '../lib/engine'
import type { Rect } from '../engine/dims'
import type { InkMode } from '../engine/ink'
import type { Raster } from '../engine/raster'
import type { ImageWorkerApi } from '../worker/image.worker'

/** The engine as the UI sees it: always async, whether it runs in a worker or on the main thread. */
export interface EngineClient {
  open(file: Blob): Promise<OpenInfo>
  render(job: RenderJob): Promise<RenderResult>
  findInk(source: number, rotate: number, mode: InkMode): Promise<Rect | null>
  encodePage(page: Raster, maxBytes: number, dpi?: number): Promise<{ bytes: Uint8Array; quality: number } | null>
  encodeSource(source: number, rotate: number, maxSide: number, gray: boolean, maxBytes: number): Promise<{ bytes: Uint8Array; quality: number; w: number; h: number } | null>
  release(source: number): Promise<void> | void
}

export type ClientErrorCode = EngineErrorCode | 'engine'

function workerCanvasSupported(): boolean {
  try {
    return typeof OffscreenCanvas !== 'undefined' && 'convertToBlob' in OffscreenCanvas.prototype && !!new OffscreenCanvas(1, 1).getContext('2d')
  } catch {
    return false
  }
}

let client: Promise<EngineClient> | null = null

function workerClient(): EngineClient {
  const worker = new Worker(new URL('../worker/image.worker.ts', import.meta.url), { type: 'module', name: 'image-engine' })
  const remote = Comlink.wrap<ImageWorkerApi>(worker)
  // A worker that fails to load (offline before it was ever cached) or crashes never answers.
  // Fail every call instead of hanging, and start a fresh worker next time.
  const failed = new Promise<never>((_, reject) => {
    worker.addEventListener(
      'error',
      () => {
        client = null
        worker.terminate()
        reject(new Error('engine'))
      },
      { once: true },
    )
  })
  failed.catch(() => {})
  const guard = <T,>(p: Promise<T>) => Promise.race([p, failed])
  return {
    open: (file) => guard(remote.open(file)),
    render: (job) => guard(remote.render(job) as Promise<RenderResult>),
    findInk: (s, r, m) => guard(remote.findInk(s, r, m)),
    encodePage: (p, max, dpi) => guard(remote.encodePage(Comlink.transfer(p, [p.data.buffer]), max, dpi)),
    encodeSource: (s, r, side, gray, max) => guard(remote.encodeSource(s, r, side, gray, max)),
    release: (s) => guard(remote.release(s)).catch(() => {}),
  }
}

export function getEngine(): Promise<EngineClient> {
  client ??= (async (): Promise<EngineClient> => {
    if (workerCanvasSupported()) return workerClient()
    // Older browsers (e.g. iOS before 16.4): same engine on the main thread.
    try {
      const { createEngine, domPlatform } = await import('../lib/engine')
      return createEngine(domPlatform)
    } catch {
      client = null
      throw new Error('engine')
    }
  })()
  return client
}

/**
 * Start the engine in the background once the page is idle: the first photo is processed sooner,
 * and the worker's file is fetched now, so the service worker can keep it for offline use.
 */
export function warmEngine(): void {
  const go = () => void getEngine().catch(() => {})
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 })
  else setTimeout(go, 1200)
}

const CODES: ClientErrorCode[] = ['heic', 'pdf', 'unsupported', 'corrupt', 'engine']

/** Errors lose their class crossing the worker boundary; the code survives as the message. */
export function errorCode(e: unknown): ClientErrorCode {
  const m = e instanceof Error ? e.message : String(e)
  return CODES.find((c) => c === m) ?? 'corrupt'
}
