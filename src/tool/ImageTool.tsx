import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inspect, readFacts } from '../engine/inspect'
import type { InkColor } from '../engine/ink'
import { formatKb } from '../engine/kb'
import { ui } from '../i18n/en'
import type { OpenInfo, RenderJob } from '../lib/engine'
import { Cropper } from './Cropper'
import { clampView, cropOf, rotatedSize, viewForBox, type View } from './cropMath'
import { errorCode, getEngine, warmEngine, type ClientErrorCode } from './engineClient'
import { FilePicker } from './FilePicker'
import { ResultCard, type ResultState } from './ResultCard'
import { fileNameFor, type Target } from './target'

interface Props {
  target: Target | null
  /** File-name prefix, e.g. the exam id. */
  prefix: string
  next?: { label: string; go: () => void }
  allowNameDate?: boolean
  nameDateDefault?: boolean
}

const STRIP = 0.2
const today = () => new Date().toLocaleDateString('en-GB')
const START: View = { zoom: 1, cx: 0.5, cy: 0.5 }

export function ImageTool({ target, prefix, next, allowNameDate = false, nameDateDefault = false }: Props) {
  const [info, setInfo] = useState<OpenInfo | null>(null)
  const [fileName, setFileName] = useState('')
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<ClientErrorCode | null>(null)

  const [rotate, setRotate] = useState(0)
  const [view, setView] = useState<View>(START)
  const [auto, setAuto] = useState(true)
  const [brightness, setBrightness] = useState(0)
  const [clean, setClean] = useState(true)
  const [inkColour, setInkColour] = useState<InkColor>('original')
  const [darkness, setDarkness] = useState(0)
  const [stretch, setStretch] = useState(false)
  const [nameDate, setNameDate] = useState({ on: nameDateDefault, name: '', date: today() })
  const [result, setResult] = useState<ResultState>({ status: 'idle' })

  const doc = target?.doc ?? 'photo'
  const isInk = doc === 'signature' || doc === 'thumb' || doc === 'declaration'
  const inkMode = doc === 'thumb' ? 'thumb' : doc === 'declaration' ? 'declaration' : 'signature'
  const strip = allowNameDate && nameDate.on && doc === 'photo'

  const dims = info ? rotatedSize(info.preview.width, info.preview.height, rotate) : { iw: 1, ih: 1 }
  const outSize = target?.size ?? null
  const aspect = outSize ? outSize.w / (strip ? outSize.h - Math.round(outSize.h * STRIP) : outSize.h) : dims.iw / dims.ih
  const allowOutside = isInk || doc === 'document'

  const latestTarget = useRef(target)
  latestTarget.current = target
  const jobSeq = useRef(0)
  const lastMade = useRef<Extract<ResultState, { status: 'done' }>['made'] | null>(null)

  const frameInk = useCallback(
    async (opened: OpenInfo, turns: number) => {
      const engine = await getEngine()
      const box = await engine.findInk(opened.id, turns, inkMode)
      if (!box) return
      const { iw, ih } = rotatedSize(opened.preview.width, opened.preview.height, turns)
      const t = latestTarget.current
      const a = t?.size ? t.size.w / t.size.h : iw / ih
      setView(viewForBox(box, iw, ih, a))
    },
    [inkMode],
  )

  const onFile = async (file: File) => {
    setError(null)
    setOpening(true)
    setFileName(file.name)
    setResult({ status: 'idle' })
    lastMade.current = null
    try {
      const engine = await getEngine()
      // The previous picture is released by the effect below once the new one is on screen.
      const opened = await engine.open(file)
      setInfo(opened)
      setRotate(0)
      setView(START)
      if (isInk) await frameInk(opened, 0)
    } catch (e) {
      // Keep the previous picture (if any) and explain what went wrong.
      setError(errorCode(e))
    } finally {
      setOpening(false)
    }
  }

  useEffect(warmEngine, [])

  useEffect(() => {
    return () => {
      if (!info) return
      info.preview.close()
      void getEngine().then((e) => e.release(info.id))
    }
  }, [info])

  // Re-render the output whenever anything changes, a moment after the last change.
  useEffect(() => {
    if (!info || !target) return
    const id = ++jobSeq.current
    setResult({ status: 'working', last: lastMade.current })
    const timer = setTimeout(async () => {
      const t = latestTarget.current
      if (!t) return
      const v = clampView(view, dims.iw, dims.ih, aspect, allowOutside)
      const job: RenderJob = {
        source: info.id,
        job: id,
        rotate,
        crop: cropOf(v, dims.iw, dims.ih, aspect),
        mode: doc === 'photo' ? 'photo' : isInk ? (clean ? 'ink' : 'plain') : doc === 'document' ? 'document' : 'plain',
        ink: isInk && clean ? { mode: inkMode, color: inkColour, darkness, trim: true } : undefined,
        auto: doc === 'photo' || doc === 'document' ? auto : false,
        brightness: doc === 'photo' ? brightness : 0,
        nameDate: strip ? { name: nameDate.name, date: nameDate.date } : null,
        out: {
          size: t.size,
          fit: isInk ? (stretch ? 'stretch' : 'contain') : 'cover',
          smaller: t.smaller,
          kb: t.kb,
          dpi: t.dpi,
          allowPad: true,
        },
      }
      try {
        const engine = await getEngine()
        const r = await engine.render(job)
        if (id !== jobSeq.current) return
        if (r.ok) {
          const name = fileNameFor(t, prefix, r.w, r.h, r.bytes.length)
          const made = {
            blob: new Blob([r.bytes as BlobPart], { type: 'image/jpeg' }),
            name,
            bytes: r.bytes.length,
            w: r.w,
            h: r.h,
            quality: r.quality,
            padded: r.padded,
            fill: r.fill,
            checks: inspect(readFacts(name, r.bytes), t.preset),
          }
          lastMade.current = made
          setResult({ status: 'done', made })
        } else if (r.reason !== 'cancelled') {
          lastMade.current = null
          const message =
            r.reason === 'too-big' ? ui.result.tooBig(formatKb(r.bytes ?? 0)) : r.reason === 'too-small' ? ui.result.tooSmall(formatKb(r.bytes ?? 0)) : ui.ink.noInk
          setResult({ status: 'failed', message })
        }
      } catch (e) {
        if (id === jobSeq.current) setResult({ status: 'failed', message: ui.errors[errorCode(e)] })
      }
    }, 160)
    return () => clearTimeout(timer)
    // `target` is read through a ref; its key stands for its contents.
  }, [info, target?.key, rotate, view, auto, brightness, clean, inkColour, darkness, stretch, strip, nameDate.name, nameDate.date, aspect])

  const smallSource = useMemo(() => {
    if (!info || !outSize) return false
    const v = clampView(view, dims.iw, dims.ih, aspect, allowOutside)
    const c = cropOf(v, dims.iw, dims.ih, aspect)
    const scale = Math.max(info.width, info.height) / Math.max(dims.iw, dims.ih)
    return c.w * dims.iw * scale < outSize.w * 0.9 && !isInk
  }, [info, outSize, view, dims.iw, dims.ih, aspect, allowOutside, isInk])

  const hint = doc === 'photo' ? ui.picker.hintPhoto : doc === 'thumb' ? ui.picker.hintThumb : doc === 'declaration' ? ui.picker.hintDeclaration : ui.picker.hintInk

  if (!info) {
    return (
      <div className="flex flex-col gap-3">
        {target?.multi === 3 && <p className="surface p-3 text-sm">{ui.ink.threeTimes}</p>}
        {doc === 'declaration' && <DeclarationText />}
        <FilePicker onFile={onFile} hint={hint} camera={doc === 'photo' ? 'user' : 'environment'} busy={opening} busyText={ui.opening(fileName)} />
        {error && (
          <p role="alert" className="text-[var(--bad)]" data-testid="open-error">
            {ui.errors[error]}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-start">
      <div className="flex flex-col gap-3 md:col-start-1 md:row-start-1">
        {target?.multi === 3 && <p className="surface p-3 text-sm">{ui.ink.threeTimes}</p>}
        <Cropper
          bitmap={info.preview}
          rotate={rotate}
          aspect={aspect}
          view={view}
          onView={setView}
          allowOutside={allowOutside}
          guide={doc === 'photo' ? 'face' : 'none'}
          onRotate={() => {
            const r = (rotate + 1) % 4
            setRotate(r)
            setView(START)
            if (isInk) void frameInk(info, r)
          }}
          onReset={() => {
            setView(START)
            if (isInk) void frameInk(info, rotate)
          }}
        />
        {smallSource && <p className="text-sm text-[var(--warn)]">Your photo is smaller than the required size, so it will look a little soft. A sharper photo works better.</p>}
      </div>

      {/* On phones the result comes right under the crop frame; on wider screens it sits beside both. */}
      <div className="md:col-start-2 md:row-start-1 md:row-span-2">
        <ResultCard state={target ? result : { status: 'failed', message: ui.custom.invalid }} fillRule={doc === 'signature'} next={next} />
      </div>

      <div className="flex flex-col gap-3 md:col-start-1 md:row-start-2">
        {doc === 'photo' && (
          <fieldset className="surface p-3 flex flex-col gap-3">
            <legend className="sr-only">Photo adjustments</legend>
            <label className="flex items-center gap-2 min-h-11">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-5" />
              {ui.photo.auto}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">{ui.photo.brightness}</span>
              <input type="range" min={-0.6} max={0.6} step={0.05} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
            </label>
            {allowNameDate && (
              <>
                <label className="flex items-center gap-2 min-h-11">
                  <input type="checkbox" checked={nameDate.on} onChange={(e) => setNameDate({ ...nameDate, on: e.target.checked })} className="size-5" />
                  {ui.photo.nameDate}
                </label>
                {nameDate.on && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-sm">
                      {ui.photo.name}
                      <input className="field" value={nameDate.name} maxLength={40} onChange={(e) => setNameDate({ ...nameDate, name: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      {ui.photo.date}
                      <input className="field" value={nameDate.date} maxLength={20} onChange={(e) => setNameDate({ ...nameDate, date: e.target.value })} />
                    </label>
                  </div>
                )}
              </>
            )}
          </fieldset>
        )}

        {isInk && (
          <fieldset className="surface p-3 flex flex-col gap-3">
            <legend className="sr-only">Clean-up settings</legend>
            <label className="flex items-center gap-2 min-h-11">
              <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} className="size-5" data-testid="clean-toggle" />
              {ui.ink.clean}
            </label>
            {clean && (
              <>
                <div role="radiogroup" aria-label={ui.ink.colour} className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm mr-1">{ui.ink.colour}:</span>
                  {(['original', 'black', 'blue'] as const).map((c) => (
                    <label key={c} className={`chip cursor-pointer min-h-9 ${inkColour === c ? 'ring-2 ring-[var(--accent)]' : ''}`}>
                      <input type="radio" name={`ink-${target?.key}`} className="sr-only" checked={inkColour === c} onChange={() => setInkColour(c)} />
                      {ui.ink[c]}
                    </label>
                  ))}
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-sm">{ui.ink.strength}</span>
                  <span className="flex items-center gap-2 text-sm muted">
                    {ui.ink.lighter}
                    <input type="range" min={-1} max={1} step={0.1} value={darkness} onChange={(e) => setDarkness(Number(e.target.value))} className="flex-1" aria-label={ui.ink.strength} />
                    {ui.ink.darker}
                  </span>
                </label>
              </>
            )}
            {outSize && (
              <div role="radiogroup" aria-label={ui.ink.shape} className="flex flex-wrap gap-2 items-center">
                <span className="text-sm mr-1">{ui.ink.shape}:</span>
                {([false, true] as const).map((s) => (
                  <label key={String(s)} className={`chip cursor-pointer min-h-9 ${stretch === s ? 'ring-2 ring-[var(--accent)]' : ''}`}>
                    <input type="radio" name={`shape-${target?.key}`} className="sr-only" checked={stretch === s} onChange={() => setStretch(s)} />
                    {s ? ui.ink.stretch : ui.ink.keep}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <FilePicker onFile={onFile} hint="" camera={doc === 'photo' ? 'user' : 'environment'} busy={opening} busyText={ui.opening(fileName)} compact />
        {error && (
          <p role="alert" className="text-[var(--bad)]" data-testid="open-error">
            {ui.errors[error]}
          </p>
        )}
      </div>
    </div>
  )
}

function DeclarationText() {
  return (
    <div className="surface p-3 text-sm">
      <p className="font-semibold">{ui.ink.declarationText}</p>
      <p className="mt-1 italic">{ui.ink.declaration}</p>
    </div>
  )
}
