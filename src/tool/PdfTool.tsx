import { useEffect, useId, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Preset } from '../data/types'
import { grayscale } from '../engine/enhance'
import { inspect, readFacts } from '../engine/inspect'
import { formatKb, formatRule, safeWindow, type KbRule } from '../engine/kb'
import type { PageJob } from '../engine/pdf/build'
import { sniff } from '../engine/sniff'
import { ui } from '../i18n/en'
// pdf.js and pdf-lib load only when needed (see src/pdf/engine.ts).
const pdfEngine = () => import('../pdf/engine')
import { Checks } from './Checks'
import { errorCode, getEngine, warmEngine } from './engineClient'
import { FilePicker } from './FilePicker'
import { useObjectUrl } from './useObjectUrl'

interface Props {
  kb: KbRule
  prefix: string
  preset?: Preset
  imagesFirst?: boolean
}

interface PdfFile {
  key: number
  name: string
  bytes: Uint8Array
  doc: PDFDocumentProxy
  encrypted: boolean
}

type Page =
  | { key: number; kind: 'pdf'; file: PdfFile; index: number; turns: number; thumb: ImageBitmap }
  | { key: number; kind: 'image'; source: number; name: string; turns: number; thumb: ImageBitmap }

type Status =
  | { s: 'idle' }
  | { s: 'working'; done: number; total: number }
  | { s: 'done'; blob: Blob; name: string; bytes: number; pages: number; note: string; checks: ReturnType<typeof inspect>; already: boolean }
  | { s: 'failed'; message: string }

let keys = 1
const A4_INCHES = 11.69

