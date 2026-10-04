import { EXAMS } from './exams'

/** Sitemap lastmod: the newest "verified on" date of an exam page's presets, else the build date. */
export function lastModified(url: string): string {
  const path = new URL(url).pathname
  const exam = EXAMS.find((e) => path.endsWith(`/${e.slug}/`))
  const dates = exam?.presets.map((p) => p.source?.verifiedOn).filter((d): d is string => !!d) ?? []
  return dates.length ? dates.sort().at(-1)! : new Date().toISOString().slice(0, 10)
}
