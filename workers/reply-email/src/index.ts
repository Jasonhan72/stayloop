// Stayloop reply-email worker (消息系统 A 期, 2026-09-29).
// Cloudflare Email Routing sends every mail for *@reply.stayloop.ai here. We
// parse it (postal-mime) and hand raw bytes + parsed parts to
// https://www.stayloop.ai/api/threads/inbound with a shared secret. The app
// decides whether it becomes a message (reply token + sender check); this
// worker never rejects, so a reply is never bounced for an app-side reason.
import PostalMime from 'postal-mime'

interface Env { INBOUND_URL: string; INBOUND_EMAIL_SECRET: string }

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer())
    let parsed: Awaited<ReturnType<typeof PostalMime.parse>> | null = null
    try { parsed = await PostalMime.parse(raw) } catch { parsed = null }
    const to = [message.to, ...((parsed?.to ?? []).map((a) => a.address ?? '')), ...((parsed?.cc ?? []).map((a) => a.address ?? ''))].filter(Boolean)
    const res = await fetch(env.INBOUND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-inbound-secret': env.INBOUND_EMAIL_SECRET },
      body: JSON.stringify({
        raw: toBase64(raw),
        from: parsed?.from?.address ?? message.from,
        envelope_from: message.from,
        to,
        text: parsed?.text ?? null,
        html: parsed?.html ?? null,
        message_id: parsed?.messageId ?? null,
        attachments: parsed?.attachments?.length ?? 0,
      }),
    })
    if (!res.ok) console.log('inbound post failed', res.status, (await res.text()).slice(0, 200))
  },
}
