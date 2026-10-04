import { describe, expect, it } from 'vitest'
import type { Preset } from '../../src/data/types'
import { filenameProblems, inspect, readFacts } from '../../src/engine/inspect'
import { padTo, setJfifDpi, withExifOrientation } from '../../src/engine/jpeg'
import { resize } from '../../src/engine/resample'
import { encodeJpeg, encodePng, photoRaster } from './helpers'

const photo: Preset = { id: 'ibps-photo', doc: 'photo', format: 'jpeg', kb: { min: 20, max: 50 }, px: { w: 200, h: 230 }, source: null }
const status = (checks: ReturnType<typeof inspect>) => Object.fromEntries(checks.map((c) => [c.id, c.status]))

describe('the checker', () => {
  const good = padTo(setJfifDpi(encodeJpeg(resize(photoRaster(400, 460), 200, 230), 92), 200), 30_000)

  it('passes a file that meets every rule', () => {
    const s = status(inspect(readFacts('photo.jpg', good), photo))
    expect(s).toMatchObject({ format: 'pass', size: 'pass', dims: 'pass', filename: 'pass' })
  })

  it('catches a PNG renamed to .jpg', () => {
    const png = encodePng(resize(photoRaster(400, 460), 200, 230))
    const checks = inspect(readFacts('photo.jpg', png), photo)
    expect(status(checks).format).toBe('fail')
    expect(checks.find((c) => c.id === 'format')?.params).toMatchObject({ kind: 'PNG', want: 'JPG' })
    expect(status(checks).filename).toBe('warn') // .jpg on a PNG
  })

  it('fails the size and the dimensions when they are wrong', () => {
    const big = padTo(good, 80_000)
    expect(status(inspect(readFacts('photo.jpg', big), photo)).size).toBe('fail')
    const wrong = encodeJpeg(resize(photoRaster(400, 460), 210, 230), 92)
    expect(status(inspect(readFacts('photo.jpg', wrong), photo)).dims).toBe('fail')
  })

  it('warns when the size only passes under one meaning of KB', () => {
    expect(status(inspect(readFacts('photo.jpg', padTo(good, 50_500)), photo)).size).toBe('warn')
  })

  it('warns about EXIF rotation and reads the size as a viewer shows it', () => {
    const rotated = withExifOrientation(encodeJpeg(resize(photoRaster(400, 460), 230, 200), 90), 6)
    const facts = readFacts('photo.jpg', rotated)
    expect([facts.width, facts.height]).toEqual([200, 230])
    expect(status(inspect(facts, photo)).orientation).toBe('warn')
  })

  it('lists file-name problems', () => {
    expect(filenameProblems('my photo (1).jpg.jpg', 'jpeg')).toEqual(['spaces', 'special', 'double-ext'])
    expect(filenameProblems('photo.jpeg', 'jpeg', 'photo')).toEqual([])
    expect(filenameProblems('IMG_2041.jpg', 'jpeg', 'photo')).toEqual(['name'])
    expect(filenameProblems('scan.pdf', 'jpeg')).toEqual(['wrong-ext'])
  })

  it('flags password-protected PDFs', () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<</Root 1 0 R/Encrypt 5 0 R>>\n%%EOF')
    const preset: Preset = { id: 'x-pdf', doc: 'document', format: 'pdf', kb: { max: 200 }, source: null }
    expect(status(inspect(readFacts('aadhaar.pdf', pdf), preset)).encrypted).toBe('fail')
  })
})
