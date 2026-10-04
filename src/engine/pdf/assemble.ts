import { PDFDocument, PDFName } from '@cantoo/pdf-lib'

/**
 * Writing PDFs with pdf-lib. No metadata is set (no producer, no dates), so the file says nothing
 * about how or when it was made.
 */
export interface JpegPage {
  bytes: Uint8Array
  /** Page size in PDF points (1/72 inch). */
  widthPt: number
  heightPt: number
}

/** One JPEG per page, each filling its page. JPEG data is embedded as-is (no re-encoding). */
export async function assemblePdf(pages: JpegPage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false })
  for (const p of pages) {
    const img = await doc.embedJpg(p.bytes)
    const page = doc.addPage([p.widthPt, p.heightPt])
    page.drawImage(img, { x: 0, y: 0, width: p.widthPt, height: p.heightPt })
  }
  return doc.save({ useObjectStreams: true })
}

/**
 * Lossless re-save: copy every page into a fresh document. Drops unused objects and old
 * revisions, packs the rest into object streams, and keeps text as text.
 */
export async function resavePdf(bytes: Uint8Array): Promise<{ bytes: Uint8Array; pages: number }> {
  const src = await PDFDocument.load(bytes, { updateMetadata: false })
  const out = await PDFDocument.create({ updateMetadata: false })
  const copied = await out.copyPages(src, src.getPageIndices())
  for (const p of copied) out.addPage(p)
  return { bytes: await out.save({ useObjectStreams: true }), pages: copied.length }
}

function xmpPacket(padding: number): Uint8Array {
  // The begin attribute holds a byte-order mark (UTF-8: EF BB BF), as the XMP spec asks.
  const head =
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>\n'
  const tail = '\n<?xpacket end="w"?>'
  // XMP reserves whitespace padding inside the packet for exactly this kind of growth.
  const line = `${' '.repeat(99)}\n`
  const n = Math.max(0, padding)
  return new TextEncoder().encode(head + line.repeat(Math.floor(n / 100)) + ' '.repeat(n % 100) + tail)
}

/**
 * Grow a PDF to at least `target` bytes with an XMP metadata packet full of whitespace padding,
 * for forms with a minimum size. Pages are untouched.
 */
export async function padPdf(bytes: Uint8Array, target: number): Promise<Uint8Array> {
  if (bytes.length >= target) return bytes
  let padding = target - bytes.length
  let out = bytes
  for (let attempt = 0; attempt < 4 && out.length < target; attempt++) {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    const stream = doc.context.stream(xmpPacket(padding), { Type: 'Metadata', Subtype: 'XML' })
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream))
    out = await doc.save({ useObjectStreams: true })
    padding += target - out.length + 8
  }
  return out
}
