import { containSize, limitSide, type Rect, type Size } from '../engine/dims'
import { adjust, applyExifOrientation, autoLevels, cropRaster, flattenOnWhite, grayscale, placeOnWhite, rotate90 } from '../engine/enhance'
import { Cancelled, fitToWindow } from '../engine/fit'
import { cleanInk, inkFill, type InkOptions } from '../engine/ink'
import { readJpeg, setJfifDpi, stripMetadata, withExifOrientation } from '../engine/jpeg'
import { safeWindow, type KbRule } from '../engine/kb'
import { readPng } from '../engine/png'
import { cloneRaster, createRaster, type Raster } from '../engine/raster'
import { resize } from '../engine/resample'
import { sniff, type FileKind } from '../engine/sniff'

/**
 * The image engine: decode → rotate → crop → photo fixes or ink cleanup → resize → encode → hit
 * the KB window. The same code runs in a worker (OffscreenCanvas) or, on old browsers without it,
 * on the main thread (a plain <canvas>). Only decoding and JPEG encoding need a canvas; every
 * pixel operation is in src/engine and unit-tested.
 */
export interface Platform {
  canvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement
  toBlob(c: OffscreenCanvas | HTMLCanvasElement, type: string, quality: number): Promise<Blob>
}

export const offscreenPlatform: Platform = {
  canvas: (w, h) => new OffscreenCanvas(w, h),
  toBlob: (c, type, quality) => (c as OffscreenCanvas).convertToBlob({ type, quality }),
}

export const domPlatform: Platform = {
  canvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }),
  toBlob: (c, type, quality) =>
    new Promise((resolve, reject) => (c as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), type, quality)),
}

/** Long side kept in memory: plenty for any portal size, and safe for phones with little memory. */
export const MAX_SIDE = 2400
const PREVIEW_SIDE = 1280

export type EngineErrorCode = 'heic' | 'pdf' | 'unsupported' | 'corrupt'

export class EngineError extends Error {
  constructor(public code: EngineErrorCode) {
    super(code)
  }
}

export interface OpenInfo {
  id: number
  kind: FileKind
  /** Size of the original, upright. */
  width: number
  height: number
  /** Size kept in memory (≤ MAX_SIDE). */
  workWidth: number
  workHeight: number
  preview: ImageBitmap
}

export type RenderMode = 'photo' | 'ink' | 'document' | 'plain'

export interface OutSpec {
  /** Exact output size; null keeps the crop's own size (limited by maxSide). */
  size: Size | null
  maxSide?: number
  /** How the picture goes into `size`: crop to fill (the crop already has the right shape), fit inside with white margins, or stretch. */
  fit: 'cover' | 'contain' | 'stretch'
  /** Smaller sizes the portal also accepts, tried if the file can't get under the limit. */
  smaller?: Size[]
  kb: KbRule | null
  dpi?: number
  allowPad?: boolean
}

export interface RenderJob {
  source: number
  job: number
  /** Extra clockwise quarter turns chosen by the user. */
  rotate: number
  /** Normalized to the rotated image; may reach outside 0–1 (filled with white). */
  crop: Rect | null
  mode: RenderMode
  ink?: InkOptions
  auto?: boolean
  brightness?: number
  contrast?: number
  grayscale?: boolean
  nameDate?: { name: string; date: string } | null
  out: OutSpec
}

export type RenderResult =
  | { job: number; ok: true; bytes: Uint8Array; w: number; h: number; quality: number; padded: number; fill: number | null; encodes: number; ms: number }
  | { job: number; ok: false; reason: 'too-big' | 'too-small' | 'cancelled' | 'empty'; bytes?: number; size?: Size }

interface Source {
  master: Raster
  turns: Map<number, Raster>
}

let exifApplied: Promise<boolean> | null = null