/** PDFs and photos in, one PDF under the limit out. */
export default function PdfTool({ kb, prefix, preset }: Props) {
  const [pages, setPages] = useState<Page[]>([])
  const [maxKb, setMaxKb] = useState(String(kb.max))
  const [gray, setGray] = useState(false)
  const [status, setStatus] = useState<Status>({ s: 'idle' })
  const [locked, setLocked] = useState<{ name: string; bytes: Uint8Array; incorrect: boolean } | null>(null)
  const [password, setPassword] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const pwId = useId()
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const url = useObjectUrl(status.s === 'done' ? status.blob : null)

  const rule: KbRule = preset ? kb : { min: kb.min, max: Number(maxKb) > 0 ? Number(maxKb) : kb.max }

  useEffect(() => {
    warmEngine()
    const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500))
    idle(() => void pdfEngine().then((m) => m.warmPdf()).catch(() => {}))
  }, [])

  // Free page pictures, engine memory and pdf.js documents when leaving.
  useEffect(
    () => () => {
      for (const p of pagesRef.current) {
        p.thumb.close()
        if (p.kind === 'image') void getEngine().then((e) => e.release(p.source))
      }
      for (const d of new Set(pagesRef.current.flatMap((p) => (p.kind === 'pdf' ? [p.file.doc] : [])))) void d.loadingTask.destroy()
    },
    [],
  )

  const stale = () => setStatus((s) => (s.s === 'done' || s.s === 'failed' ? { s: 'idle' } : s))

  const addPdf = async (name: string, bytes: Uint8Array, pw?: string) => {
    try {
      const { openPdf, thumbnail } = await pdfEngine()
      const doc = await openPdf(bytes, pw)
      const file: PdfFile = { key: keys++, name, bytes, doc, encrypted: readFacts(name, bytes).encrypted === true || !!pw }
      const added: Page[] = []
      for (let i = 0; i < doc.numPages; i++) added.push({ key: keys++, kind: 'pdf', file, index: i, turns: 0, thumb: await thumbnail(doc, i) })
      setPages((ps) => [...ps, ...added])
      setLocked(null)
      setPassword('')
    } catch (e) {
      const err = e as { message?: string; incorrect?: boolean }
      if (err?.message === 'password') setLocked({ name, bytes, incorrect: !!err.incorrect })
      else setError(ui.pdf.damaged)
    }
  }

  const addFiles = async (files: File[]) => {
    setError('')
    setAdding(true)
    stale()
    try {
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer())
        if (sniff(bytes) === 'pdf') {
          await addPdf(f.name, bytes)
          continue
        }
        try {
          const engine = await getEngine()
          const info = await engine.open(f)
          setPages((ps) => [...ps, { key: keys++, kind: 'image', source: info.id, name: f.name, turns: 0, thumb: info.preview }])
        } catch (e) {
          setError(ui.errors[errorCode(e)])
        }
      }
    } finally {
      setAdding(false)
    }
  }

  const move = (i: number, d: -1 | 1) => {
    stale()
    setPages((ps) => {
      const next = [...ps]
      const j = i + d
      if (j < 0 || j >= next.length) return ps
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  const turn = (i: number) => {
    stale()
    setPages((ps) => ps.map((p, k) => (k === i ? { ...p, turns: (p.turns + 1) % 4 } : p)))
  }
  const remove = (i: number) => {
    stale()
    setPages((ps) => {
      const p = ps[i]
      p.thumb.close()
      if (p.kind === 'image') void getEngine().then((e) => e.release(p.source))
      return ps.filter((_, k) => k !== i)
    })
  }

  const make = async () => {
    if (!pages.length) return setStatus({ s: 'failed', message: ui.pdf.empty })
    const window = safeWindow(rule)
    const fileName = `${prefix}-${Math.round(rule.max)}kb.pdf`
    const finish = (bytes: Uint8Array, note: string, already = false) => {
      const presetLike: Preset = preset ?? { id: 'custom-pdf', doc: 'document', format: 'pdf', kb: rule, source: null }
      setStatus({
        s: 'done',
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        name: fileName,
        bytes: bytes.length,
        pages: pages.length,
        note,
        already,
        checks: inspect(readFacts(fileName, bytes), presetLike).filter((c) => c.id !== 'filename'),
      })
    }
    setStatus({ s: 'working', done: 0, total: pages.length })
    try {
      // One untouched, unlocked PDF: keep it as it is if it fits, or try a lossless re-save.
      const single = pages.every((p) => p.kind === 'pdf' && p.file === (pages[0] as Extract<Page, { kind: 'pdf' }>).file && p.turns === 0)
      const first = pages[0]
      if (single && first.kind === 'pdf' && !first.file.encrypted && !gray && pages.length === first.file.doc.numPages && pages.every((p, i) => p.kind === 'pdf' && p.index === i)) {
        const original = first.file.bytes
        if (original.length >= window.lo && original.length <= window.hi) return finish(original, ui.pdf.already, true)
        try {
          const { resavePdf } = await pdfEngine()
          const re = await resavePdf(original)
          if (re.bytes.length >= window.lo && re.bytes.length <= window.hi) return finish(re.bytes, ui.pdf.kept)
        } catch {
          // pdf-lib couldn't read it: re-draw the pages below.
        }
      }

      const engine = await getEngine()
      const { pageSize, renderPage, buildRasterPdf } = await pdfEngine()
      const jobs: PageJob[] = []
      for (const p of pages) {
        if (p.kind === 'pdf') {
          const pt = await pageSize(p.file.doc, p.index)
          jobs.push({
            pt: p.turns % 2 ? { w: pt.h, h: pt.w } : pt,
            encode: async (dpi, maxBytes) => {
              const r = await renderPage(p.file.doc, p.index, dpi, p.turns)
              if (gray) grayscale(r)
              const { width: w, height: h } = r
              const out = await engine.encodePage(r, maxBytes)
              return out ? { bytes: out.bytes, w, h } : null
            },
          })
        } else {
          jobs.push({
            encode: (dpi, maxBytes) => engine.encodeSource(p.source, p.turns, Math.round(A4_INCHES * dpi), gray, maxBytes),
          })
        }
      }
      const r = await buildRasterPdf(jobs, window, (done, total) => setStatus({ s: 'working', done, total }))
      if (!r.ok) return setStatus({ s: 'failed', message: ui.pdf.tooBig(formatRule(rule)) })
      finish(r.bytes, pages.some((p) => p.kind === 'pdf') ? ui.pdf.flattened(r.dpi) : ui.pdf.drawn(r.dpi))
    } catch (e) {
      setStatus({ s: 'failed', message: errorCode(e) === 'engine' ? ui.errors.engine : ui.pdf.damaged })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FilePicker
        onFile={(f) => addFiles([f])}
        onFiles={addFiles}
        multiple
        accept="application/pdf,image/*"
        hint=""
        camera="environment"
        busy={adding}
        busyText="…"
        compact={pages.length > 0}
        chooseLabel={pages.length ? ui.pdf.addMore : ui.pdf.add}
      />
      {error && (
        <p role="alert" className="text-[var(--bad)]">
          {error}
        </p>
      )}

      {locked && (
        <form
          className="surface p-4 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void addPdf(locked.name, locked.bytes, password)
          }}
        >
          <p>{ui.pdf.password}</p>
          <label htmlFor={pwId} className="text-sm font-semibold">
            {ui.pdf.passwordLabel}
          </label>
          <div className="flex gap-2">
            <input id={pwId} type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            <button type="submit" className="btn btn-primary">
              {ui.pdf.unlock}
            </button>
          </div>
          {locked.incorrect && (
            <p role="alert" className="text-[var(--bad)] text-sm">
              {ui.pdf.wrongPassword}
            </p>
          )}
        </form>
      )}

      {pages.length > 0 && (
        <section aria-label={ui.pdf.pages(pages.length)} className="flex flex-col gap-2">
          <p className="font-semibold">{ui.pdf.pages(pages.length)}</p>
          <ol className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-testid="pdf-pages">
            {pages.map((p, i) => (
              <li key={p.key} className="surface p-2 flex flex-col gap-2 items-center">
                <Thumb bitmap={p.thumb} turns={p.turns} label={ui.pdf.page(i + 1)} />
                <span className="text-xs muted">{ui.pdf.page(i + 1)}</span>
                <div className="flex gap-1">
                  <button type="button" className="btn px-2" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${ui.pdf.up}: ${ui.pdf.page(i + 1)}`}>
                    ↑
                  </button>
                  <button type="button" className="btn px-2" onClick={() => move(i, 1)} disabled={i === pages.length - 1} aria-label={`${ui.pdf.down}: ${ui.pdf.page(i + 1)}`}>
                    ↓
                  </button>
                  <button type="button" className="btn px-2" onClick={() => turn(i)} aria-label={`${ui.pdf.rotate}: ${ui.pdf.page(i + 1)}`}>
                    ⟳
                  </button>
                  <button type="button" className="btn px-2" onClick={() => remove(i)} aria-label={`${ui.pdf.remove}: ${ui.pdf.page(i + 1)}`}>
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="surface p-4 flex flex-col gap-3">
        {preset ? (
          <p>
            <span className="font-semibold">Limit:</span> {formatRule(kb)}
          </p>
        ) : (
          <label className="flex flex-col gap-1 text-sm max-w-48">
            {ui.pdf.target}
            <input className="field" inputMode="numeric" value={maxKb} onChange={(e) => (setMaxKb(e.target.value.replace(/[^\d]/g, '')), stale())} data-testid="pdf-max-kb" />
          </label>
        )}
        <label className="flex items-center gap-2 min-h-11">
          <input type="checkbox" className="size-5" checked={gray} onChange={(e) => (setGray(e.target.checked), stale())} />
          {ui.pdf.gray}
        </label>
        <button type="button" className="btn btn-primary self-start" onClick={make} disabled={status.s === 'working' || !pages.length} data-testid="make-pdf">
          {status.s === 'done' ? ui.pdf.remake : ui.pdf.make}
        </button>
        <p aria-live="polite" className="text-sm" data-testid="pdf-status">
          {status.s === 'working' && ui.pdf.progress(status.done, status.total)}
          {status.s === 'failed' && <span className="text-[var(--bad)]">{status.message}</span>}
          {status.s === 'done' && ui.result.ready(`${status.name}, ${formatKb(status.bytes)}`)}
        </p>
        {status.s === 'done' && url && (
          <div className="flex flex-col gap-3">
            <Checks checks={status.checks} />
            <p className="text-sm muted">{status.note}</p>
            <a className="btn btn-primary self-start" href={url} download={status.name} data-testid="download">
              ⬇ {ui.result.download}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function Thumb({ bitmap, turns, label }: { bitmap: ImageBitmap; turns: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const box = 120
    const swap = turns % 2 === 1
    const w = swap ? bitmap.height : bitmap.width
    const h = swap ? bitmap.width : bitmap.height
    const s = Math.min(box / w, box / h)
    c.width = Math.round(w * s)
    c.height = Math.round(h * s)
    const ctx = c.getContext('2d')!
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate((turns * Math.PI) / 2)
    ctx.drawImage(bitmap, (-bitmap.width * s) / 2, (-bitmap.height * s) / 2, bitmap.width * s, bitmap.height * s)
  }, [bitmap, turns])
  return <canvas ref={ref} role="img" aria-label={label} className="border border-[var(--line)] bg-white" />
}
