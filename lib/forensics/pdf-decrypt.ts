// -----------------------------------------------------------------------------
// PDF standard security handler — EMPTY user password decryption.
//
// Case 24 (2026-08-21): five of six uploaded documents (an edited Equifax
// report, three Excel-made "ADP" stubs, a Word letter) were AES-256 encrypted
// with an empty user password — the default when macOS/Word/Excel/Chrome
// "protect" an export or an editor re-saves with encryption. pdf-lib does not
// decrypt, so it threw on all five; the raw byte scan saw only ciphertext; and
// every metadata/structure rule silently passed. poppler and pypdf opened
// them with '' and read: Created 2023, Author "Johnson Osei.", Excel 2013,
// Modified 2026-08-13, Title "Microsoft Word - NEHroughemploy.docx".
//
// This module implements just enough of ISO 32000 §7.6 to recover strings and
// streams when the USER password is empty (an owner password may be set —
// irrelevant, we never need owner rights):
//   · R2/R3/R4  — RC4 40/128 and AES-128 (AESV2): MD5-derived file key +
//                 per-object key (Algorithm 2 / Algorithm 1)
//   · R5/R6     — AES-256 (AESV3): SHA-256 (R6: hash algorithm 2.B) key
//                 unwrap of /UE, file key used directly for every object
// Edge-runtime safe: WebCrypto for SHA-2 and AES-CBC, tiny JS MD5 and RC4.
// Everything is best-effort and returns null on any failure — a decryption
// miss degrades to "metadata unreadable", never to a crash.
// -----------------------------------------------------------------------------

export interface PdfEncryptInfo {
  objNum: number
  v: number
  r: number
  lengthBytes: number
  o: Uint8Array
  u: Uint8Array
  oe: Uint8Array | null
  ue: Uint8Array | null
  p: number
  encryptMetadata: boolean
  stmf: 'AESV2' | 'AESV3' | 'V2' | 'Identity' | 'unknown'
  strf: 'AESV2' | 'AESV3' | 'V2' | 'Identity' | 'unknown'
  idFirst: Uint8Array
}

const PAD = new Uint8Array([
  0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
  0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A,
])

// ---------------------------------------------------------------------------
// byte helpers
// ---------------------------------------------------------------------------
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const n = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
const latin1 = (b: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 0x8000)) as unknown as number[])
  return s
}
const bytesOf = (s: string): Uint8Array => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF; return b }
const eq = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i])

// ---------------------------------------------------------------------------
// MD5 (RFC 1321) — WebCrypto has no MD5; the legacy handler needs it.
// ---------------------------------------------------------------------------
export function md5(input: Uint8Array): Uint8Array {
  const K = new Uint32Array(64)
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
  const bitLen = input.length * 8
  const padLen = ((input.length + 8) >> 6 << 6) + 64
  const msg = new Uint8Array(padLen)
  msg.set(input)
  msg[input.length] = 0x80
  const dv = new DataView(msg.buffer)
  dv.setUint32(padLen - 8, bitLen >>> 0, true)
  dv.setUint32(padLen - 4, Math.floor(bitLen / 0x100000000) >>> 0, true)
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  const M = new Uint32Array(16)
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true)
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F: number, g: number
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      const tmp = D; D = C; C = B
      const x = (A + F + K[i] + M[g]) >>> 0
      B = (B + ((x << S[i]) | (x >>> (32 - S[i])))) >>> 0
      A = tmp
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0
  }
  const out = new Uint8Array(16)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, a0, true); ov.setUint32(4, b0, true); ov.setUint32(8, c0, true); ov.setUint32(12, d0, true)
  return out
}

// ---------------------------------------------------------------------------
// RC4
// ---------------------------------------------------------------------------
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256)
  for (let i = 0; i < 256; i++) S[i] = i
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xFF
    const t = S[i]; S[i] = S[j]; S[j] = t
  }
  const out = new Uint8Array(data.length)
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 0xFF
    j = (j + S[i]) & 0xFF
    const t = S[i]; S[i] = S[j]; S[j] = t
    out[k] = data[k] ^ S[(S[i] + S[j]) & 0xFF]
  }
  return out
}

