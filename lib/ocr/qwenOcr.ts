// -----------------------------------------------------------------------------
// Qwen OCR layer (SERVER-ONLY, edge-safe) — 2026-08-22
//
// Dedicated OCR for scanned PDFs and document images via 阿里云百炼
// (DASHSCOPE_API_KEY — already configured for the Qwen chat models):
//   primary  qwen3.5-ocr          (measured: Ontario DL photo → every field,
//                                  bilingual labels, numbers intact, ~6s)
//   fallback qwen-vl-ocr-latest
//
// The OCR models take IMAGES only. Scanned PDFs are handled by pulling the
// page images straight out of the PDF (no rasteriser exists on the edge):
//   • image XObjects:  DCTDecode → the stream IS a JPEG, sent as-is;
//                      FlateDecode raw pixels (8-bit Gray/RGB) → wrapped into
//                      a PNG here
//   • inline images (BI … ID … EI inside content streams — how some scanner /
//     print drivers emit page scans; seen on an 18-page Equifax scan) → same
//     two encodings, parsed out of the (inflated) content stream
//   • JPX / CCITT / JBIG2 / other, and pages drawn as vector outlines (text
//     converted to paths) → reported as unsupported (caller says
//     "unreadable" instead of guessing)
// Encrypted PDFs (empty user password) are decrypted with the forensics
// standard-security-handler code before the streams are read.
//
// Consumers:
//   • lib/llmChat.ts pdfInput='text' strategy — scanned PDFs become OCR text
//     for providers that cannot ingest PDFs (Kimi / Qwen 3.7 / custom).
//   • (forensics keeps its own vision-model OCR for structured extraction;
//     this layer is plain text recovery.)
// Cost guard: at most OCR_MAX_PAGES page images per PDF, concurrency 3.
// -----------------------------------------------------------------------------
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFNumber, PDFRawStream, PDFRef, type PDFObject } from 'pdf-lib'
import { findEncryptInfos, computeFileKey, decryptObjectBytes } from '../forensics/pdf-decrypt'

export const OCR_MODEL_PRIMARY = 'qwen3.5-ocr'
export const OCR_MODEL_FALLBACK = 'qwen-vl-ocr-latest'
export const OCR_MAX_PAGES = 12
const OCR_MAX_IMAGE_BYTES = 9 * 1024 * 1024
const OCR_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const OCR_PROMPT = 'Read all the text in the image. Preserve the reading order and line breaks; keep tables as rows with cells separated by " | ". Output plain text only — no commentary, no markdown fences.'

export function ocrAvailable(): boolean {
  return !!(process.env.DASHSCOPE_API_KEY || '').trim()
}

export interface PdfPageImage {
  page: number            // 1-based
  mime: 'image/jpeg' | 'image/png'
  data: Uint8Array
  width?: number
  height?: number
  /** Object ref "num/gen" when known — the same image reused on several pages is OCR'd once. */
  ref?: string
}

export interface PdfImageExtraction {
  images: PdfPageImage[]
  pages: number
  /** Image XObjects seen but not convertible (JPX/CCITT/JBIG2/odd colour spaces). */
  unsupported: number
  encrypted: boolean
  error?: string
}

// ── OCR call ─────────────────────────────────────────────────────────────────

