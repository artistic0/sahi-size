# SahiSize

**Photo, signature and PDF at the exact size your exam or government form wants. Nothing is uploaded.**

Exam and government portals reject uploads that miss rules like “photo 200 × 230 px, 20–50 KB” or “PDF under 200 KB”. SahiSize makes files that pass, entirely in the browser:

- **Photo:** crop to the exact shape, brighten, resize to exact pixels, then the best JPEG quality inside the KB range. DPI is written in, and an optional name and date can go underneath.
- **Signature, thumb impression, handwritten declaration:** take a phone photo of the paper. The shadows go, the paper turns white and the ink becomes even. It is trimmed so the ink fills the box, then sized and brought inside the KB range, including reaching a minimum like 10 KB.
- **PDF:**
  - photos to one PDF, or an existing PDF made smaller, under a limit
  - password-protected PDFs (e-Aadhaar) are opened with your password and saved without one
  - a PDF that already fits is left alone; text is kept if a lossless re-save fits
- **Checker:** pick a portal and a file. It shows the real file type, KB under both meanings of “KB”, pixels, DPI, CMYK, EXIF rotation and file-name problems, with a link to fix them.

Ten exams and forms (IBPS, SBI, SSC, UPSC, RRB, NEET UG, JEE Main, CUET UG, Passport Seva, PAN) plus generic “resize to N KB” and “compress PDF to N KB” pages.

## The rules, and where they come from

The presets live in `src/data/exams.ts` and are numbers only; the words are in `src/i18n/en.ts`.

- **Every preset cites the official notice it was checked against, and the date.** Checking found several widely quoted numbers to be wrong:
  - NEET, JEE Main and CUET signatures are not 4–30 KB
  - RRB's signature is 30–49 KB and its photo is captured live
- **Partial rules are labelled "partly checked".** Where only part of a rule could be confirmed (UPSC's KB limits, Passport Seva's KB limit), the site says so.
- **Approximate sizes warn instead of failing.** Where a notice says “preferred” or “about”, a different pixel size gets a warning in the checker, not a failure.
- **`npm run presets:check` keeps the data and text honest:**
  - it fails on broken data
  - it fails on any KB range in a page's text that no preset of that exam has
  - it lists rules that are unverified, partly verified or older than 120 days