// ---------------------------------------------------------------------------
// WebCrypto wrappers
// ---------------------------------------------------------------------------
const subtle = (): SubtleCrypto | null => (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null

async function sha(bits: 256 | 384 | 512, data: Uint8Array): Promise<Uint8Array> {
  const s = subtle()
  if (!s) throw new Error('no subtle')
  return new Uint8Array(await s.digest(`SHA-${bits}`, new Uint8Array(data)))
}

/** AES-CBC decrypt with PKCS#5 padding (the normal PDF string/stream case). */
async function aesCbcDecryptPadded(key: Uint8Array, iv: Uint8Array, ct: Uint8Array): Promise<Uint8Array | null> {
  const s = subtle()
  if (!s || ct.length === 0 || ct.length % 16 !== 0) return null
  try {
    const k = await s.importKey('raw', new Uint8Array(key), { name: 'AES-CBC' }, false, ['decrypt'])
    return new Uint8Array(await s.decrypt({ name: 'AES-CBC', iv: new Uint8Array(iv) }, k, new Uint8Array(ct)))
  } catch {
    return null
  }
}

/** AES-CBC decrypt WITHOUT padding (the /UE unwrap and hash 2.B need this).
 *  WebCrypto insists on PKCS#7, so we append one block that decrypts to a
 *  full padding block: E_k(lastCtBlock ⊕ 0x10…10) = AES-CBC-encrypt(empty). */
async function aesCbcDecryptNoPad(key: Uint8Array, iv: Uint8Array, ct: Uint8Array): Promise<Uint8Array | null> {
  const s = subtle()
  if (!s || ct.length === 0 || ct.length % 16 !== 0) return null
  try {
    const k = await s.importKey('raw', new Uint8Array(key), { name: 'AES-CBC' }, false, ['encrypt', 'decrypt'])
    const lastBlock = ct.subarray(ct.length - 16)
    const padBlock = new Uint8Array(await s.encrypt({ name: 'AES-CBC', iv: new Uint8Array(lastBlock) }, k, new Uint8Array(0)))
    const full = concat(ct, padBlock)
    return new Uint8Array(await s.decrypt({ name: 'AES-CBC', iv: new Uint8Array(iv) }, k, new Uint8Array(full)))
  } catch {
    return null
  }
}

/** AES-CBC encrypt WITHOUT padding (hash 2.B): encrypt with PKCS#7 and drop
 *  the trailing padding block. Input length must be a multiple of 16. */
async function aesCbcEncryptNoPad(key: Uint8Array, iv: Uint8Array, pt: Uint8Array): Promise<Uint8Array | null> {
  const s = subtle()
  if (!s || pt.length % 16 !== 0) return null
  try {
    const k = await s.importKey('raw', new Uint8Array(key), { name: 'AES-CBC' }, false, ['encrypt'])
    const out = new Uint8Array(await s.encrypt({ name: 'AES-CBC', iv: new Uint8Array(iv) }, k, new Uint8Array(pt)))
    return out.subarray(0, out.length - 16)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// PDF syntax helpers (minimal, tolerant)
// ---------------------------------------------------------------------------

/** Parse a PDF string object starting at text[idx] ('(' or '<'). Returns raw
 *  bytes and the index just past the string. Handles escapes, nested parens,
 *  octal and hex strings. */
export function parsePdfStringAt(text: string, idx: number): { bytes: Uint8Array; end: number } | null {
  const c = text[idx]
  if (c === '<') {
    if (text[idx + 1] === '<') return null
    const end = text.indexOf('>', idx)
    if (end < 0) return null
    const hex = text.slice(idx + 1, end).replace(/\s/g, '')
    const out = new Uint8Array(Math.ceil(hex.length / 2))
    for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substr(i, 2).padEnd(2, '0'), 16)
    return { bytes: out, end: end + 1 }
  }
  if (c !== '(') return null
  const out: number[] = []
  let depth = 0
  let i = idx
  for (; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\') {
      const n = text[i + 1]
      i++
      if (n === 'n') out.push(10)
      else if (n === 'r') out.push(13)
      else if (n === 't') out.push(9)
      else if (n === 'b') out.push(8)
      else if (n === 'f') out.push(12)
      else if (n === '(' || n === ')' || n === '\\') out.push(n.charCodeAt(0))
      else if (n === '\r') { if (text[i + 1] === '\n') i++ }
      else if (n === '\n') { /* line continuation */ }
      else if (n >= '0' && n <= '7') {
        let oct = n
        while (oct.length < 3 && text[i + 1] >= '0' && text[i + 1] <= '7') { oct += text[i + 1]; i++ }
        out.push(parseInt(oct, 8) & 0xFF)
      } else out.push(n.charCodeAt(0) & 0xFF)
      continue
    }
    if (ch === '(') { depth++; if (depth > 1) out.push(40); continue }
    if (ch === ')') { depth--; if (depth === 0) { i++; break } out.push(41); continue }
    if (depth >= 1) out.push(ch.charCodeAt(0) & 0xFF)
  }
  return { bytes: new Uint8Array(out), end: i }
}

/** Balanced "<< … >>" starting at text[start] (which must be '<<'). */
function balancedDict(text: string, start: number): string | null {
  if (text.substr(start, 2) !== '<<') return null
  let depth = 0
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '<' && text[i + 1] === '<') { depth++; i++; continue }
    if (text[i] === '>' && text[i + 1] === '>') { depth--; i++; if (depth === 0) return text.slice(start, i + 1) }
    // skip string literals so parens/brackets inside them don't confuse us
    if (text[i] === '(') { const s = parsePdfStringAt(text, i); if (s) i = s.end - 1 }
  }
  return null
}

