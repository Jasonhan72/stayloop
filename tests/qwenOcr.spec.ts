// Qwen OCR layer: PDF page-image extraction (JPEG passthrough, Flate→PNG),
// the PNG encoder, and the OCR call with model fallback — all without network.
import { afterEach, describe, expect, it, vi } from 'vitest'
import zlib from 'node:zlib'
import { PDFDocument, PDFName } from 'pdf-lib'
import { cleanOcrText, encodePng, extractPdfPageImages, ocrImageBase64, ocrPdfScan } from '@/lib/ocr/qwenOcr'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('encodePng', () => {
  it('produces a valid PNG whose IDAT inflates to filtered rows', async () => {
    const samples = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30]) // 2×2 RGB
    const png = (await encodePng(2, 2, 3, samples))!
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const dv = new DataView(png.buffer, png.byteOffset)
    expect(dv.getUint32(16)).toBe(2) // width
    expect(dv.getUint32(20)).toBe(2) // height
    expect(png[24]).toBe(8)          // bit depth
    expect(png[25]).toBe(2)          // colour type RGB
    // IDAT chunk
    const idatLen = dv.getUint32(33)
    expect(String.fromCharCode(...png.subarray(37, 41))).toBe('IDAT')
    const raw = zlib.inflateSync(Buffer.from(png.subarray(41, 41 + idatLen)))
    expect(Array.from(raw)).toEqual([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 10, 20, 30])
  })
  it('rejects short sample buffers', async () => {
    expect(await encodePng(4, 4, 3, new Uint8Array(3))).toBeNull()
  })
})

describe('extractPdfPageImages', () => {
  it('returns DCTDecode stream bytes as-is (the stream IS the JPEG) and skips tiny decorative images', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 300])
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9])
    const mk = (w: number, h: number) => doc.context.register(doc.context.stream(fakeJpeg, {
      Type: 'XObject', Subtype: 'Image', Filter: 'DCTDecode', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
    }))
    page.node.newXObject('Big', mk(1200, 1600))
    page.node.newXObject('Logo', mk(100, 50))
    const ex = await extractPdfPageImages(await doc.save())
    expect(ex.pages).toBe(1)
    expect(ex.images).toHaveLength(1)                       // the logo (100×50) is skipped
    expect(ex.images[0].mime).toBe('image/jpeg')
    expect(Array.from(ex.images[0].data)).toEqual(Array.from(fakeJpeg))
    expect(ex.images[0].width).toBe(1200)
  })
  it('wraps Flate raw RGB pixels into a PNG', async () => {
    const doc = await PDFDocument.create()
    // 200×200 RGB gradient PNG via pdf-lib → stored as FlateDecode raw samples.
    const w = 200, h = 200
    const samples = new Uint8Array(w * h * 3)
    for (let i = 0; i < w * h; i++) { samples[i * 3] = i % 255; samples[i * 3 + 1] = 80; samples[i * 3 + 2] = 200 }
    const pngIn = (await encodePng(w, h, 3, samples))!
    const img = await doc.embedPng(pngIn)
    const page = doc.addPage([400, 400])
    page.drawImage(img, { x: 0, y: 0, width: 400, height: 400 })
    const bytes = await doc.save()
    const ex = await extractPdfPageImages(bytes)
    expect(ex.error).toBeUndefined()
    expect(ex.images.length).toBe(1)
    expect(ex.images[0].mime).toBe('image/png')
    expect(ex.images[0].page).toBe(1)
    expect(Array.from(ex.images[0].data.subarray(0, 4))).toEqual([137, 80, 78, 71])
  })
  it('never throws on garbage', async () => {
    const ex = await extractPdfPageImages(new TextEncoder().encode('not a pdf'))
    expect(ex.images).toHaveLength(0)
    expect(ex.error).toMatch(/parse failed/)
  })
})

