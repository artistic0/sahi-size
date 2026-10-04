import { describe, expect, it } from 'vitest'
import { EXAMS } from '../../src/data/exams'
import { validatePresets } from '../../src/data/validate'

describe('preset data', () => {
  it('has no errors, and the page text agrees with the numbers', () => {
    expect(validatePresets(new Date('2026-10-04')).errors).toEqual([])
  })

  it('catches page text that drifted from the data', () => {
    const neet = EXAMS.find((e) => e.id === 'neet')!
    const sig = neet.presets.find((p) => p.id === 'neet-signature')!
    const before = sig.kb
    sig.kb = { min: 4, max: 30 }
    try {
      expect(validatePresets().errors.some((e) => e.includes('10–100 KB') || e.includes('10 KB and 100 KB'))).toBe(true)
    } finally {
      sig.kb = before
    }
  })

  it('flags checks that are getting old', () => {
    const { warnings } = validatePresets(new Date('2027-06-01'))
    expect(warnings.some((w) => w.includes('days ago'))).toBe(true)
  })
})
