import type { KbRule } from '../engine/kb'

/** The generic tool pages. Each one has its own copy in src/i18n/en.ts (pages.generic). */
export type GenericPage =
  | { slug: string; kind: 'resize'; kb: KbRule }
  | { slug: string; kind: 'increase'; kb: KbRule }
  | { slug: string; kind: 'nameDate'; kb: KbRule }
  | { slug: string; kind: 'pdf'; kb: KbRule }
  | { slug: string; kind: 'imagesToPdf'; kb: KbRule }
  | { slug: string; kind: 'check' }

export const RESIZE_KB = [10, 20, 50, 100, 200]
export const PDF_KB = [100, 200, 300, 500, 1000]

export const GENERIC: GenericPage[] = [
  ...RESIZE_KB.map((kb): GenericPage => ({ slug: `resize-image-to-${kb}kb`, kind: 'resize', kb: { max: kb } })),
  { slug: 'increase-image-size-in-kb', kind: 'increase', kb: { min: 20, max: 50 } },
  { slug: 'photo-with-name-and-date', kind: 'nameDate', kb: { min: 20, max: 50 } },
  ...PDF_KB.map((kb): GenericPage => ({ slug: kb >= 1000 ? `compress-pdf-to-${kb / 1000}mb` : `compress-pdf-to-${kb}kb`, kind: 'pdf', kb: { max: kb } })),
  { slug: 'images-to-pdf', kind: 'imagesToPdf', kb: { max: 200 } },
  { slug: 'check-photo-size', kind: 'check' },
]
