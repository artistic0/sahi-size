import { useEffect, useMemo, useRef, useState } from 'react'
import type { Preset } from '../data/types'
import type { KbRule } from '../engine/kb'
import { ui } from '../i18n/en'
import Checker from './Checker'
import { CustomTarget } from './CustomTarget'
import { ImageTool } from './ImageTool'
// Rendered on the server at full size; it loads pdf.js and pdf-lib itself, only when a PDF is used.
import PdfTool from './PdfTool'
import { labelOf, targetFromCustom, targetFromPreset, type CustomSpec } from './target'

export interface ExamLite {
  id: string
  name: string
  slug: string
  presets: Preset[]
}

export type ToolProps =
  | { mode: 'exam'; exam: ExamLite }
  | { mode: 'resize'; kb: KbRule; nameDate?: boolean; doc?: 'photo' | 'signature' }
  | { mode: 'pdf'; kb: KbRule; images?: boolean }
  | { mode: 'check'; exams: ExamLite[] }

/** The one interactive island on every page. */
export default function Tool(props: ToolProps) {
  return (
    <div className="flex flex-col gap-4" data-testid="tool">
      {props.mode === 'exam' && <ExamTool exam={props.exam} />}
      {props.mode === 'resize' && <ResizeTool kb={props.kb} nameDate={props.nameDate} doc={props.doc} />}
      {props.mode === 'pdf' && <PdfTool kb={props.kb} prefix="document" imagesFirst={props.images} />}
      {props.mode === 'check' && <Checker exams={props.exams} />}
    </div>
  )
}

function ExamTool({ exam }: { exam: ExamLite }) {
  const usable = exam.presets
  const [active, setActive] = useState(() => usable.find((p) => !p.live)?.id ?? usable[0].id)
  // Panels stay mounted once opened, so switching tabs never loses work.
  const [opened, setOpened] = useState<string[]>(() => [active])
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({})

  const select = (id: string, focus = true) => {
    setActive(id)
    setOpened((o) => (o.includes(id) ? o : [...o, id]))
    if (focus) tabs.current[id]?.focus()
  }

  // "#ibps-signature" (the checker's "Fix it now" link) opens that tab. After hydration, so the
  // server-rendered markup and the first client render agree.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (usable.some((p) => p.id === id && !p.live)) select(id, false)
  }, [])
  const onKey = (e: React.KeyboardEvent) => {
    const i = usable.findIndex((p) => p.id === active)
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? usable.length - 1 : null
    if (to == null) return
    e.preventDefault()
    select(usable[(to + usable.length) % usable.length].id)
  }

  return (
    <>
      <div role="tablist" aria-label={`${exam.name} documents`} className="flex gap-2 overflow-x-auto pb-1" onKeyDown={onKey}>
        {usable.map((p) => (
          <button
            key={p.id}
            ref={(el) => {
              tabs.current[p.id] = el
            }}
            role="tab"
            type="button"
            id={`tab-${p.id}`}
            aria-selected={p.id === active}
            aria-controls={`panel-${p.id}`}
            tabIndex={p.id === active ? 0 : -1}
            className={`btn shrink-0 ${p.id === active ? 'btn-primary' : ''}`}
            onClick={() => select(p.id, false)}
          >
            {labelOf(p)}
          </button>
        ))}
      </div>
      {usable
        .filter((p) => opened.includes(p.id))
        .map((preset) => {
          const nextPreset = usable.slice(usable.indexOf(preset) + 1).find((p) => !p.live)
          return (
            <div role="tabpanel" id={`panel-${preset.id}`} aria-labelledby={`tab-${preset.id}`} key={preset.id} hidden={preset.id !== active}>
              {preset.live ? (
                <p className="surface p-4">{ui.live}</p>
              ) : preset.format === 'pdf' ? (
                <PdfTool kb={preset.kb} prefix={exam.id} preset={preset} />
              ) : (
                <ImageTool
                  target={targetFromPreset(preset)}
                  prefix={exam.id}
                  next={nextPreset ? { label: ui.result.next(labelOf(nextPreset)), go: () => select(nextPreset.id) } : undefined}
                />
              )}
            </div>
          )
        })}
    </>
  )
}

function ResizeTool({ kb, nameDate, doc = 'photo' }: { kb: KbRule; nameDate?: boolean; doc?: 'photo' | 'signature' }) {
  const [spec, setSpec] = useState<CustomSpec>({
    doc,
    minKb: kb.min ? String(kb.min) : '',
    maxKb: String(kb.max),
    width: nameDate ? '276' : '',
    height: nameDate ? '354' : '',
    dpi: nameDate ? '200' : '',
  })
  const target = useMemo(() => targetFromCustom(spec), [spec])
  const ok = 'preset' in target ? target : null
  return (
    <div className="flex flex-col gap-4">
      <CustomTarget spec={spec} onChange={setSpec} />
      {!ok && (
        <p role="alert" className="text-[var(--bad)]">
          {'error' in target ? target.error : ''}
        </p>
      )}
      <ImageTool key={spec.doc} target={ok} prefix="image" allowNameDate={spec.doc === 'photo'} nameDateDefault={!!nameDate} />
    </div>
  )
}