function objectText(text: string, objNum: number): string | null {
  const re = new RegExp(`(?:^|[^0-9])${objNum}\\s+(\\d+)\\s+obj\\b`, 'g')
  let m: RegExpExecArray | null
  let last: string | null = null
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length
    const end = text.indexOf('endobj', start)
    if (end > start) last = text.slice(start, end)
  }
  return last
}

function nameAfter(dict: string, key: string): string | null {
  const m = dict.match(new RegExp(`/${key}\\s*/([A-Za-z0-9.#_-]+)`))
  return m ? m[1] : null
}
function intAfter(dict: string, key: string): number | null {
  const m = dict.match(new RegExp(`/${key}\\s+(-?\\d+)`))
  return m ? Number(m[1]) : null
}
function stringAfter(dict: string, key: string): Uint8Array | null {
  const m = dict.match(new RegExp(`/${key}\\s*`))
  if (!m || m.index === undefined) return null
  const at = m.index + m[0].length
  const s = parsePdfStringAt(dict, at)
  return s ? s.bytes : null
}

/** Every /Encrypt object referenced by a trailer or xref-stream dictionary. */
export function findEncryptInfos(u8: Uint8Array): PdfEncryptInfo[] {
  const text = latin1(u8)
  const refs = new Set<number>()
  const reRef = /\/Encrypt\s+(\d+)\s+\d+\s+R/g
  let m: RegExpExecArray | null
  while ((m = reRef.exec(text))) refs.add(Number(m[1]))
  if (refs.size === 0) return []

  // /ID [<…> <…>] — take the LAST trailer/xref dict's first element.
  let idFirst: Uint8Array = new Uint8Array(0)
  const reId = /\/ID\s*\[\s*(<[0-9A-Fa-f\s]*>|\([^)]*\))/g
  let lastId: string | null = null
  while ((m = reId.exec(text))) lastId = m[1]
  if (lastId) { const s = parsePdfStringAt(lastId, 0); if (s) idFirst = s.bytes }

  const infos: PdfEncryptInfo[] = []
  for (const objNum of refs) {
    const body = objectText(text, objNum)
    if (!body) continue
    const ds = body.indexOf('<<')
    const dict = ds >= 0 ? balancedDict(body, ds) : null
    if (!dict) continue
    if (!/\/Filter\s*\/Standard/.test(dict)) continue
    const v = intAfter(dict, 'V') ?? 0
    const r = intAfter(dict, 'R') ?? (v >= 4 ? 4 : 2)
    const lengthBits = intAfter(dict, 'Length') ?? (v === 1 ? 40 : 40)
    const o = stringAfter(dict, 'O'), u = stringAfter(dict, 'U')
    if (!o || !u) continue
    const p = intAfter(dict, 'P') ?? -1
    const encryptMetadata = !/\/EncryptMetadata\s+false/.test(dict)
    // crypt filters (V4/V5): /CF << /StdCF << /CFM /AESV2 … >> >> with /StmF /StrF names
    const cfmOf = (filterName: string | null): PdfEncryptInfo['stmf'] => {
      if (!filterName || filterName === 'Identity') return 'Identity'
      const cfIdx = dict.indexOf('/CF')
      if (cfIdx < 0) return 'unknown'
      const sub = dict.slice(cfIdx)
      const fm = sub.match(new RegExp(`/${filterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<<([^>]*)>>`))
      const cfm = fm ? (fm[1].match(/\/CFM\s*\/([A-Za-z0-9]+)/) || [])[1] : null
      if (cfm === 'AESV2' || cfm === 'AESV3' || cfm === 'V2') return cfm
      return cfm === 'None' ? 'Identity' : 'unknown'
    }
    let stmf: PdfEncryptInfo['stmf'], strf: PdfEncryptInfo['strf']
    if (v >= 4) { stmf = cfmOf(nameAfter(dict, 'StmF') || 'Identity'); strf = cfmOf(nameAfter(dict, 'StrF') || 'Identity') }
    else { stmf = 'V2'; strf = 'V2' }
    infos.push({
      objNum, v, r,
      lengthBytes: Math.max(5, Math.min(32, Math.round((v >= 5 ? 256 : lengthBits) / 8))),
      o, u, oe: stringAfter(dict, 'OE'), ue: stringAfter(dict, 'UE'),
      p, encryptMetadata, stmf, strf, idFirst,
    })
  }
  return infos
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/** ISO 32000-2 Algorithm 2.B (R6) — SHA-256/384/512 + AES round iteration. */
async function hash2B(password: Uint8Array, salt: Uint8Array, udata: Uint8Array): Promise<Uint8Array> {
  let K = await sha(256, concat(password, salt, udata))
  let i = 0
  for (;;) {
    const k1unit = concat(password, K, udata)
    const k1 = new Uint8Array(k1unit.length * 64)
    for (let j = 0; j < 64; j++) k1.set(k1unit, j * k1unit.length)
    const E = await aesCbcEncryptNoPad(K.subarray(0, 16), K.subarray(16, 32), k1)
    if (!E) throw new Error('aes')
    let sum = 0
    for (let j = 0; j < 16; j++) sum += E[j]
    const mod = sum % 3
    K = mod === 0 ? await sha(256, E) : mod === 1 ? await sha(384, E) : await sha(512, E)
    i++
    if (i >= 64 && E[E.length - 1] <= i - 32) break
  }
  return K.subarray(0, 32)
}

/** The file encryption key for the EMPTY user password, or null when the
 *  password is not empty (validation fails) / revision unsupported. */
export async function computeFileKey(info: PdfEncryptInfo): Promise<Uint8Array | null> {
  const pwd = new Uint8Array(0)
  try {
    if (info.r >= 5) {
      if (!info.ue || info.u.length < 48) return null
      const vSalt = info.u.subarray(32, 40), kSalt = info.u.subarray(40, 48)
      const hashFn = info.r === 5
        ? (p: Uint8Array, s: Uint8Array) => sha(256, concat(p, s))
        : (p: Uint8Array, s: Uint8Array) => hash2B(p, s, new Uint8Array(0))
      const check = await hashFn(pwd, vSalt)
      if (!eq(check, info.u.subarray(0, 32))) return null  // user password is not empty
      const ikey = await hashFn(pwd, kSalt)
      const fileKey = await aesCbcDecryptNoPad(ikey, new Uint8Array(16), info.ue.subarray(0, 32))
      return fileKey && fileKey.length >= 32 ? fileKey.subarray(0, 32) : null
    }
    // R2–R4, Algorithm 2
    const pBytes = new Uint8Array(4)
    new DataView(pBytes.buffer).setInt32(0, info.p | 0, true)
    let input = concat(PAD, info.o.subarray(0, 32), pBytes, info.idFirst)
    if (info.r >= 4 && !info.encryptMetadata) input = concat(input, new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]))
    let key = md5(input)
    const n = info.r === 2 ? 5 : info.lengthBytes
    if (info.r >= 3) for (let i = 0; i < 50; i++) key = md5(key.subarray(0, n))
    key = key.subarray(0, n)
    // Validate against /U (Algorithm 4/5) so a wrong (non-empty) password is
    // reported as null instead of garbage.
    if (info.r === 2) {
      const u = rc4(key, PAD)
      if (!eq(u, info.u.subarray(0, 32))) return null
    } else {
      let x = rc4(key, md5(concat(PAD, info.idFirst)))
      for (let i = 1; i <= 19; i++) {
        const k2 = new Uint8Array(key.length)
        for (let j = 0; j < key.length; j++) k2[j] = key[j] ^ i
        x = rc4(k2, x)
      }
      if (!eq(x.subarray(0, 16), info.u.subarray(0, 16))) return null
    }
    return key
  } catch {
    return null
  }
}

