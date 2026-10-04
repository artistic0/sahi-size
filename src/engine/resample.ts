import { createRaster, type Raster } from './raster'

/**
 * Resizing done by hand, so every browser produces the same pixels.
 *
 * Shrinking uses area averaging: each output pixel is the exact average of the source area it
 * covers, which is the right filter for big reductions (a 12 MP photo down to 200×230).
 * Enlarging uses bilinear interpolation. The two axes are done one after the other ("separable"),
 * streaming source rows through a small cache so memory stays at a few rows, not a whole image.
 */

interface Taps {
  /** First source index for each output index. */
  first: Int32Array
  /** Number of source indices for each output index. */
  count: Int32Array
  /** Weights, `stride` per output index. */
  weights: Float32Array
  stride: number
}

function taps(srcLen: number, dstLen: number): Taps {
  const scale = srcLen / dstLen
  const stride = scale > 1 ? Math.ceil(scale) + 1 : 2
  const first = new Int32Array(dstLen)
  const count = new Int32Array(dstLen)
  const weights = new Float32Array(dstLen * stride)
  for (let i = 0; i < dstLen; i++) {
    if (scale > 1) {
      const x0 = i * scale
      const x1 = Math.min(srcLen, (i + 1) * scale)
      const s0 = Math.floor(x0)
      let n = 0
      for (let s = s0; s < x1 && n < stride; s++, n++) {
        weights[i * stride + n] = (Math.min(x1, s + 1) - Math.max(x0, s)) / scale
      }
      first[i] = s0
      count[i] = n
    } else {
      const x = (i + 0.5) * scale - 0.5
      const s0 = Math.floor(x)
      const t = x - s0
      const a = Math.min(srcLen - 1, Math.max(0, s0))
      const b = Math.min(srcLen - 1, Math.max(0, s0 + 1))
      first[i] = a
      if (b === a) {
        count[i] = 1
        weights[i * stride] = 1
      } else {
        count[i] = 2
        weights[i * stride] = 1 - t
        weights[i * stride + 1] = t
      }
    }
  }
  return { first, count, weights, stride }
}

export function resize(src: Raster, w: number, h: number): Raster {
  w = Math.max(1, Math.round(w))
  h = Math.max(1, Math.round(h))
  if (w === src.width && h === src.height) return { width: w, height: h, data: new Uint8ClampedArray(src.data) }
  const sw = src.width
  const sd = src.data
  const tx = taps(sw, w)
  const ty = taps(src.height, h)
  const out = createRaster(w, h)
  const od = out.data

  // Horizontally resampled source rows, kept only while an output row still needs them.
  const rows = new Map<number, Float32Array>()
  const row = (sy: number): Float32Array => {
    let r = rows.get(sy)
    if (r) return r
    r = new Float32Array(w * 4)
    const base = sy * sw * 4
    for (let x = 0; x < w; x++) {
      const f = tx.first[x]
      const n = tx.count[x]
      let cr = 0
      let cg = 0
      let cb = 0
      let ca = 0
      for (let k = 0; k < n; k++) {
        const wt = tx.weights[x * tx.stride + k]
        const p = base + (f + k) * 4
        cr += sd[p] * wt
        cg += sd[p + 1] * wt
        cb += sd[p + 2] * wt
        ca += sd[p + 3] * wt
      }
      r[x * 4] = cr
      r[x * 4 + 1] = cg
      r[x * 4 + 2] = cb
      r[x * 4 + 3] = ca
    }
    rows.set(sy, r)
    return r
  }

  const acc = new Float32Array(w * 4)
  for (let y = 0; y < h; y++) {
    const f = ty.first[y]
    const n = ty.count[y]
    for (const key of rows.keys()) if (key < f) rows.delete(key)
    acc.fill(0)
    for (let k = 0; k < n; k++) {
      const wt = ty.weights[y * ty.stride + k]
      const r = row(f + k)
      for (let i = 0; i < acc.length; i++) acc[i] += r[i] * wt
    }
    od.set(acc, y * w * 4) // Uint8ClampedArray rounds and clamps each value
  }
  return out
}
