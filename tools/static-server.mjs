// Minimal static server that behaves like GitHub Pages for this site: serves dist/ under a sub-path,
// sends NO security headers (so tests prove the in-page protections alone), redirects directory
// URLs to their trailing-slash form, gzips text files and answers unknown paths with 404.html.
// Usage: node tools/static-server.mjs <port> <base>   e.g. 4329 /sahi-size/
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { createGzip } from 'node:zlib'

const port = Number(process.argv[2] ?? 4329)
const base = process.argv[3] ?? '/sahi-size/'
const root = join(process.cwd(), 'dist')
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pfb': 'application/octet-stream',
  '.bcmap': 'application/octet-stream',
  '.icc': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}

// Like GitHub Pages: text files are gzipped when the browser accepts it.
const compressible = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.xml', '.txt', '.webmanifest'])

function send(req, res, status, file) {
  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }
  const gzip = compressible.has(extname(file)) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  if (gzip) headers['Content-Encoding'] = 'gzip'
  res.writeHead(status, headers)
  const stream = createReadStream(file)
  ;(gzip ? stream.pipe(createGzip()) : stream).pipe(res)
}

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  const notFound = () => {
    const page = join(root, '404.html')
    if (existsSync(page)) send(req, res, 404, page)
    else res.writeHead(404).end('Not found')
  }
  if (!url.startsWith(base)) return notFound()
  let file = normalize(join(root, url.slice(base.length)))
  if (!file.startsWith(root)) return res.writeHead(403).end()
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.endsWith('/')) return res.writeHead(301, { Location: `${url}/` }).end()
    file = join(file, 'index.html')
  }
  if (!existsSync(file)) return notFound()
  send(req, res, 200, file)
}).listen(port, () => console.log(`static (GitHub Pages-like) on http://localhost:${port}${base}`))
