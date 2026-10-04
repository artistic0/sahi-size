import { useId, useMemo, useState } from 'react'
import { inspect, readFacts, type Check, type FileFacts } from '../engine/inspect'
import { ui } from '../i18n/en'
import { href } from '../lib/paths'
import { Checks } from './Checks'
import { FilePicker } from './FilePicker'
import { labelOf } from './target'
import type { ExamLite } from './Tool'

/** Pick a portal and a file: every rule the portal checks, what fails, and a link to fix it. */
export default function Checker({ exams }: { exams: ExamLite[] }) {
  const id = useId()
  const [examId, setExamId] = useState(exams[0].id)
  const exam = exams.find((e) => e.id === examId) ?? exams[0]
  const docs = exam.presets.filter((p) => !p.live)
  const [presetId, setPresetId] = useState(docs[0].id)
  const preset = docs.find((p) => p.id === presetId) ?? docs[0]
  const [facts, setFacts] = useState<FileFacts | null>(null)

  const checks: Check[] = useMemo(() => (facts ? inspect(facts, preset) : []), [facts, preset])
  const problems = checks.filter((c) => c.status !== 'pass').length

  return (
    <div className="flex flex-col gap-4">
      <div className="surface p-4 grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-exam`}>
          {ui.checker.pick}
          <select
            id={`${id}-exam`}
            className="field"
            value={examId}
            onChange={(e) => {
              const next = exams.find((x) => x.id === e.target.value) ?? exams[0]
              setExamId(next.id)
              setPresetId(next.presets.filter((p) => !p.live)[0].id)
            }}
          >
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-doc`}>
          Document
          <select id={`${id}-doc`} className="field" value={preset.id} onChange={(e) => setPresetId(e.target.value)}>
            {docs.map((p) => (
              <option key={p.id} value={p.id}>
                {labelOf(p)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <FilePicker
        onFile={async (f) => setFacts(readFacts(f.name, new Uint8Array(await f.arrayBuffer())))}
        hint=""
        camera="environment"
        accept="image/*,application/pdf"
        chooseLabel={ui.checker.file}
        compact={!!facts}
      />

      {facts && (
        <section className="surface p-4 flex flex-col gap-3" aria-labelledby={`${id}-r`} data-testid="checker-result">
          <h3 id={`${id}-r`} className="font-bold">
            {facts.name}
          </h3>
          <p aria-live="polite" className={problems ? 'text-[var(--bad)] font-semibold' : 'text-[var(--ok)] font-semibold'}>
            {problems ? ui.checker.issues(problems) : ui.checker.allGood}
          </p>
          <Checks checks={checks} />
          {problems > 0 && (
            <a className="btn btn-primary self-start" href={`${href(exam.slug)}#${preset.id}`}>
              {ui.checker.fix} →
            </a>
          )}
        </section>
      )}
    </div>
  )
}
