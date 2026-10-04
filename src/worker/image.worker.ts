/// <reference lib="webworker" />
// Image engine worker. Network APIs are removed first (see lockdownCore.ts).
import './lockdown'
import * as Comlink from 'comlink'
import { createEngine, offscreenPlatform, type RenderJob } from '../lib/engine'
import type { Raster } from '../engine/raster'

const engine = createEngine(offscreenPlatform)

const api = {
  async open(file: Blob) {
    const info = await engine.open(file)
    return Comlink.transfer(info, [info.preview])
  },
  async render(job: RenderJob) {
    const r = await engine.render(job)
    return r.ok ? Comlink.transfer(r, [r.bytes.buffer]) : r
  },
  findInk: engine.findInk,
  async encodePage(page: Raster, maxBytes: number, dpi?: number) {
    const r = await engine.encodePage(page, maxBytes, dpi)
    return r ? Comlink.transfer(r, [r.bytes.buffer]) : r
  },
  async encodeSource(source: number, rotate: number, maxSide: number, gray: boolean, maxBytes: number) {
    const r = await engine.encodeSource(source, rotate, maxSide, gray, maxBytes)
    return r ? Comlink.transfer(r, [r.bytes.buffer]) : r
  },
  release: engine.release,
}

export type ImageWorkerApi = typeof api

Comlink.expose(api)
