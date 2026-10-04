/**
 * An RGBA image in memory. Same layout as ImageData, but it can be created in Node, so every
 * pixel operation in src/engine is unit-tested without a browser.
 */
export interface Raster {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Refuse absurd sizes before allocating: 40 MP × 4 bytes is already 160 MB. */
export const MAX_PIXELS = 40_000_000

export function createRaster(width: number, height: number, fill: readonly [number, number, number, number] = [255, 255, 255, 255]): Raster {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`Bad raster size ${width}×${height}`)
  }
  if (width * height > MAX_PIXELS) throw new RangeError(`Raster too large: ${width}×${height}`)
  const data = new Uint8ClampedArray(width * height * 4)
  const [r, g, b, a] = fill
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
  return { width, height, data }
}

export function cloneRaster(src: Raster): Raster {
  return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) }
}

/** Perceived brightness (Rec. 601 weights), 0–255. */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function meanLuma(src: Raster): number {
  const d = src.data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += luma(d[i], d[i + 1], d[i + 2])
  return sum / (src.width * src.height)
}
