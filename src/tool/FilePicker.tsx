import { useId, useRef, useState } from 'react'
import { ui } from '../i18n/en'

interface Props {
  onFile: (f: File) => void
  hint: string
  /** Which camera "Take photo" opens on phones: front for portraits, back for paper. */
  camera: 'user' | 'environment'
  busy?: boolean
  busyText?: string
  compact?: boolean
  accept?: string
  multiple?: boolean
  onFiles?: (f: File[]) => void
  chooseLabel?: string
}

/** Choose a file, take a photo, or drop one. Real buttons, so it works with a keyboard. */
export function FilePicker({ onFile, hint, camera, busy, busyText, compact, accept = 'image/*', multiple, onFiles, chooseLabel }: Props) {
  const files = useRef<HTMLInputElement>(null)
  const cam = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const hintId = useId()

  const take = (list: FileList | null) => {
    if (!list || !list.length) return
    if (multiple && onFiles) onFiles([...list])
    else onFile(list[0])
  }

  return (
    <div
      className={`rounded-2xl border-2 border-dashed ${over ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--line)]'} ${compact ? 'p-3' : 'p-6'} flex flex-col items-center gap-3 text-center`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        take(e.dataTransfer.files)
      }}
    >
      <input
        ref={files}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="file-input"
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={cam}
        type="file"
        accept="image/*"
        capture={camera}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => files.current?.click()} aria-describedby={hint ? hintId : undefined}>
          {compact ? (chooseLabel ?? ui.picker.another) : (chooseLabel ?? ui.picker.choose)}
        </button>
        {!multiple && (
          <button type="button" className="btn" disabled={busy} onClick={() => cam.current?.click()}>
            📷 {ui.picker.camera}
          </button>
        )}
      </div>
      {!compact && <p className="text-sm muted">{ui.picker.drop}</p>}
      {busy && busyText && (
        <p className="text-sm" role="status">
          {busyText}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-sm muted max-w-md">
          {hint}
        </p>
      )}
    </div>
  )
}
