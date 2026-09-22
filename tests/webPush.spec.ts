import { describe, expect, it } from 'vitest'
import { createECDH, webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { b64urlToBytes, buildVapidAuthorization, bytesToB64url, encryptPayload, sendWebPush } from '../lib/push/webpush'
import { shouldNotify, pushKeysFromEnv } from '../lib/push/notify'

// Reference implementation (dependency of web-push). Our WebCrypto encryptor
// must produce bytes it can decrypt — that is the spec-compliance proof.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require('http_ece') as { decrypt: (buf: Buffer, params: Record<string, unknown>) => Buffer }

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function vapidKeys() {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey))
  const jwk = await webcrypto.subtle.exportKey('jwk', kp.privateKey)
  return { publicKey: b64u(raw), privateKey: jwk.d as string, subject: 'mailto:privacy@stayloop.ai', verifyKey: kp.publicKey }
}

describe('web push · aes128gcm encryption (RFC 8291) matches the reference decryptor', () => {
  it('http_ece decrypts what we encrypt, for short and multi-byte payloads', async () => {
    // Receiver = a browser subscription: ECDH P-256 key + 16-byte auth secret.
    const receiver = createECDH('prime256v1')
    receiver.generateKeys()
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64u(receiver.getPublicKey()), auth: b64u(webcrypto.getRandomValues(new Uint8Array(16))) }
    for (const payload of ['{"title":"hi"}', JSON.stringify({ title: '续约窗口 · 90 天触点', body: 'Mia · 2027-03-31 到期', url: '/landlord/todo' }), 'x'.repeat(3000)]) {
      const body = await encryptPayload(sub, payload)
      // header sanity: salt(16) rs(4)=4096 idlen(1)=65
      expect(body.length).toBeGreaterThan(21 + 65 + 16)
      expect(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)).toBe(4096)
      expect(body[20]).toBe(65)
      const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: receiver, authSecret: sub.auth })
      expect(plain.toString('utf8')).toBe(payload)
    }
  })

  it('rejects malformed subscription keys instead of sending garbage', async () => {
    await expect(encryptPayload({ endpoint: 'https://x', p256dh: 'AAAA', auth: 'AAAA' }, 'p')).rejects.toThrow(/invalid subscription keys/)
  })
})

describe('web push · VAPID (RFC 8292)', () => {
  it('produces an ES256 JWT with the push-service origin as aud that verifies against the public key', async () => {
    const k = await vapidKeys()
    const auth = await buildVapidAuthorization('https://updates.push.services.mozilla.com/wpush/v2/gAAAA', k, 1_800_000_000_000)
    const m = auth.match(/^vapid t=([^,]+), k=(.+)$/)
    expect(m).toBeTruthy()
    const [h, p, s] = m![1].split('.')
    expect(JSON.parse(Buffer.from(b64urlToBytes(h)).toString())).toEqual({ typ: 'JWT', alg: 'ES256' })
    const payload = JSON.parse(Buffer.from(b64urlToBytes(p)).toString())
    expect(payload.aud).toBe('https://updates.push.services.mozilla.com')
    expect(payload.sub).toBe('mailto:privacy@stayloop.ai')
    expect(payload.exp).toBe(1_800_000_000 + 12 * 3600)
    expect(m![2]).toBe(k.publicKey)
    const ok = await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.verifyKey, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`))
    expect(ok).toBe(true)
    expect(b64urlToBytes(s).length).toBe(64)
  })

  it('base64url helpers round-trip', () => {
    const bytes = webcrypto.getRandomValues(new Uint8Array(37))
    expect(Buffer.from(b64urlToBytes(bytesToB64url(bytes)))).toEqual(Buffer.from(bytes))
  })
})

describe('web push · sending + thresholds', () => {
  it('sends the right headers and maps 201 / 410 / network failure', async () => {
    const k = await vapidKeys()
    const receiver = createECDH('prime256v1'); receiver.generateKeys()
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64u(receiver.getPublicKey()), auth: b64u(webcrypto.getRandomValues(new Uint8Array(16))) }
    const seen: { url: string; init: RequestInit }[] = []
    const mk = (status: number) => (async (url: string | URL | Request, init?: RequestInit) => { seen.push({ url: String(url), init: init! }); return new Response('', { status }) }) as typeof fetch
    const r1 = await sendWebPush(sub, { title: 't' }, k, { fetchImpl: mk(201) })
    expect(r1).toMatchObject({ ok: true, status: 201, gone: false })
    const h = seen[0].init.headers as Record<string, string>
    expect(h['Content-Encoding']).toBe('aes128gcm')
    expect(h.TTL).toBe('86400')
    expect(h.Authorization).toMatch(/^vapid t=.+, k=.+$/)
    const r2 = await sendWebPush(sub, { title: 't' }, k, { fetchImpl: mk(410) })
    expect(r2.gone).toBe(true)
    const r3 = await sendWebPush(sub, { title: 't' }, k, { fetchImpl: (async () => { throw new Error('boom') }) as unknown as typeof fetch })
    expect(r3).toMatchObject({ ok: false, status: 0, gone: false, error: 'boom' })
  })

  it('quiet devices get approvals only; default gets events too; nothing "done" exists as a kind', () => {
    expect(shouldNotify('quiet', { kind: 'approval' })).toBe(true)
    expect(shouldNotify('quiet', { kind: 'event' })).toBe(false)
    expect(shouldNotify('default', { kind: 'event' })).toBe(true)
    expect(pushKeysFromEnv({})).toBeNull()
    expect(pushKeysFromEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' })?.subject).toBe('mailto:privacy@stayloop.ai')
  })

  it('the service worker shows pushes and opens their url; the table is never anon-readable', () => {
    const sw = readFileSync('public/sw.js', 'utf8')
    expect(sw).toMatch(/addEventListener\('push'/)
    expect(sw).toMatch(/showNotification/)
    expect(sw).toMatch(/notificationclick/)
    const mig = readFileSync('supabase/migrations/20260922_push_subscriptions.sql', 'utf8')
    expect(mig).toMatch(/revoke all on public\.push_subscriptions from anon/)
    expect(mig).toMatch(/endpoint\s+text not null unique/)
  })
})