**To update a rule:**
1. Read the new notice.
2. Change the numbers and the `source` (title, URL, today's date) in `exams.ts`.
3. Adjust the page text if it mentions the old numbers.
4. Run `npm run presets:check && npm test`.

## The privacy promise, and how it's enforced

| Layer | What it does |
|---|---|
| No backend | A static site. There is no server-side code, upload endpoint or database. |
| CSP `connect-src 'none'` | Astro writes the policy into every page as a `<meta>` tag, with hashes for its own inline loader. The browser then blocks every fetch, XHR, WebSocket and beacon, even to this site. The source of truth is `src/security.ts`, and the Privacy page shows the policy and has a “try to send data” button. |
| Worker lockdown | Workers don't inherit the page's `<meta>` policy. Each worker therefore deletes its network functions before any library runs:<br>• `src/worker/lockdown.ts` removes all of them<br>• `src/worker/lockdownPdf.ts`, for pdf.js, allows only plain same-origin GETs of its own decoder files under `pdfjs/` |
| Lint | `oxlint` fails on `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `WebTransport` in `src/`. |
| Tests | Playwright makes a photo, a signature and a PDF while offline. It asserts that every request is a plain same-origin GET for site code, that none carries a body, and that there are zero CSP violations. Unit tests cover the lockdown. |
| Clean output | Files carry no EXIF or GPS. PDFs carry no producer or dates. |
| Offline | `integrations/privacy.ts` generates a service worker. Pages are network-first so rules stay fresh; code is cache-first. After one visit the tool works in airplane mode. |
| Nothing stored | No cookies, no localStorage, no analytics. Measurement is Google Search Console only. |

## Run it

```bash
npm install
npm run dev        # http://localhost:4320/sahi-size/ (no CSP in dev)
npm run build      # type-check (astro check) + static build into dist/
npm run preview    # http://localhost:4329/sahi-size/, served like GitHub Pages (sub-path, no headers, gzip)
```

## Tests

```bash
npm test               # Vitest: KB window, JPEG headers and padding, resampling, EXIF, signature cleanup,
                       # size search, checker, PDF assembly/padding/budget, presets, worker lockdown
npm run lint
npm run presets:check
npm run e2e            # Playwright against the built site (run npm run build first)
npm run screens        # screenshots of the main states (phone, dark, desktop) into test-results/screens/
```

**What `npm run e2e` covers:**
- every image preset of every exam
- the KB window and pixels in Chromium and WebKit, plus Firefox in CI
- the offline privacy runs
- per page: titles, descriptions, canonicals, JSON-LD
- links: no broken internal links and no orphan pages
- axe accessibility
- a phone viewport
- adversarial cases:
  - fast target changes, so a download never contains a stale result
  - a transparent PNG signature
  - a 24 MP sideways phone photo
  - a tiny photo
  - a PNG renamed to `.jpg`
  - HEIC
  - an impossible target
  - a keyboard-only crop
  - a password PDF, wrong password then right
  - a 20-page scan under 200 KB

**Firefox on Windows:** Playwright's Firefox needs the Microsoft Visual C++ runtime, so locally it only runs with `FIREFOX=1`. CI always runs it.

## How it works

The engine is hand-written TypeScript in `src/engine/` and runs in Node too, so every step is unit-tested:

| File | What it does |
|---|---|
| `sniff.ts` | Real file type from magic bytes. |
| `kb.ts` | Targets at least min × 1024 and at most max × 1000 bytes, so either meaning of KB passes. |
| `jpeg.ts` | Marker parsing, JFIF DPI, EXIF stripping, padding with comment segments. |
| `resample.ts` | Streaming area-average resize, the same in every browser. |
| `enhance.ts` | Auto-levels, EXIF orientations, crop. |
| `ink.ts` | Background flattening, Otsu threshold, speck removal, trim. |
| `fit.ts` | Binary search on JPEG quality, smaller accepted sizes, padding to a minimum. |
| `inspect.ts` | The checker. |
| `pdf/assemble.ts` | pdf-lib PDF writing, lossless re-save and XMP padding. |
| `pdf/build.ts` | Shared per-page byte budget with a DPI ladder. |

**What runs where:**
- `src/lib/engine.ts` runs the pipeline in a worker with OffscreenCanvas, or on the main thread in old browsers.
- `src/tool/` is the React island.
- The pages are Astro, generated from the data.

The site's [How it works](https://artistic0.github.io/sahi-size/how-it-works/) page explains it for everyone.

## SEO

- **Pages:** one static page per exam and per generic tool, all generated from `src/data`. Each has:
  - a unique title and description
  - a canonical URL
  - JSON-LD (WebApplication, BreadcrumbList, and FAQPage on exam pages)
  - a sitemap entry, with `lastmod` taken from the newest verified date
- **Linking:** every page links every other page through the footer, so no page is an orphan.
- **Lighthouse** (mobile, gzip as GitHub Pages serves it): performance 99–100, accessibility 100, best practices 100, SEO 92.
  - The SEO points are lost only for robots.txt. On `artistic0.github.io/sahi-size/` crawlers read robots.txt at the host root, which this repo doesn't control. That comes with an own domain.
- **Search Console:**
  1. Add a URL-prefix property for `https://artistic0.github.io/sahi-size/`.
  2. Choose the HTML-tag method.
  3. Put the token in the repo variable `GOOGLE_SITE_VERIFICATION`, then redeploy.
  4. Submit `sitemap-index.xml`.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` runs on every push to `main`. If anything fails, nothing is deployed. It runs, in order:
1. unit tests
2. lint
3. presets check
4. build with `BASE_PATH=/<repo>/`
5. a CSP check on every page
6. all end-to-end tests
7. deploy

**One-time setup:** repo Settings → Pages → Source: **GitHub Actions**.

**For an own domain later:** build with `SITE_URL=https://example.in BASE_PATH=/`, add a `CNAME`, and GitHub redirects the old github.io links.

## Not yet

- Hindi pages: the text is already in one dictionary, so a `hi` version slots in.
- Background whitening and face-coverage checks (they need on-device ML models).
- HEIC decoding (today: clear instructions instead).
- 4-corner document "scan" crop.
- More exams (GATE, CTET, state PSCs), chosen from Search Console data.

SahiSize is independent and not connected to any government body, exam board or bank.
