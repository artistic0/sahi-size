/**
 * What a file really is, from its first bytes. The file name is never trusted: a PNG renamed to
 * ".jpg" is one of the most common reasons a portal rejects an upload.
 */
export type FileKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'avif' | 'heic' | 'tiff' | 'pdf' | 'unknown'

const ascii = (b: Uint8Array, start: number, len: number): string => {
  let s = ''
  for (let i = start; i < Math.min(b.length, start + len); i++) s += String.fromCharCode(b[i])
  return s
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

export function sniff(b: Uint8Array): FileKind {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length >= 6 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')) return 'gif'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp'
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    // ISO-BMFF: major brand at 8, compatible brands from 16 to the end of the ftyp box.
    const boxSize = Math.min(b.length, ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0 || 32)
    const brands = [ascii(b, 8, 4)]
    for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(b, i, 4))
    if (brands.some((x) => AVIF_BRANDS.has(x))) return 'avif'
    if (brands.some((x) => HEIF_BRANDS.has(x))) return 'heic'
  }
  if (b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a))) {
    return 'tiff'
  }
  if (b.length >= 18 && b[0] === 0x42 && b[1] === 0x4d) {
    const dib = b[14] | (b[15] << 8) | (b[16] << 16) | (b[17] << 24)
    if ([12, 40, 52, 56, 64, 108, 124].includes(dib)) return 'bmp'
  }
  // The PDF spec allows junk before the header, within the first 1024 bytes.
  if (ascii(b, 0, 1024).includes('%PDF-')) return 'pdf'
  return 'unknown'
}

/** Formats every browser can decode into pixels. */
export const DECODABLE: ReadonlySet<FileKind> = new Set(['jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'])

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim())
  return m ? m[1].toLowerCase() : ''
}

/** Extensions that honestly describe each kind. */
export const EXTENSIONS: Record<FileKind, string[]> = {
  jpeg: ['jpg', 'jpeg', 'jfif'],
  png: ['png'],
  webp: ['webp'],
  gif: ['gif'],
  bmp: ['bmp'],
  avif: ['avif'],
  heic: ['heic', 'heif'],
  tiff: ['tif', 'tiff'],
  pdf: ['pdf'],
  unknown: [],
}

export const KIND_LABEL: Record<FileKind, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  bmp: 'BMP',
  avif: 'AVIF',
  heic: 'HEIC (iPhone photo)',
  tiff: 'TIFF',
  pdf: 'PDF',
  unknown: 'unknown',
}