export function createEngine(platform: Platform) {
  const sources = new Map<number, Source>()
  let nextId = 1
  let latestJob = 0

  const rasterOf = (bitmap: ImageBitmap | OffscreenCanvas | HTMLCanvasElement, w: number, h: number): Raster => {
    const c = platform.canvas(w, h)
    const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h)
    const img = ctx.getImageData(0, 0, w, h)
    return { width: w, height: h, data: img.data }
  }

  const canvasOf = (r: Raster) => {
    const c = platform.canvas(r.width, r.height)
    const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
    ctx.putImageData(new ImageData(r.data as ImageDataArray, r.width, r.height), 0, 0)
    return c
  }

  const bitmapOf = async (r: Raster): Promise<ImageBitmap> => createImageBitmap(canvasOf(r) as ImageBitmapSource)

  const encodeJpeg = async (r: Raster, quality: number, dpi?: number): Promise<Uint8Array> => {
    const blob = await platform.toBlob(canvasOf(r), 'image/jpeg', quality / 100)
    let bytes = stripMetadata(new Uint8Array(await blob.arrayBuffer()))
    if (dpi) bytes = setJfifDpi(bytes, dpi)
    return bytes
  }

  /** Does this browser rotate photos by their EXIF orientation when decoding? Checked once. */
  const browserAppliesExif = () => {
    exifApplied ??= (async () => {
      try {
        const probe = withExifOrientation(await encodeJpeg(createRaster(2, 1), 90), 6)
        const bmp = await createImageBitmap(new Blob([probe as BlobPart], { type: 'image/jpeg' }), { imageOrientation: 'from-image' })
        const applied = bmp.width === 1 && bmp.height === 2
        bmp.close()
        return applied
      } catch {
        return true
      }
    })()
    return exifApplied
  }

  async function open(file: Blob): Promise<OpenInfo> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = sniff(bytes)
    if (kind === 'pdf') throw new EngineError('pdf')

    // Size and orientation from the header, so a 48 MP photo is decoded straight to a small size.
    let w = 0
    let h = 0
    let orientation = 1
    try {
      if (kind === 'jpeg') {
        const info = readJpeg(bytes)
        w = info.width
        h = info.height
        orientation = info.exif?.orientation ?? 1
      } else if (kind === 'png') {
        const info = readPng(bytes)
        w = info.width
        h = info.height
      }
    } catch {
      throw new EngineError('corrupt')
    }
    const swap = orientation >= 5 && orientation <= 8
    const uprightW = swap ? h : w
    const uprightH = swap ? w : h

    const opts: ImageBitmapOptions = { imageOrientation: 'from-image' }
    if (uprightW && Math.max(uprightW, uprightH) > MAX_SIDE) {
      opts.resizeWidth = limitSide(uprightW, uprightH, MAX_SIDE).w
      opts.resizeQuality = 'high'
    }
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), opts)
    } catch {
      if (kind === 'heic') throw new EngineError('heic')
      if (kind === 'unknown' || kind === 'tiff') throw new EngineError('unsupported')
      throw new EngineError('corrupt')
    }
    // Some browsers ignore resize options; never keep more than MAX_SIDE.
    const keep = limitSide(bitmap.width, bitmap.height, MAX_SIDE)
    let master = rasterOf(bitmap, keep.w, keep.h)
    bitmap.close()
    if (kind === 'jpeg' && orientation > 1 && !(await browserAppliesExif())) master = applyExifOrientation(master, orientation)
    flattenOnWhite(master)

    const id = nextId++
    sources.set(id, { master, turns: new Map([[0, master]]) })
    const p = limitSide(master.width, master.height, PREVIEW_SIDE)
    const preview = await bitmapOf(resize(master, p.w, p.h))
    return {
      id,
      kind,
      width: uprightW || master.width,
      height: uprightH || master.height,
      workWidth: master.width,
      workHeight: master.height,
      preview,
    }
  }

  function turned(src: Source, turns: number): Raster {
    const t = ((turns % 4) + 4) % 4
    let r = src.turns.get(t)
    if (!r) {
      r = rotate90(src.master, t)
      src.turns.set(t, r)
    }
    return r
  }

  function cropOf(r: Raster, crop: Rect | null): Raster {
    if (!crop) return r
    return cropRaster(r, { x: crop.x * r.width, y: crop.y * r.height, w: crop.w * r.width, h: crop.h * r.height })
  }

  /** Where the ink is in the (rotated) image, normalized; used to frame a signature automatically. */
  async function findInk(source: number, rotate: number, mode: InkOptions['mode']): Promise<Rect | null> {
    const src = sources.get(source)
    if (!src) return null
    const r = turned(src, rotate)
    const small = limitSide(r.width, r.height, 900)
    const work = resize(r, small.w, small.h)
    const { box } = cleanInk(work, { mode, color: 'black', darkness: 0, trim: false })
    if (!box) return null
    return { x: box.x / work.width, y: box.y / work.height, w: box.w / work.width, h: box.h / work.height }
  }

  /** Name and date printed in a white strip under the photo (some forms ask for this). */
  function withNameDate(photo: Raster, W: number, H: number, name: string, date: string): Raster {
    const strip = H - photo.height
    const c = platform.canvas(W, H)
    const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
    ctx.putImageData(new ImageData(photo.data as ImageDataArray, photo.width, photo.height), 0, 0)
    ctx.fillStyle = '#000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lines = [name.trim().toUpperCase(), date.trim()].filter(Boolean)
    lines.forEach((line, i) => {
      let size = Math.floor((strip / Math.max(2, lines.length)) * 0.72)
      do {
        ctx.font = `600 ${size}px Arial, Helvetica, sans-serif`
        size--
      } while (size > 6 && ctx.measureText(line).width > W * 0.94)
      ctx.fillText(line, W / 2, photo.height + (strip * (i + 0.5)) / lines.length)
    })
    return { width: W, height: H, data: ctx.getImageData(0, 0, W, H).data }
  }

  async function render(job: RenderJob): Promise<RenderResult> {
    const t0 = performance.now()
    latestJob = Math.max(latestJob, job.job)
    const cancelled = () => job.job < latestJob
    const src = sources.get(job.source)
    if (!src) return { job: job.job, ok: false, reason: 'empty' }
    try {
      // cropRaster always copies; without a crop, copy too, because the fixes below work in place.
      const base = turned(src, job.rotate)
      let work = job.crop ? cropOf(base, job.crop) : cloneRaster(base)
      const { out } = job
      if (job.mode === 'ink' && job.ink) {
        const lim = limitSide(work.width, work.height, 1800)
        if (lim.w !== work.width) work = resize(work, lim.w, lim.h)
        const cleaned = cleanInk(work, job.ink)
        if (!cleaned.box) return { job: job.job, ok: false, reason: 'empty' }
        work = cleaned.raster
      } else {
        if (job.auto) autoLevels(work)
        if (job.brightness || job.contrast) adjust(work, job.brightness ?? 0, job.contrast ?? 0)
        if (job.grayscale) grayscale(work)
      }
      if (cancelled()) throw new Cancelled()

      const finalSize = out.size ?? limitSide(work.width, work.height, out.maxSide ?? MAX_SIDE)
      const strip = job.nameDate && job.mode === 'photo' ? Math.round(finalSize.h * 0.2) : 0
      const cache = new Map<string, Raster>()
      const rasterAt = (s: Size): Raster => {
        const key = `${s.w}x${s.h}`
        let r = cache.get(key)
        if (r) return r
        if (strip) {
          const photoH = Math.round(s.h * (1 - strip / finalSize.h))
          r = withNameDate(resize(work, s.w, photoH), s.w, s.h, job.nameDate!.name, job.nameDate!.date)
        } else if (out.fit === 'contain') {
          const inner = containSize(work.width, work.height, s.w, s.h)
          r = placeOnWhite(resize(work, inner.w, inner.h), s.w, s.h, Math.floor((s.w - inner.w) / 2), Math.floor((s.h - inner.h) / 2))
        } else {
          r = resize(work, s.w, s.h)
        }
        cache.set(key, r)
        return r
      }

      const sizes = [finalSize, ...(out.smaller ?? [])]
      let bytes: Uint8Array
      let size: Size
      let quality: number
      let padded = 0
      let encodes = 1
      if (out.kb) {
        const fit = await fitToWindow((s, q) => encodeJpeg(rasterAt(s), q, out.dpi), {
          window: safeWindow(out.kb),
          sizes,
          allowPad: out.allowPad ?? true,
          cancelled,
        })
        if (!fit.ok) return { job: job.job, ok: false, reason: fit.reason, bytes: fit.bytes, size: fit.size }
        ;({ bytes, size, quality, padded, encodes } = fit)
      } else {
        size = finalSize
        quality = 92
        bytes = await encodeJpeg(rasterAt(size), quality, out.dpi)
      }
      if (cancelled()) throw new Cancelled()
      const fill = job.mode === 'ink' ? inkFill(rasterAt(size)) : null
      return { job: job.job, ok: true, bytes, w: size.w, h: size.h, quality, padded, fill, encodes, ms: Math.round(performance.now() - t0) }
    } catch (e) {
      if (e instanceof Cancelled) return { job: job.job, ok: false, reason: 'cancelled' }
      throw e
    }
  }

  /** Encode an already-made raster (PDF pages) as JPEG, as good as fits in `maxBytes`. */
  async function encodePage(page: Raster, maxBytes: number, dpi?: number): Promise<{ bytes: Uint8Array; quality: number } | null> {
    const fit = await fitToWindow((_s, q) => encodeJpeg(page, q, dpi), {
      window: { lo: 0, hi: maxBytes },
      sizes: [{ w: page.width, h: page.height }],
      qMin: 20,
      qMax: 92,
      allowPad: false,
    })
    return fit.ok ? { bytes: fit.bytes, quality: fit.quality } : null
  }

  /**
   * A photographed page for a PDF: rotate, limit the long side, brighten, optionally grey, then
   * JPEG at the best quality that fits `maxBytes`.
   */
  async function encodeSource(source: number, rotate: number, maxSide: number, gray: boolean, maxBytes: number) {
    const src = sources.get(source)
    if (!src) return null
    const base = turned(src, rotate)
    const s = limitSide(base.width, base.height, maxSide)
    const r = resize(base, s.w, s.h)
    autoLevels(r)
    if (gray) grayscale(r)
    const out = await encodePage(r, maxBytes)
    return out ? { ...out, w: s.w, h: s.h } : null
  }

  function release(source: number) {
    sources.delete(source)
  }

  return { open, render, findInk, encodePage, encodeSource, release }
}

export type Engine = ReturnType<typeof createEngine>