describe('ocrImageBase64 / ocrPdfScan', () => {
  it('returns null without a DashScope key', async () => {
    vi.stubEnv('DASHSCOPE_API_KEY', '')
    expect(await ocrImageBase64('AAAA', 'image/png')).toBeNull()
    expect(await ocrPdfScan(new Uint8Array([1, 2, 3]))).toBeNull()
  })
  it('falls back from the primary to the secondary model on a 4xx and returns the text', async () => {
    vi.stubEnv('DASHSCOPE_API_KEY', 'k')
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      calls.push(body.model)
      if (body.model === 'qwen3.5-ocr') return new Response('{"error":"nope"}', { status: 400 })
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Ontario Driver\'s Licence\nNAME KOVALENKO' } }] }), { status: 200 })
    }))
    const r = await ocrImageBase64('AAAA', 'image/jpeg')
    expect(calls).toEqual(['qwen3.5-ocr', 'qwen-vl-ocr-latest'])
    expect(r?.model).toBe('qwen-vl-ocr-latest')
    expect(r?.text).toContain('KOVALENKO')
  })
  it('ocrPdfScan OCRs each extracted page image and joins with page markers', async () => {
    vi.stubEnv('DASHSCOPE_API_KEY', 'k')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'PAGE TEXT' } }] }), { status: 200 })))
    const doc = await PDFDocument.create()
    const w = 600, h = 600 // page-sized (≥ 0.25 MP) → primary model first; tiny images flip to the literal fallback model
    const samples = new Uint8Array(w * h * 3).fill(120)
    const img = await doc.embedPng((await encodePng(w, h, 3, samples))!)
    for (let i = 0; i < 2; i++) doc.addPage([400, 400]).drawImage(img, { x: 0, y: 0, width: 400, height: 400 })
    const r = await ocrPdfScan(await doc.save())
    expect(r?.pages_ocred).toBe(2)
    expect(r?.pages_total).toBe(2)
    expect(r?.text).toMatch(/--- page 1 ---\nPAGE TEXT[\s\S]*--- page 2 ---\nPAGE TEXT/)
    expect(r?.model).toBe('qwen3.5-ocr')
  })
})

describe('cleanOcrText', () => {
  it('collapses a looping block and strips json scaffolding', () => {
    const block = ['9022-3908', 'CARDLIS', 'RODRIGUEZ', 'RESOLUTIONS:', 'PASSPORT:'].join('\n')
    const looped = ['14 MAY 1979', block, block, block, block, block].join('\n')
    const out = cleanOcrText(looped)
    expect(out.split('\n').filter((l) => l === 'CARDLIS')).toHaveLength(1)
    expect(out.startsWith('14 MAY 1979')).toBe(true)
    expect(cleanOcrText('```json\n[\n\n]\n```')).toBe('')
    expect(cleanOcrText('EQUIFAX\nEQUIFAX\nEQUIFAX\nEQUIFAX')).toBe('EQUIFAX\nEQUIFAX')
    expect(cleanOcrText('a\nb\nc')).toBe('a\nb\nc')
  })
})

describe('inline images (BI … ID … EI)', () => {
  it('extracts a DCT inline image from a raw content stream and skips unsupported ones', async () => {
    const { parseInlineImages } = await import('@/lib/ocr/qwenOcr')
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 0x45, 0x49, 0x20, 0xff, 0xd9]) // contains a fake "EI" inside — must not cut early
    const content = Buffer.concat([
      Buffer.from('q 600 0 0 800 0 0 cm\nBI /W 1200 /H 1600 /CS /RGB /BPC 8 /F /DCT ID '), jpeg, Buffer.from('\nEI Q\n'),
      Buffer.from('BI /W 300 /H 300 /CS /G /BPC 1 /F /CCF ID '), Buffer.from([1, 2, 3, 4]), Buffer.from('\nEI\n'),
    ])
    const ims = await parseInlineImages(new Uint8Array(content))
    expect(ims).toHaveLength(1)
    expect(ims[0].mime).toBe('image/jpeg')
    expect(ims[0].width).toBe(1200)
    expect(Array.from(ims[0].data)).toEqual(Array.from(jpeg))
    expect(parseInlineImages.lastUnsupported).toBe(1)
  })
  it('extractPdfPageImages finds inline images inside a Flate page content stream', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 300])
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])
    const content = Buffer.concat([Buffer.from('q BI /W 800 /H 600 /CS /RGB /BPC 8 /F /DCT ID '), Buffer.from(jpeg), Buffer.from('\nEI Q')])
    const zlib = await import('node:zlib')
    const ref = doc.context.register(doc.context.stream(new Uint8Array(zlib.deflateSync(content)), { Filter: 'FlateDecode' }))
    page.node.set(PDFName.of('Contents'), ref)
    const ex = await extractPdfPageImages(await doc.save())
    expect(ex.images).toHaveLength(1)
    expect(ex.images[0].page).toBe(1)
    expect(ex.images[0].mime).toBe('image/jpeg')
  })
})
