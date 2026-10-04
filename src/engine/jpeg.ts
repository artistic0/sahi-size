/**
 * Reading and patching JPEG headers by hand.
 *
 * A JPEG is a list of segments: 0xFF, a marker byte, a 2-byte big-endian length (which counts
 * itself) and a payload. After SOS (start of scan) comes the compressed image data, which we never
 * touch. Everything here works on the header segments only, so pixels are never changed.
 */

export interface JpegSegment {
  marker: number
  /** Index of the 0xFF that starts the segment. */
  start: number
  /** Total bytes: marker, length field and payload. */
  length: number
}

export type JpegColor = 'grey' | 'ycbcr' | 'rgb' | 'cmyk' | 'ycck' | 'unknown'

export interface JpegInfo {
  width: number
  height: number
  progressive: boolean
  components: number
  color: JpegColor
  jfif: { units: number; x: number; y: number } | null
  exif: { orientation: number | null; xRes: number | null; unit: number | null } | null
  /** Dots per inch from JFIF or EXIF, if the file says. */
  dpi: number | null
  /** Encoder quality (1–100) estimated from the luminance quantization table. */
  quality: number | null
  segments: JpegSegment[]
}

export class JpegError extends Error {}

const SOI = 0xd8
const EOI = 0xd9
const SOS = 0xda
const APP0 = 0xe0
const APP1 = 0xe1
const APP2 = 0xe2
const APP14 = 0xee
const COM = 0xfe
const DQT = 0xdb

const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc
const isProgressive = (m: number) => m === 0xc2 || m === 0xc6 || m === 0xca || m === 0xce
const startsWith = (b: Uint8Array, at: number, text: string) => {
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false
  return true
}

/** The IJG standard luminance table (JPEG spec Annex K), in natural row order. */
const STD_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109,
  103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]
/** DQT stores tables in zigzag order: ZIGZAG[k] is the natural index of the k-th stored value. */
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22,
  15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]

/** libjpeg's quality → table scaling, compared against the file's table; the closest quality wins. */
export function estimateQuality(table: number[]): number {
  let best = 0
  let bestErr = Infinity
  for (let q = 1; q <= 100; q++) {
    const scale = q < 50 ? 5000 / q : 200 - 2 * q
    let err = 0
    for (let k = 0; k < 64; k++) {
      const expected = Math.min(255, Math.max(1, Math.floor((STD_LUMA[ZIGZAG[k]] * scale + 50) / 100)))
      err += Math.abs(table[k] - expected)
    }
    if (err < bestErr) {
      bestErr = err
      best = q
    }
  }
  return best
}

export function readJpeg(b: Uint8Array): JpegInfo {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== SOI) throw new JpegError('Not a JPEG file')
  const segments: JpegSegment[] = []
  let sof: { marker: number; width: number; height: number; components: number } | null = null
  let jfif: JpegInfo['jfif'] = null
  let exif: JpegInfo['exif'] = null
  let adobeTransform: number | null = null
  let lumaTable: number[] | null = null

  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) throw new JpegError('Damaged JPEG header')
    while (i < b.length && b[i] === 0xff) i++ // fill bytes
    if (i >= b.length) break
    const marker = b[i]
    const start = i - 1
    i++
    if (marker === SOI || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue // no payload
    if (marker === EOI) break
    if (i + 2 > b.length) throw new JpegError('Truncated JPEG')
    const len = (b[i] << 8) | b[i + 1]
    const end = i + len
    if (len < 2 || end > b.length) throw new JpegError('Truncated JPEG')
    const p = i + 2
    segments.push({ marker, start, length: end - start })

    if (isSof(marker) && len >= 8) {
      sof = { marker, height: (b[p + 1] << 8) | b[p + 2], width: (b[p + 3] << 8) | b[p + 4], components: b[p + 5] }
    } else if (marker === APP0 && len >= 16 && startsWith(b, p, 'JFIF\0')) {
      jfif = { units: b[p + 7], x: (b[p + 8] << 8) | b[p + 9], y: (b[p + 10] << 8) | b[p + 11] }
    } else if (marker === APP1 && len >= 16 && startsWith(b, p, 'Exif\0\0')) {
      exif = readExif(b, p + 6, end)
    } else if (marker === APP14 && len >= 14 && startsWith(b, p, 'Adobe')) {
      adobeTransform = b[p + 11]
    } else if (marker === DQT) {
      let q = p
      while (q < end) {
        const precision = b[q] >> 4
        const id = b[q] & 15
        q++
        const table: number[] = []
        for (let k = 0; k < 64; k++) {
          table.push(precision ? (b[q] << 8) | b[q + 1] : b[q])
          q += precision ? 2 : 1
        }
        if (id === 0) lumaTable = table
      }
    }
    if (marker === SOS) break
    i = end
  }
  if (!sof) throw new JpegError('No image size found in JPEG')

  let color: JpegColor = 'unknown'
  if (sof.components === 1) color = 'grey'
  else if (sof.components === 3) color = adobeTransform === 0 ? 'rgb' : 'ycbcr'
  else if (sof.components === 4) color = adobeTransform === 2 ? 'ycck' : 'cmyk'

  let dpi: number | null = null
  if (jfif && jfif.units === 1 && jfif.x > 1) dpi = jfif.x
  else if (jfif && jfif.units === 2 && jfif.x > 1) dpi = Math.round(jfif.x * 2.54)
  else if (exif?.xRes && exif.xRes > 1) dpi = exif.unit === 3 ? Math.round(exif.xRes * 2.54) : Math.round(exif.xRes)

  return {
    width: sof.width,
    height: sof.height,
    progressive: isProgressive(sof.marker),
    components: sof.components,
    color,
    jfif,
    exif,
    dpi,
    quality: lumaTable ? estimateQuality(lumaTable) : null,
    segments,
  }
}