/** Decrypt one string or stream belonging to object (objNum, gen). */
export async function decryptObjectBytes(
  info: PdfEncryptInfo,
  fileKey: Uint8Array,
  objNum: number,
  gen: number,
  data: Uint8Array,
  which: 'string' | 'stream',
): Promise<Uint8Array | null> {
  const method = which === 'stream' ? info.stmf : info.strf
  if (method === 'Identity') return data
  if (info.r >= 5 || method === 'AESV3') {
    if (data.length < 32) return null
    return aesCbcDecryptPadded(fileKey, data.subarray(0, 16), data.subarray(16))
  }
  // Algorithm 1: object key = MD5(fileKey + objnum[3] + gen[2] [+ sAlT])[0:min(n+5,16)]
  const extra = new Uint8Array([objNum & 0xFF, (objNum >> 8) & 0xFF, (objNum >> 16) & 0xFF, gen & 0xFF, (gen >> 8) & 0xFF])
  const salt = method === 'AESV2' ? new Uint8Array([0x73, 0x41, 0x6C, 0x54]) : new Uint8Array(0)
  const okey = md5(concat(fileKey, extra, salt)).subarray(0, Math.min(fileKey.length + 5, 16))
  if (method === 'AESV2') {
    if (data.length < 32) return null
    return aesCbcDecryptPadded(okey, data.subarray(0, 16), data.subarray(16))
  }
  return rc4(okey, data)
}

export { latin1 as pdfLatin1, bytesOf as pdfBytesOf }
