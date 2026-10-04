import { useEffect, useRef, useState } from 'react'
import type { Check } from '../engine/inspect'
import { formatKb } from '../engine/kb'
import { ui } from '../i18n/en'
import { Checks } from './Checks'
import { useObjectUrl } from './useObjectUrl'

export interface Made {
  blob: Blob
  name: string
  bytes: number
  w: number
  h: number
  quality: number
  padded: number
  fill: number | null
  checks: Check[]
}

export type ResultState =
  | { status: 'idle' }
  | { status: 'working'; last: Made | null }
  | { status: 'done'; made: Made }
  | { status: 'failed'; message: string }

interface Props {
  state: ResultState
  /** Show the SSC "fill 80% of the box" hint for signatures. */
  fillRule?: boolean
  next?: { label: string; go: () => void }
}

export function ResultCard({ state, fillRule, next }: Props) {
  const made = state.status === 'done' ? state.made : state.status === 'working' ? state.last : null
  const busy = state.status === 'working'
  const url = useObjectUrl(made?.blob ?? null)
  const [zoom, setZoom] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const live = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!made) return setCanShare(false)
    try {
      const f = new File([made.blob], made.name, { type: 'image/jpeg' })
      setCanShare(typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] }))
    } catch {
      setCanShare(false)
    }
  }, [made])

  const share = async () => {
    if (!made) return
    try {
      await navigator.share({ files: [new File([made.blob], made.name, { type: 'image/jpeg' })], title: made.name })
    } catch {
      // Cancelled by the user: nothing to do.
    }
  }

  const fillPct = made?.fill != null ? Math.round(made.fill * 100) : null

  return (
    <section className="surface p-4 flex flex-col gap-3" aria-labelledby="result-h" data-testid="result">
      <h3 id="result-h" className="font-bold text-lg">
        {ui.result.title}
      </h3>
      <p ref={live} className="text-sm" aria-live="polite" data-testid="result-status">
        {state.status === 'working' && (made ? ui.result.stale : ui.result.working)}
        {state.status === 'done' && ui.result.ready(`${made!.name}, ${formatKb(made!.bytes)}`)}
        {state.status === 'failed' && <span className="text-[var(--bad)]">{state.message}</span>}
      </p>
      {made && url && (
        <>
          <div className={`checker-bg rounded-lg p-3 flex items-center justify-center overflow-auto ${busy ? 'opacity-50' : ''}`}>
            <img
              src={url}
              alt={`${made.name} preview`}
              width={made.w}
              height={made.h}
              className={zoom ? 'max-w-none' : 'max-w-full h-auto'}
              data-testid="result-image"
              ref={(el) => {
                if (el) {
                  el.style.width = zoom ? `${made.w * 2}px` : ''
                  el.style.imageRendering = zoom ? 'pixelated' : ''
                }
              }}
            />
          </div>
          <div className="flex gap-2 text-sm" role="group" aria-label="Preview size">
            <button type="button" className={`chip ${!zoom ? 'ring-2 ring-[var(--accent)]' : ''}`} aria-pressed={!zoom} onClick={() => setZoom(false)}>
              {ui.result.actual}
            </button>
            <button type="button" className={`chip ${zoom ? 'ring-2 ring-[var(--accent)]' : ''}`} aria-pressed={zoom} onClick={() => setZoom(true)}>
              {ui.result.zoomed}
            </button>
          </div>
          <h4 className="font-semibold text-sm mt-1">{ui.checks.heading}</h4>
          <Checks checks={made.checks} />
          <ul className="text-sm muted flex flex-col gap-1">
            <li>{ui.result.quality(made.quality)}</li>
            {made.padded > 0 && <li data-testid="padded-note">{ui.result.padded(formatKb(made.padded))}</li>}
            {fillPct != null && fillRule && <li className={fillPct < 80 ? 'text-[var(--warn)]' : ''}>{fillPct < 80 ? ui.result.fillLow(fillPct) : ui.result.fill(fillPct)}</li>}
            <li>{ui.result.noExif}</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            {busy ? (
              <button type="button" className="btn btn-primary" disabled>
                {ui.result.stale}
              </button>
            ) : (
              <a className="btn btn-primary" href={url} download={made.name} data-testid="download">
                ⬇ {ui.result.download}
              </a>
            )}
            {canShare && !busy && (
              <button type="button" className="btn" onClick={share}>
                {ui.result.share}
              </button>
            )}
            {next && (
              <button type="button" className="btn" onClick={next.go}>
                {next.label}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