export async function ocrImageBase64(
  b64: string,
  mime: string,
  opts: { signal?: AbortSignal; model?: string; pixels?: number } = {},
): Promise<{ text: string; model: string } | null> {
  const key = (process.env.DASHSCOPE_API_KEY || '').trim()
  if (!key) return null
  // Small images (ID-card thumbnails, < ~0.25 MP): qwen3.5-ocr hallucinates
  // fields on them (measured on a 274×461 PR-card scan: invented dates and
  // an "Issuing Authority"), while qwen-vl-ocr-latest stays literal — so the
  // order flips for small inputs. Large page scans: qwen3.5-ocr is better.
  const small = typeof opts.pixels === 'number' && opts.pixels > 0 && opts.pixels < 250_000
  const models = opts.model ? [opts.model] : small ? [OCR_MODEL_FALLBACK, OCR_MODEL_PRIMARY] : [OCR_MODEL_PRIMARY, OCR_MODEL_FALLBACK]
  for (const model of models) {
    try {
      const res = await fetch(OCR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          max_tokens: 6000,
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
            { type: 'text', text: OCR_PROMPT },
          ] }],
        }),
        signal: opts.signal ?? AbortSignal.timeout(60_000),
      })
      if (!res.ok) {
        // Model-level 4xx (unknown model / no access) → try the fallback; other errors too.
        const body = await res.text().catch(() => '')
        console.warn('[qwen-ocr]', model, 'HTTP', res.status, body.slice(0, 160))
        continue
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const text = cleanOcrText(data.choices?.[0]?.message?.content || '')
      if (text) return { text, model }
    } catch (e) {
      // network / timeout → try next
      console.warn('[qwen-ocr]', model, 'failed:', (e as Error)?.message?.slice(0, 160) || e)
    }
  }
  return null
}

/**
 * OCR output hygiene (exported for tests):
 *   • strips code fences and empty JSON scaffolding the model sometimes emits
 *     for non-text images (logos) → ''.
 *   • collapses degenerate repetition: OCR models can loop, re-emitting the
 *     same block of lines dozens of times (seen on a small PR-card scan).
 *     When a block of ≥3 lines repeats ≥3 times back-to-back, keep one copy.
 *   • collapses >2 identical consecutive lines to 2.
 */
