import { createRaster, luma, type Raster } from './raster'
import type { Rect } from './dims'

/**
 * Turn a phone photo of ink on paper (signature, thumb impression, handwritten declaration) into a
 * clean scan: white paper, even dark ink, trimmed to the ink.
 *
 *  1. brightness of every pixel
 *  2. estimate the paper's brightness everywhere (shadows and uneven light included): take the
 *     brightest pixel in each block, which is paper because strokes are thin, then smooth
 *  3. divide by that estimate, so paper becomes ~255 everywhere and only ink stays dark
 *  4. soft threshold (Otsu's method picks the split between paper and ink)
 *  5. remove specks, find the ink's bounding box
 *  6. repaint: white paper, ink in the chosen colour, anti-aliased edges kept
 */
export type InkMode = 'signature' | 'declaration' | 'thumb'
export type InkColor = 'original' | 'black' | 'blue'

export interface InkOptions {
  mode: InkMode
  color: InkColor
  /** −1 (lighter, thinner strokes) … +1 (darker, bolder strokes). */
  darkness: number
  /** Crop to the ink plus a margin. */
  trim: boolean
}

export interface InkResult {
  raster: Raster
  /** The ink's bounding box in the input's pixels, or null if no ink was found. */
  box: Rect | null
  /** Margin added around the box on each side, in pixels (when trimmed). */
  pad: number
}

const BLUE: [number, number, number] = [18, 42, 140]

function backgroundEstimate(L: Float32Array, W: number, H: number, block: number): Float32Array {
  const gw = Math.ceil(W / block)
  const gh = Math.ceil(H / block)
  let grid = new Float32Array(gw * gh)
  for (let y = 0; y < H; y++) {
    const gy = Math.floor(y / block) * gw
    for (let x = 0; x < W; x++) {
      const g = gy + Math.floor(x / block)
      const v = L[y * W + x]
      if (v > grid[g]) grid[g] = v
    }
  }
  // One 3×3 max pass covers blocks that were entirely ink, then two 3×3 average passes smooth.
  const pass = (src: Float32Array, op: 'max' | 'mean') => {
    const out = new Float32Array(src.length)
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let acc = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
            const v = src[ny * gw + nx]
            if (op === 'max') acc = Math.max(acc, v)
            else acc += v
            n++
          }
        }
        out[y * gw + x] = op === 'max' ? acc : acc / n
      }
    }
    return out
  }
  grid = pass(pass(pass(grid, 'max'), 'mean'), 'mean')

  // Bilinear upsample from block centres to every pixel.
  const B = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / block - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(gh - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < W; x++) {
      const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / block - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(gw - 1, x0 + 1)
      const tx = fx - x0
      const top = grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx
      const bottom = grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx
      B[y * W + x] = top * (1 - ty) + bottom * ty
    }
  }
  return B
}

/** Otsu's threshold: the split that best separates the histogram into two groups. */
export function otsu(values: Float32Array): number {
  const hist = new Float64Array(256)
  for (let i = 0; i < values.length; i++) hist[Math.min(255, Math.max(0, Math.round(values[i])))]++
  const total = values.length
  let sum = 0
  for (let v = 0; v < 256; v++) sum += v * hist[v]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

/** Connected groups of ink pixels (8-neighbour), via union-find. */
function components(mask: Uint8Array, W: number, H: number): { labels: Int32Array; area: number[]; box: Rect[] } {
  const labels = new Int32Array(W * H)
  const parent: number[] = [0]
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!mask[i]) continue
      const n: number[] = []
      if (x > 0 && labels[i - 1]) n.push(labels[i - 1])
      if (y > 0) {
        if (labels[i - W]) n.push(labels[i - W])
        if (x > 0 && labels[i - W - 1]) n.push(labels[i - W - 1])
        if (x < W - 1 && labels[i - W + 1]) n.push(labels[i - W + 1])
      }
      if (!n.length) {
        parent.push(parent.length)
        labels[i] = parent.length - 1
      } else {
        const m = Math.min(...n)
        labels[i] = m
        for (const l of n) union(m, l)
      }
    }
  }
  const root = new Map<number, number>()
  const area: number[] = []
  const box: Rect[] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!labels[i]) continue
      const r = find(labels[i])
      let id = root.get(r)
      if (id === undefined) {
        id = area.length + 1
        root.set(r, id)
        area.push(0)
        box.push({ x, y, w: 1, h: 1 })
      }
      labels[i] = id
      area[id - 1]++
      const b = box[id - 1]
      if (x < b.x) {
        b.w += b.x - x
        b.x = x
      } else if (x >= b.x + b.w) b.w = x - b.x + 1
      if (y >= b.y + b.h) b.h = y - b.y + 1
    }
  }
  return { labels, area, box }
}

