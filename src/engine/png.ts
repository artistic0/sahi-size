/** Just enough PNG parsing to check a file: size, transparency and DPI (pHYs chunk). */
export interface PngInfo {
  width: number
  height: number
  hasAlpha: boolean
  dpi: number | null
}

export class PngError extends Error {}

const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
const type = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])

export function readPng(b: Uint8Array): PngInfo {
  if (b.length < 33 || type(b, 12) !== 'IHDR') throw new PngError('Not a PNG file')
  const width = u32(b, 16)
  const height = u32(b, 20)
  const colorType = b[25]
  let hasAlpha = colorType === 4 || colorType === 6
  let dpi: number | null = null
  let at = 8
  while (at + 12 <= b.length) {
    const len = u32(b, at)
    const t = type(b, at + 4)
    if (t === 'IDAT' || t === 'IEND') break // pHYs and tRNS must come before the image data
    if (t === 'tRNS') hasAlpha = true
    if (t === 'pHYs' && len >= 9 && b[at + 16] === 1) dpi = Math.round(u32(b, at + 8) * 0.0254)
    at += 12 + len
  }
  return { width, height, hasAlpha, dpi }
}