export function cleanOcrText(raw: string): string {
  let t = raw.replace(/```[a-z]*\n?/gi, '').trim()
  if (!t) return ''
  if (/^[\[\]{}\s,:"]*$/.test(t)) return ''
  const lines = t.split('\n').map((l) => l.replace(/\s+$/, ''))
  // Block repetition: find a period p (3..60) where lines[i] === lines[i+p] holds
  // for ≥ 2p lines from some start; cut after the first period at that start.
  const n = lines.length
  for (let p = 3; p <= Math.min(60, Math.floor(n / 3)); p++) {
    for (let start = 0; start + 3 * p <= n; start++) {
      let ok = true
      for (let k = 0; k < 2 * p && ok; k++) if (lines[start + k] !== lines[start + k + p]) ok = false
      if (ok) {
        // Extend: how far does the periodicity run?
        let end = start + 3 * p
        while (end < n && lines[end] === lines[end - p]) end++
        const keep = [...lines.slice(0, start + p), ...lines.slice(end)]
        return cleanOcrText(keep.join('\n'))
      }
    }
  }
  const out: string[] = []
  for (const l of lines) {
    const m = out.length
    if (m >= 2 && out[m - 1] === l && out[m - 2] === l) continue
    out.push(l)
  }
  return out.join('\n').trim()
}

// ── PDF page-image extraction ────────────────────────────────────────────────

function nameOf(o: PDFObject | undefined): string | null {
  return o instanceof PDFName ? o.decodeText() : null
}
function numOf(o: PDFObject | undefined): number | null {
  return o instanceof PDFNumber ? o.asNumber() : null
}
function filtersOf(dict: PDFDict, ctx: PDFDocument['context']): string[] {
  const f = dict.get(PDFName.of('Filter'))
  const resolved = f instanceof PDFRef ? ctx.lookup(f) : f
  if (resolved instanceof PDFName) return [resolved.decodeText()]
  if (resolved instanceof PDFArray) return resolved.asArray().map((x) => nameOf(x instanceof PDFRef ? ctx.lookup(x) : x) || '')
  return []
}

/**
 * Pull image XObjects page by page. Pure given the bytes; never throws
 * (errors are reported in the result). Exported for tests.
 */
export async function extractPdfPageImages(bytes: Uint8Array | ArrayBuffer, maxPages = OCR_MAX_PAGES): Promise<PdfImageExtraction> {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const out: PdfImageExtraction = { images: [], pages: 0, unsupported: 0, encrypted: false }
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(u8, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false })
  } catch (e) {
    out.error = `pdf parse failed: ${(e as Error)?.message?.slice(0, 120) || e}`
    return out
  }
  // Decryption context (empty user password) for encrypted files.
  let decrypt: ((ref: PDFRef, data: Uint8Array) => Promise<Uint8Array | null>) | null = null
  try {
    const infos = findEncryptInfos(u8)
    if (infos.length) {
      out.encrypted = true
      const info = infos[0]
      const fileKey = await computeFileKey(info)
      if (fileKey) decrypt = (ref, data) => decryptObjectBytes(info, fileKey, ref.objectNumber, ref.generationNumber, data, 'stream')
      else out.error = 'encrypted: could not derive file key (non-empty user password?)'
    }
  } catch { /* treat as unencrypted */ }

  const ctx = doc.context
  const pages = doc.getPages()
  out.pages = pages.length
  const seen = new Set<string>()

  const visitXObjects = async (resources: PDFDict | undefined, pageNo: number, depth: number): Promise<void> => {
    if (!resources || depth > 2) return
    const xo = resources.get(PDFName.of('XObject'))
    const xdict = xo instanceof PDFRef ? ctx.lookup(xo) : xo
    if (!(xdict instanceof PDFDict)) return
    for (const [, val] of xdict.entries()) {
      const ref = val instanceof PDFRef ? val : null
      const stream = ref ? ctx.lookup(ref) : val
      if (!(stream instanceof PDFRawStream)) continue
      const sub = nameOf(stream.dict.get(PDFName.of('Subtype')))
      if (sub === 'Form') {
        const res = stream.dict.get(PDFName.of('Resources'))
        await visitXObjects((res instanceof PDFRef ? ctx.lookup(res) : res) as PDFDict | undefined, pageNo, depth + 1)
        continue
      }
      if (sub !== 'Image') continue
      const refKey = ref ? `${ref.objectNumber}/${ref.generationNumber}` : undefined
      const key = `${pageNo}:${refKey ?? seen.size}`
      if (seen.has(key)) continue
      seen.add(key)
      const width = numOf(stream.dict.get(PDFName.of('Width'))) ?? undefined
      const height = numOf(stream.dict.get(PDFName.of('Height'))) ?? undefined
      // Skip tiny decorative images (logos/lines) — OCR cost without content.
      if (width && height && width * height < 40_000) continue
      let raw: Uint8Array = stream.contents
      if (decrypt && ref) {
        const dec = await decrypt(ref, raw)
        if (!dec) { out.unsupported++; continue }
        raw = dec
      } else if (out.encrypted && !decrypt) { out.unsupported++; continue }
      const filters = filtersOf(stream.dict, ctx)
      const last = filters[filters.length - 1] || ''
      if (last === 'DCTDecode' && filters.length === 1) {
        if (raw.byteLength <= OCR_MAX_IMAGE_BYTES) out.images.push({ page: pageNo, mime: 'image/jpeg', data: raw, width, height, ref: refKey })
        else out.unsupported++
        continue
      }
      if ((last === 'FlateDecode' && filters.length === 1) || filters.length === 0) {
        const png = await rawImageToPng(stream.dict, raw, ctx, filters.length === 1)
        if (png && png.byteLength <= OCR_MAX_IMAGE_BYTES) out.images.push({ page: pageNo, mime: 'image/png', data: png, width, height, ref: refKey })
        else out.unsupported++
        continue
      }
      out.unsupported++ // JPX / CCITT / JBIG2 / multi-filter chains
    }
  }

  const visitContent = async (contentsObj: PDFObject | undefined, pageNo: number): Promise<void> => {
    const arr = contentsObj instanceof PDFArray ? contentsObj.asArray() : contentsObj ? [contentsObj] : []
    for (const c of arr) {
      const ref = c instanceof PDFRef ? c : null
      const st = ref ? ctx.lookup(ref) : c
      if (!(st instanceof PDFRawStream)) continue
      let raw: Uint8Array = st.contents
      if (decrypt && ref) { const d = await decrypt(ref, raw); if (!d) continue; raw = d }
      else if (out.encrypted && !decrypt) continue
      const filters = filtersOf(st.dict, ctx)
      let data: Uint8Array | null = raw
      if (filters.length === 1 && filters[0] === 'FlateDecode') data = await inflate(raw)
      else if (filters.length) data = null
      if (!data) continue
      for (const im of await parseInlineImages(data)) {
        if (im.width * im.height < 40_000) continue
        if (im.data.byteLength > OCR_MAX_IMAGE_BYTES) { out.unsupported++; continue }
        out.images.push({ page: pageNo, mime: im.mime, data: im.data, width: im.width, height: im.height })
      }
      if (parseInlineImages.lastUnsupported) out.unsupported += parseInlineImages.lastUnsupported
    }
  }

  for (let i = 0; i < pages.length && i < maxPages; i++) {
    try {
      await visitXObjects(pages[i].node.Resources(), i + 1, 0)
      await visitContent(pages[i].node.Contents(), i + 1)
    } catch { /* keep going */ }
  }
  return out
}

// ── Inline images (BI … ID … EI) ─────────────────────────────────────────────

const INLINE_KEY: Record<string, string> = { W: 'Width', H: 'Height', BPC: 'BitsPerComponent', CS: 'ColorSpace', F: 'Filter', DP: 'DecodeParms', L: 'Length', IM: 'ImageMask', D: 'Decode', I: 'Interpolate' }
const INLINE_FILTER: Record<string, string> = { DCT: 'DCTDecode', Fl: 'FlateDecode', AHx: 'ASCIIHexDecode', A85: 'ASCII85Decode', LZW: 'LZWDecode', RL: 'RunLengthDecode', CCF: 'CCITTFaxDecode' }
const INLINE_CS: Record<string, string> = { G: 'DeviceGray', RGB: 'DeviceRGB', CMYK: 'DeviceCMYK', I: 'Indexed' }

interface InlineImage { mime: 'image/jpeg' | 'image/png'; data: Uint8Array; width: number; height: number }

function isWs(b: number): boolean { return b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09 || b === 0x0c || b === 0x00 }

/**
 * Find inline images in a (decoded) content stream. Exported for tests.
 * Handles the two encodings we can forward (DCT → JPEG bytes; Flate/none
 * 8-bit Gray/RGB → PNG). Others are counted in `parseInlineImages.lastUnsupported`.
 */
export async function parseInlineImages(content: Uint8Array): Promise<InlineImage[]> {
  const out: InlineImage[] = []
  let unsupported = 0
  const latin = (a: number, b: number) => { let t = ''; for (let i = a; i < b; i++) t += String.fromCharCode(content[i]); return t }
  const n = content.length
  let i = 0
  while (i < n - 4) {
    // token "BI" delimited by whitespace
    if (content[i] === 0x42 && content[i + 1] === 0x49 && (i === 0 || isWs(content[i - 1])) && isWs(content[i + 2])) {
      // find " ID" token
      let j = i + 2
      let idPos = -1
      while (j < n - 2) {
        if (content[j] === 0x49 && content[j + 1] === 0x44 && isWs(content[j - 1]) && isWs(content[j + 2])) { idPos = j; break }
        j++
      }
      if (idPos < 0) break
      const dictText = latin(i + 2, idPos)
      const dict: Record<string, string> = {}
      for (const m of dictText.matchAll(/\/([A-Za-z0-9]+)\s*(\[[^\]]*\]|\/[A-Za-z0-9.]+|[-0-9.]+|true|false)/g)) {
        dict[INLINE_KEY[m[1]] || m[1]] = m[2]
      }
      const width = parseInt(dict.Width || '0', 10), height = parseInt(dict.Height || '0', 10)
      const bpc = parseInt(dict.BitsPerComponent || '8', 10)
      const filtRaw = (dict.Filter || '').replace(/[\[\]]/g, '').trim().split(/\s+/).filter(Boolean).map((f) => INLINE_FILTER[f.replace('/', '')] || f.replace('/', ''))
      const cs = (dict.ColorSpace || '').replace('/', '')
      const csName = INLINE_CS[cs] || cs
      const dataStart = idPos + 3 // "ID" + one whitespace
      let dataEnd = -1
      let explicitLen = dict.Length ? parseInt(dict.Length, 10) : NaN
      if (Number.isFinite(explicitLen) && explicitLen > 0 && dataStart + explicitLen <= n) dataEnd = dataStart + explicitLen
      if (dataEnd < 0 && filtRaw[0] === 'DCTDecode') {
        // JPEG: ends at FFD9 (EOI)
        for (let k = dataStart; k < n - 1; k++) if (content[k] === 0xff && content[k + 1] === 0xd9) { dataEnd = k + 2; break }
      }
      if (dataEnd < 0) {
        // generic: "EI" delimited by whitespace, followed by whitespace/EOF
        for (let k = dataStart; k < n - 1; k++) {
          if (content[k] === 0x45 && content[k + 1] === 0x49 && isWs(content[k - 1]) && (k + 2 >= n || isWs(content[k + 2]))) { dataEnd = k - 1; break }
        }
      }
      if (dataEnd < 0) break
      const data = content.subarray(dataStart, dataEnd)
      if (width > 0 && height > 0) {
        if (filtRaw.length === 1 && filtRaw[0] === 'DCTDecode') out.push({ mime: 'image/jpeg', data, width, height })
        else if ((filtRaw.length === 0 || (filtRaw.length === 1 && filtRaw[0] === 'FlateDecode')) && bpc === 8 && (csName === 'DeviceRGB' || csName === 'DeviceGray') && !dict.DecodeParms) {
          const samples = filtRaw.length ? await inflate(data) : data
          const png = samples ? await encodePng(width, height, csName === 'DeviceRGB' ? 3 : 1, samples) : null
          if (png) out.push({ mime: 'image/png', data: png, width, height }); else unsupported++
        } else unsupported++
      }
      // skip past EI
      let k = dataEnd
      while (k < n - 1 && !(content[k] === 0x45 && content[k + 1] === 0x49)) k++
      i = k + 2
      continue
    }
    i++
  }
  parseInlineImages.lastUnsupported = unsupported
  return out
}
parseInlineImages.lastUnsupported = 0

// ── Flate raw pixels → PNG ───────────────────────────────────────────────────

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const ds = new DecompressionStream('deflate')
    const w = ds.writable.getWriter()
    const copy = new Uint8Array(data.byteLength); copy.set(data)
    void w.write(copy).then(() => w.close()).catch(() => {})
    const buf = await new Response(ds.readable).arrayBuffer()
    return new Uint8Array(buf)
  } catch { return null }
}
async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const cs = new CompressionStream('deflate')
    const w = cs.writable.getWriter()
    const copy = new Uint8Array(data.byteLength); copy.set(data)
    void w.write(copy).then(() => w.close()).catch(() => {})
    const buf = await new Response(cs.readable).arrayBuffer()
    return new Uint8Array(buf)
  } catch { return null }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  out.set([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)], 4)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/**
 * Encode 8-bit Gray / RGB raw samples as PNG (exported for tests). Returns
 * null for anything else (indexed, CMYK, 1/4/16-bit, predictors, masks).
 */
export async function encodePng(width: number, height: number, channels: 1 | 3, samples: Uint8Array): Promise<Uint8Array | null> {
  if (width <= 0 || height <= 0 || samples.length < width * height * channels) return null
  const rowLen = width * channels
  const raw = new Uint8Array((rowLen + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (rowLen + 1)] = 0 // filter: none
    raw.set(samples.subarray(y * rowLen, (y + 1) * rowLen), y * (rowLen + 1) + 1)
  }
  const idat = await deflate(raw)
  if (!idat) return null
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, width); dv.setUint32(4, height)
  ihdr[8] = 8; ihdr[9] = channels === 3 ? 2 : 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const parts = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))]
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

async function rawImageToPng(dict: PDFDict, raw: Uint8Array, ctx: PDFDocument['context'], flate: boolean): Promise<Uint8Array | null> {
  const width = numOf(dict.get(PDFName.of('Width')))
  const height = numOf(dict.get(PDFName.of('Height')))
  const bpc = numOf(dict.get(PDFName.of('BitsPerComponent')))
  if (!width || !height || bpc !== 8) return null
  // Predictors / DecodeParms we don't handle.
  if (dict.get(PDFName.of('DecodeParms'))) {
    const dp = dict.get(PDFName.of('DecodeParms'))
    const d = dp instanceof PDFRef ? ctx.lookup(dp) : dp
    if (d instanceof PDFDict && numOf(d.get(PDFName.of('Predictor'))) && (numOf(d.get(PDFName.of('Predictor'))) as number) > 1) return null
  }
  let cs = dict.get(PDFName.of('ColorSpace'))
  cs = cs instanceof PDFRef ? ctx.lookup(cs) : cs
  let channels: 1 | 3 | null = null
  const csName = nameOf(cs)
  if (csName === 'DeviceRGB' || csName === 'CalRGB') channels = 3
  else if (csName === 'DeviceGray' || csName === 'CalGray') channels = 1
  else if (cs instanceof PDFArray) {
    const first = nameOf(cs.asArray()[0])
    if (first === 'ICCBased') {
      const n = cs.asArray()[1]
      const s = n instanceof PDFRef ? ctx.lookup(n) : n
      const N = s instanceof PDFRawStream ? numOf(s.dict.get(PDFName.of('N'))) : null
      channels = N === 3 ? 3 : N === 1 ? 1 : null
    }
  }
  if (!channels) return null
  const samples = flate ? await inflate(raw) : raw
  if (!samples) return null
  return encodePng(width, height, channels, samples)
}

// ── PDF → OCR text ───────────────────────────────────────────────────────────

export interface PdfOcrResult {
  text: string
  pages_ocred: number
  pages_total: number
  unsupported: number
  model: string | null
  encrypted: boolean
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

/**
 * OCR a scanned PDF: extract page images, OCR each (concurrency 3), join
 * with page markers. Returns null when nothing could be read (no key, no
 * extractable images, all OCR calls failed) — callers then say "unreadable".
 */
export async function ocrPdfScan(bytes: Uint8Array | ArrayBuffer, opts: { signal?: AbortSignal; maxPages?: number } = {}): Promise<PdfOcrResult | null> {
  if (!ocrAvailable()) return null
  const ex = await extractPdfPageImages(bytes, opts.maxPages ?? OCR_MAX_PAGES)
  if (!ex.images.length) return null
  const results: Array<{ page: number; text: string } | null> = new Array(ex.images.length).fill(null)
  let model: string | null = null
  let cursor = 0
  const memo = new Map<string, Promise<{ text: string; model: string } | null>>()
  const worker = async () => {
    for (;;) {
      const i = cursor++
      if (i >= ex.images.length) return
      const im = ex.images[i]
      const run = () => ocrImageBase64(toBase64(im.data), im.mime, { signal: opts.signal, pixels: im.width && im.height ? im.width * im.height : undefined })
      const r = im.ref ? await (memo.get(im.ref) ?? (memo.set(im.ref, run()), memo.get(im.ref)!)) : await run()
      if (r) { results[i] = { page: im.page, text: r.text }; model = model || r.model }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  const got = results.filter((r): r is { page: number; text: string } => !!r)
  if (!got.length) return null
  // Group by page (a page may hold several images).
  const byPage = new Map<number, string[]>()
  for (const g of got) byPage.set(g.page, [...(byPage.get(g.page) || []), g.text])
  const text = [...byPage.entries()].sort((a, b) => a[0] - b[0]).map(([p, parts]) => `--- page ${p} ---\n${parts.join('\n')}`).join('\n\n')
  return { text, pages_ocred: byPage.size, pages_total: ex.pages, unsupported: ex.unsupported, model, encrypted: ex.encrypted }
}
