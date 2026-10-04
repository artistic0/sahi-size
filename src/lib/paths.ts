/** Site paths honour the base (the site lives at /sahi-size/ on GitHub Pages). */
export const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/')

/** A page URL from its slug: "" → "/sahi-size/", "privacy" → "/sahi-size/privacy/". */
export function href(slug = ''): string {
  const s = slug.replace(/^\/+|\/+$/g, '')
  return s ? `${BASE}${s}/` : BASE
}

/** A static file URL: "favicon.svg" → "/sahi-size/favicon.svg". */
export function asset(path: string): string {
  return `${BASE}${path.replace(/^\/+/, '')}`
}

export const REPO_URL = 'https://github.com/artistic0/sahi-size'
export const REPORT_URL = `${REPO_URL}/issues/new?labels=rule-change&title=Rule%20change%3A%20`
