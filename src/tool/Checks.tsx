import type { Check } from '../engine/inspect'
import { ui } from '../i18n/en'

const ICON = { pass: '✓', warn: '!', fail: '✗' } as const
const COLOUR = { pass: 'text-[var(--ok)]', warn: 'text-[var(--warn)]', fail: 'text-[var(--bad)]' } as const
const WORD = { pass: 'Passes', warn: 'Warning', fail: 'Fails' } as const

/** The checklist a portal would apply, in plain words. */
export function Checks({ checks }: { checks: Check[] }) {
  return (
    <ul className="flex flex-col gap-1.5" data-testid="checks">
      {checks.map((c) => {
        const text = ui.checks[c.id]?.[c.status]?.(c.params) ?? c.id
        return (
          <li key={c.id} className="flex gap-2 items-start" data-check={c.id} data-status={c.status}>
            <span className={`font-bold w-4 shrink-0 text-center ${COLOUR[c.status]}`} aria-hidden="true">
              {ICON[c.status]}
            </span>
            <span>
              <span className="sr-only">{WORD[c.status]}: </span>
              {text}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
