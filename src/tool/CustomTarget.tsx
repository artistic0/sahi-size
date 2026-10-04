import { useId } from 'react'
import type { DocKind } from '../data/types'
import { ui } from '../i18n/en'
import type { CustomSpec } from './target'

interface Props {
  spec: CustomSpec
  onChange: (s: CustomSpec) => void
}

const KINDS: { doc: DocKind; label: string }[] = [
  { doc: 'photo', label: 'Photo' },
  { doc: 'signature', label: 'Signature (clean up)' },
  { doc: 'document', label: 'Document scan' },
]

/** The target typed in by hand on the generic "resize to N KB" pages. */
export function CustomTarget({ spec, onChange }: Props) {
  const id = useId()
  const field = (key: keyof CustomSpec, label: string, optional = true) => (
    <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-${key}`}>
      <span>
        {label} {optional && <span className="muted">({ui.custom.optional})</span>}
      </span>
      <input
        id={`${id}-${key}`}
        className="field"
        inputMode="numeric"
        value={spec[key]}
        onChange={(e) => onChange({ ...spec, [key]: e.target.value.replace(/[^\d.]/g, '') })}
        data-testid={`custom-${key}`}
      />
    </label>
  )
  return (
    <fieldset className="surface p-4 flex flex-col gap-3">
      <legend className="font-bold px-1">{ui.custom.title}</legend>
      <div role="radiogroup" aria-label="What is it?" className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <label key={k.doc} className={`chip cursor-pointer min-h-9 ${spec.doc === k.doc ? 'ring-2 ring-[var(--accent)]' : ''}`}>
            <input type="radio" name={`${id}-doc`} className="sr-only" checked={spec.doc === k.doc} onChange={() => onChange({ ...spec, doc: k.doc })} />
            {k.label}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('minKb', ui.custom.minKb)}
        {field('maxKb', ui.custom.maxKb, false)}
        {field('width', ui.custom.width)}
        {field('height', ui.custom.height)}
        {field('dpi', ui.custom.dpi)}
      </div>
      <p className="text-sm muted">{ui.custom.keepSize}</p>
    </fieldset>
  )
}
