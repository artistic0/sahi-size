import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ui } from '../i18n/en'
import { clampView, cropOf, rotatedSize, type View } from './cropMath'

interface Props {
  bitmap: ImageBitmap
  rotate: number
  /** Frame width ÷ height. */
  aspect: number
  view: View
  onView: (v: View) => void
  onRotate: () => void
  onReset: () => void
  /** Allow zooming out past the image (white paper around it), for signatures and documents. */
  allowOutside: boolean
  guide: 'face' | 'none'
}

const MARGIN = 20

/**
 * The crop frame. The image is drawn on a canvas behind a fixed frame of the output's shape;
 * drag to move, pinch or scroll to zoom, or use the keyboard and buttons.
 */
export function Cropper({ bitmap, rotate, aspect, view, onView, onRotate, onReset, allowOutside, guide }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 320, h: 300 })
  const helpId = useId()
  const latest = useRef({ view, aspect, rotate, allowOutside, onView })
  latest.current = { view, aspect, rotate, allowOutside, onView }

  const { iw, ih } = rotatedSize(bitmap.width, bitmap.height, rotate)

  // Canvas follows its container's width; height suits the frame's shape.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = Math.max(240, Math.round(el.clientWidth))
      const h = Math.round(Math.min(440, Math.max(240, (w - 2 * MARGIN) / Math.max(aspect, 0.55) + 2 * MARGIN)))
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  const frame = useCallback(() => {
    const aw = box.w - 2 * MARGIN
    const ah = box.h - 2 * MARGIN
    const fw = Math.min(aw, ah * aspect)
    const fh = fw / aspect
    return { fx: (box.w - fw) / 2, fy: (box.h - fh) / 2, fw, fh }
  }, [box, aspect])

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    c.width = Math.round(box.w * dpr)
    c.height = Math.round(box.h * dpr)
    c.style.width = `${box.w}px`
    c.style.height = `${box.h}px`
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const { fx, fy, fw, fh } = frame()
    const crop = cropOf(view, iw, ih, aspect)
    const s = fw / (crop.w * iw)
    const ox = fx - crop.x * iw * s
    const oy = fy - crop.y * ih * s

    const dark = matchMedia('(prefers-color-scheme: dark)').matches
    ctx.fillStyle = dark ? '#0c1311' : '#e9efec'
    ctx.fillRect(0, 0, box.w, box.h)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(fx, fy, fw, fh)
    ctx.save()
    ctx.imageSmoothingQuality = 'high'
    ctx.translate(ox + (iw * s) / 2, oy + (ih * s) / 2)
    ctx.rotate((rotate * Math.PI) / 2)
    ctx.drawImage(bitmap, (-bitmap.width * s) / 2, (-bitmap.height * s) / 2, bitmap.width * s, bitmap.height * s)
    ctx.restore()

    // Dim everything outside the frame.
    ctx.fillStyle = 'rgba(8, 20, 17, 0.6)'
    ctx.beginPath()
    ctx.rect(0, 0, box.w, box.h)
    ctx.rect(fx, fy, fw, fh)
    ctx.fill('evenodd')
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(fx, fy, fw, fh)

    if (guide === 'face') {
      // Chin to crown ≈ 75% of the photo's height (passport-style rules), centred a little high.
      const eh = fh * 0.75
      const ew = eh * 0.72
      ctx.setLineDash([6, 5])
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.ellipse(fx + fw / 2, fy + fh * 0.47, Math.min(ew, fw * 0.9) / 2, eh / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [bitmap, box, frame, view, iw, ih, aspect, rotate, guide])

  // Pointer: one finger moves, two fingers zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef(0)

  const apply = (next: View) => {
    const L = latest.current
    const { iw: w, ih: h } = rotatedSize(bitmap.width, bitmap.height, L.rotate)
    L.onView(clampView(next, w, h, L.aspect, L.allowOutside))
  }

  const scale = () => {
    const L = latest.current
    const { iw: w, ih: h } = rotatedSize(bitmap.width, bitmap.height, L.rotate)
    const crop = cropOf(L.view, w, h, L.aspect)
    return { s: frame().fw / (crop.w * w), w, h }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const now = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, now)
    const v = latest.current.view
    if (pointers.current.size === 1) {
      const { s, w, h } = scale()
      apply({ ...v, cx: v.cx - (now.x - prev.x) / (s * w), cy: v.cy - (now.y - prev.y) / (s * h) })
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current > 0) apply({ ...v, zoom: v.zoom * (d / pinch.current) })
      pinch.current = d
    }
  }
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = 0
  }

  // Wheel needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = latest.current.view
      apply({ ...v, zoom: v.zoom * Math.exp(-e.deltaY * 0.0015) })
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [bitmap])

  const zoomBy = (k: number) => apply({ ...latest.current.view, zoom: latest.current.view.zoom * k })

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const v = latest.current.view
    const { w, h } = scale()
    const crop = cropOf(v, w, h, latest.current.aspect)
    const step = e.shiftKey ? 0.2 : 0.05
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (moves[e.key]) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      apply({ ...v, cx: v.cx + dx * crop.w * step, cy: v.cy + dy * crop.h * step })
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoomBy(1.15)
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      zoomBy(1 / 1.15)
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      onRotate()
    } else if (e.key === '0') {
      e.preventDefault()
      onReset()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrap} className="w-full overflow-hidden rounded-xl border border-[var(--line)]">
        <canvas
          ref={canvas}
          className="crop-canvas block"
          role="application"
          aria-roledescription="crop area"
          aria-label={ui.crop.label}
          aria-describedby={helpId}
          tabIndex={0}
          data-testid="crop-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
      </div>
      <p id={helpId} className="text-sm muted">
        {ui.crop.help}
        {guide === 'face' ? ` ${ui.crop.faceGuide}` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => zoomBy(1 / 1.2)} aria-label={ui.crop.zoomOut}>
          −
        </button>
        <button type="button" className="btn" onClick={() => zoomBy(1.2)} aria-label={ui.crop.zoomIn}>
          +
        </button>
        <button type="button" className="btn" onClick={onRotate}>
          ⟳ {ui.crop.rotate}
        </button>
        <button type="button" className="btn" onClick={onReset}>
          {ui.crop.reset}
        </button>
      </div>
    </div>
  )
}