function readExif(b: Uint8Array, tiff: number, end: number): NonNullable<JpegInfo['exif']> {
  const out: NonNullable<JpegInfo['exif']> = { orientation: null, xRes: null, unit: null }
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49
  const big = b[tiff] === 0x4d && b[tiff + 1] === 0x4d
  if (!little && !big) return out
  const u16 = (at: number) => (at + 2 > end ? 0 : little ? b[at] | (b[at + 1] << 8) : (b[at] << 8) | b[at + 1])
  const u32 = (at: number) =>
    at + 4 > end ? 0 : little ? (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0 : ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
  if (u16(tiff + 2) !== 42) return out
  const ifd = tiff + u32(tiff + 4)
  const count = u16(ifd)
  for (let k = 0; k < count && k < 512; k++) {
    const e = ifd + 2 + k * 12
    if (e + 12 > end) break
    const tag = u16(e)
    if (tag === 0x0112) out.orientation = u16(e + 8)
    else if (tag === 0x0128) out.unit = u16(e + 8)
    else if (tag === 0x011a) {
      const at = tiff + u32(e + 8)
      const den = u32(at + 4)
      if (den) out.xRes = u32(at) / den
    }
  }
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Rebuild the file from SOI, the kept header segments, and everything from SOS on. */
function rebuild(b: Uint8Array, info: JpegInfo, keep: (s: JpegSegment) => boolean, insertAfterApp0: Uint8Array[] = []): Uint8Array {
  const sos = info.segments.find((s) => s.marker === SOS)
  if (!sos) throw new JpegError('No image data in JPEG')
  const parts: Uint8Array[] = [b.subarray(0, 2)]
  const headers = info.segments.filter((s) => s.marker !== SOS)
  const first = headers[0]
  const app0First = first && first.marker === APP0
  if (!app0First) parts.push(...insertAfterApp0)
  headers.forEach((s, idx) => {
    if (keep(s)) parts.push(b.subarray(s.start, s.start + s.length))
    if (idx === 0 && app0First) parts.push(...insertAfterApp0)
  })
  parts.push(b.subarray(sos.start))
  return concat(parts)
}

/**
 * Remove EXIF and XMP (camera, date, GPS location), comments and other application data.
 * Keeps JFIF (APP0), the colour profile (APP2) and Adobe's colour marker (APP14).
 */
export function stripMetadata(b: Uint8Array): Uint8Array {
  const info = readJpeg(b)
  return rebuild(b, info, (s) => s.marker === APP0 || s.marker === APP2 || s.marker === APP14 || s.marker < APP0 || (s.marker > 0xef && s.marker !== COM))
}

function jfifSegment(dpi: number): Uint8Array {
  const d = Math.max(1, Math.min(65535, Math.round(dpi)))
  // FF E0, length 16, "JFIF\0", version 1.01, units 1 (dots per inch), X and Y density, no thumbnail.
  return new Uint8Array([0xff, APP0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, d >> 8, d & 255, d >> 8, d & 255, 0, 0])
}

/** Write the DPI into the JFIF header: patch it if there is one, or insert one right after SOI. */
export function setJfifDpi(b: Uint8Array, dpi: number): Uint8Array {
  const info = readJpeg(b)
  const first = info.segments[0]
  const d = Math.max(1, Math.min(65535, Math.round(dpi)))
  if (first && first.marker === APP0 && info.jfif) {
    const out = new Uint8Array(b)
    const p = first.start + 4
    out[p + 7] = 1
    out[p + 8] = d >> 8
    out[p + 9] = d & 255
    out[p + 10] = d >> 8
    out[p + 11] = d & 255
    return out
  }
  return concat([b.subarray(0, 2), jfifSegment(d), b.subarray(2)])
}

const PAD_NOTE = 'Padding added to meet a minimum file size. '

/**
 * Grow a JPEG to `target` bytes (at most 3 bytes over) with comment segments placed after the
 * JFIF header. Decoders skip comments, so the picture is exactly the same.
 */
export function padTo(b: Uint8Array, target: number): Uint8Array {
  let need = target - b.length
  if (need <= 0) return b
  const info = readJpeg(b)
  const segs: Uint8Array[] = []
  while (need > 0) {
    let payload = Math.max(0, Math.min(65533, need - 4))
    const after = need - 4 - payload
    if (after > 0 && after < 4) payload -= 4 - after // leave room for one more whole segment
    const seg = new Uint8Array(4 + payload)
    seg[0] = 0xff
    seg[1] = COM
    seg[2] = (payload + 2) >> 8
    seg[3] = (payload + 2) & 255
    for (let k = 0; k < payload; k++) seg[4 + k] = k < PAD_NOTE.length ? PAD_NOTE.charCodeAt(k) : 0x20
    segs.push(seg)
    need -= seg.length
  }
  return rebuild(b, info, () => true, segs)
}

/**
 * Set the EXIF orientation (1–8), replacing any EXIF block. Used to build rotated test images and
 * the one-time check of whether this browser applies EXIF rotation itself.
 */
export function withExifOrientation(b: Uint8Array, orientation: number): Uint8Array {
  const info = readJpeg(b)
  // "Exif\0\0", big-endian TIFF header, IFD0 with a single Orientation entry, no next IFD.
  const exif = new Uint8Array([
    0xff, APP1, 0, 34,
    0x45, 0x78, 0x69, 0x66, 0, 0,
    0x4d, 0x4d, 0, 42, 0, 0, 0, 8,
    0, 1,
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation & 255, 0, 0,
    0, 0, 0, 0,
  ])
  return rebuild(b, info, (s) => !(s.marker === APP1 && startsWith(b, s.start + 4, 'Exif\0\0')), [exif])
}
