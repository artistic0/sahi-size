import type { Accept, PxSpec } from '../engine/dims'
import type { KbRule } from '../engine/kb'

/** Which tool a document needs. */
export type DocKind = 'photo' | 'signature' | 'thumb' | 'declaration' | 'document'

export type ExamCategory = 'banking' | 'ssc' | 'upsc' | 'railways' | 'entrance' | 'identity'

/** Where a rule comes from. `verifiedOn` is the day someone checked it against the official text. */
export interface Source {
  title: string
  url: string
  verifiedOn: string
  /** Something worth knowing about this rule (shown next to the source). */
  note?: string
  /** Only part of the rule could be checked against this source; `note` says which part. */
  partial?: boolean
}

export interface Preset {
  /** Unique, e.g. "ibps-photo". Also the key for its text in src/i18n/en.ts. */
  id: string
  doc: DocKind
  format: 'jpeg' | 'pdf'
  kb: KbRule
  /** The pixel size we produce. */
  px?: PxSpec
  /** The pixel sizes the portal accepts, when it gives a range. Without it, `px` is exact. */
  accept?: Accept
  /**
   * The notice calls the pixel size "preferred" or "about", or gives none (we picked a sensible
   * one). The checker then warns about a different size instead of failing it.
   */
  approx?: boolean
  /** Written into the file's header. */
  dpi?: number
  /** UPSC asks for three signatures, one below the other, in one image. */
  multi?: 3
  /** File name some portals insist on, e.g. "photo". */
  filename?: string
  /** Captured live inside the application form: nothing to upload, so no tool, only guidance. */
  live?: boolean
  /** The official notice this was checked against; null = not yet verified (shown as such). */
  source: Source | null
}

export interface Exam {
  /** e.g. "ibps"; key for its text in src/i18n/en.ts. */
  id: string
  /** URL segment, e.g. "ibps-photo-signature-size". */
  slug: string
  /** Short name, e.g. "IBPS". */
  name: string
  category: ExamCategory
  presets: Preset[]
  /** Other exam ids to link to. */
  related: string[]
}
