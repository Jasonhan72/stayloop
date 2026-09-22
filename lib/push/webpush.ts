// Web Push on the edge runtime, no library (2026-09-22, Muse benchmark item F).
//
// Cloudflare Workers have WebCrypto but not Node's crypto, so the `web-push`
// package cannot run here. This file implements the two pieces the protocol
// needs and nothing else:
//   • VAPID (RFC 8292): an ES256 JWT over {aud, exp, sub}, sent as
//     `Authorization: vapid t=<jwt>, k=<public key>`.
//   • Payload encryption aes128gcm (RFC 8188 + RFC 8291): ECDH P-256 with the
//     subscription's p256dh key, HKDF-SHA256 with the subscription's auth
//     secret, AES-128-GCM over a single record, and the aes128gcm header.
// The encryption is verified byte-for-byte in tests/webPush.spec.ts by
// decrypting our output with the reference implementation (http_ece).

export type PushKeys = { publicKey: string; privateKey: string; subject: string }
export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string }

const enc = new TextEncoder()
// TS 5.7 types Uint8Array<ArrayBufferLike>, which WebCrypto's BufferSource
// parameter rejects; every buffer here is a plain ArrayBuffer-backed view.
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource

export function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToB64url(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', bs(ikm), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: bs(salt), info: bs(info) }, key, bytes * 8)
  return new Uint8Array(bits)
}

/** RFC 8291 §3 + RFC 8188: returns the aes128gcm body for one push message. */
export async function encryptPayload(
  sub: PushSubscriptionRow,
  payload: string,
  // Injectable for tests (deterministic salt / sender key); production uses random values.
  opts: { salt?: Uint8Array; senderKeyPair?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.p256dh)            // 65 bytes, uncompressed point
  const authSecret = b64urlToBytes(sub.auth)            // 16 bytes
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('invalid subscription keys')

  const sender = opts.senderKeyPair ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', bs(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, sender.privateKey, 256))

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)

  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // Single record: plaintext || 0x02 (last-record delimiter), no extra padding.
  const plain = concat(enc.encode(payload), new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', bs(cek), 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(nonce), tagLength: 128 }, aesKey, bs(plain)))

  // Header: salt(16) | rs(4) | idlen(1) | keyid(as_public 65)
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher)
}

async function importVapidPrivateKey(keys: PushKeys): Promise<CryptoKey> {
  const pub = b64urlToBytes(keys.publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be an uncompressed P-256 point')
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: keys.privateKey,
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/** RFC 8292: `vapid t=<ES256 JWT>, k=<public key>` for the push service at `endpoint`. */
export async function buildVapidAuthorization(endpoint: string, keys: PushKeys, now = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = bytesToB64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })))
  const signingInput = `${header}.${body}`
  const key = await importVapidPrivateKey(keys)
  // WebCrypto ECDSA returns the raw r||s (64 bytes) — exactly the JWS form.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bs(enc.encode(signingInput))))
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${keys.publicKey}`
}

export type SendResult = { ok: boolean; status: number; gone: boolean; error?: string }

/** One push message to one subscription. 404/410 = the subscription is dead (`gone`). */
export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: Record<string, unknown>,
  keys: PushKeys,
  opts: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; fetchImpl?: typeof fetch } = {},
): Promise<SendResult> {
  const f = opts.fetchImpl ?? fetch
  try {
    const body = await encryptPayload(sub, JSON.stringify(payload))
    const auth = await buildVapidAuthorization(sub.endpoint, keys)
    const res = await f(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(opts.ttl ?? 86_400),
        Urgency: opts.urgency ?? 'normal',
      },
      body: body as unknown as BodyInit,
    })
    const gone = res.status === 404 || res.status === 410
    return { ok: res.status >= 200 && res.status < 300, status: res.status, gone, error: res.ok ? undefined : (await res.text().catch(() => '')).slice(0, 200) }
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: (e as Error).message }
  }
}