function estimateInkColour(src: Raster, alpha: Float32Array): [number, number, number] {
  const d = src.data
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] < 0.95) continue
    r += d[i * 4]
    g += d[i * 4 + 1]
    b += d[i * 4 + 2]
    n++
  }
  if (n < 20) return [20, 20, 24]
  r /= n
  g /= n
  b /= n
  // Photos make ink look washed out; deepen it. Near-grey ink becomes near-black.
  if (Math.max(r, g, b) - Math.min(r, g, b) < 28) return [20, 20, 24]
  const k = Math.min(1, 110 / Math.max(r, g, b))
  return [r * k, g * k, b * k]
}

export function cleanInk(src: Raster, o: InkOptions): InkResult {
  const { width: W, height: H, data: d } = src
  const n = W * H
  const L = new Float32Array(n)
  for (let i = 0; i < n; i++) L[i] = luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])

  const longSide = Math.max(W, H)
  const block = o.mode === 'thumb' ? Math.max(16, Math.round(longSide / 6)) : Math.max(8, Math.round(longSide / 40))
  const B = backgroundEstimate(L, W, H, block)
  const N = new Float32Array(n)
  for (let i = 0; i < n; i++) N[i] = Math.min(255, (L[i] / Math.max(B[i], 24)) * 255)

  const alpha = new Float32Array(n)
  if (o.mode === 'thumb') {
    // Keep the ridge detail: a contrast curve instead of a hard threshold.
    const hist = new Uint32Array(256)
    for (let i = 0; i < n; i++) hist[Math.round(N[i])]++
    const pct = (p: number) => {
      let seen = 0
      for (let v = 0; v < 256; v++) if ((seen += hist[v]) >= n * p) return v
      return 255
    }
    const lo = pct(0.01)
    const hi = Math.max(lo + 30, pct(0.9))
    const gamma = 1 - o.darkness * 0.45
    for (let i = 0; i < n; i++) {
      const t = Math.min(1, Math.max(0, (hi - N[i]) / (hi - lo)))
      alpha[i] = Math.pow(t, gamma)
    }
  } else {
    const T = Math.min(228, Math.max(90, otsu(N))) + o.darkness * 30
    const w = 12
    for (let i = 0; i < n; i++) {
      const t = Math.min(1, Math.max(0, (T + w - N[i]) / (2 * w)))
      alpha[i] = t * t * (3 - 2 * t) // smoothstep keeps anti-aliased edges
    }
  }

  // Specks: groups of ink smaller than a few pixels, and faint halos around them.
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = alpha[i] > 0.15 ? 1 : 0
  const cc = components(mask, W, H)
  const speck = o.mode === 'thumb' ? 0 : o.mode === 'declaration' ? 3 : Math.max(4, Math.round(n * 0.00003))
  const significant = o.mode === 'thumb' ? Math.round(n * 0.001) : o.mode === 'declaration' ? Math.max(3, Math.round(n * 0.00002)) : Math.max(speck, Math.round(n * 0.0002))
  if (speck) {
    for (let i = 0; i < n; i++) if (cc.labels[i] && cc.area[cc.labels[i] - 1] < speck) alpha[i] = 0
  }
  let box: Rect | null = null
  for (let k = 0; k < cc.area.length; k++) {
    if (cc.area[k] < significant) continue
    const b = cc.box[k]
    if (!box) box = { ...b }
    else {
      const x1 = Math.max(box.x + box.w, b.x + b.w)
      const y1 = Math.max(box.y + box.h, b.y + b.h)
      box.x = Math.min(box.x, b.x)
      box.y = Math.min(box.y, b.y)
      box.w = x1 - box.x
      box.h = y1 - box.y
    }
  }

  const ink = o.color === 'black' ? [12, 12, 16] : o.color === 'blue' ? BLUE : estimateInkColour(src, alpha)
  let ox = 0
  let oy = 0
  let ow = W
  let oh = H
  let pad = 0
  if (o.trim && box) {
    pad = Math.round(Math.max(box.w, box.h) * 0.05) + 2
    ox = box.x - pad
    oy = box.y - pad
    ow = box.w + 2 * pad
    oh = box.h + 2 * pad
  }
  const out = createRaster(ow, oh)
  const od = out.data
  for (let y = 0; y < oh; y++) {
    const sy = oy + y
    if (sy < 0 || sy >= H) continue
    for (let x = 0; x < ow; x++) {
      const sx = ox + x
      if (sx < 0 || sx >= W) continue
      const a = alpha[sy * W + sx]
      if (!a) continue
      const p = (y * ow + x) * 4
      od[p] = 255 * (1 - a) + ink[0] * a
      od[p + 1] = 255 * (1 - a) + ink[1] * a
      od[p + 2] = 255 * (1 - a) + ink[2] * a
    }
  }
  return { raster: out, box, pad }
}

/**
 * How much of a W×H box the ink spans along its fuller side (0–1). SSC asks that a signature fills
 * at least 80% of its box; a tiny signature in a big white box gets rejected.
 */
export function inkFill(r: Raster, threshold = 160): number {
  const { width: W, height: H, data: d } = r
  let x0 = W
  let y0 = H
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4
      if (luma(d[p], d[p + 1], d[p + 2]) < threshold) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return 0
  return Math.max((x1 - x0 + 1) / W, (y1 - y0 + 1) / H)
}
