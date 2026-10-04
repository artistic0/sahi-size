// pdf.js worker variant: only same-origin GETs for its own decoder files under <base>pdfjs/.
import { applyLockdown } from './lockdownCore'

const prefix = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}pdfjs/`
applyLockdown((url) => url.pathname.startsWith(prefix) && !url.search)
