// Stayloop email worker.
//
// Two kinds of address land here (the zone's catch-all sends everything unmatched):
//
//   t-<token>@reply.stayloop.ai            a reply to a thread email (消息系统 A 期, 2026-09-29) — below.
//   <slug>-<6 chars>@ai|reply.stayloop.ai  an AI Agent's own mailbox (2026-11-27): the raw message goes
//                                          to /api/assistant/inbound as it was received, with Cloudflare's
//                                          own Authentication-Results; the app decides (is the address
//                                          open, is the sender on its list and verified, is there room)
//                                          and a refusal is given to the sending server with setReject —
//                                          so the sender hears it from their own mail server and we never
//                                          send a bounce ourselves.
//
// Thread replies (消息系统 A 期, 2026-09-29):
// Cloudflare Email Routing sends every mail for *@reply.stayloop.ai here. We
// parse it (postal-mime) and hand raw bytes + parsed parts to
// https://www.stayloop.ai/api/threads/inbound with a shared secret. The app
// decides whether it becomes a message (reply token + sender check); this
// worker never rejects, so a reply is never bounced for an app-side reason.
import PostalMime from 'postal-mime'

interface Env { INBOUND_URL: string; ASSISTANT_INBOUND_URL: string; INBOUND_EMAIL_SECRET: string }

/** An assistant's mailbox: the same shape lib/assistantMail/address.ts hands out (LOCAL_RE) on either accepted domain. */
const ASSISTANT_TO = /^[a-z0-9]{2,16}-[a-z2-9]{6}@(?:ai|reply)\.stayloop\.ai$/i
/** The app's own limit (MAIL_LIMITS.rawBytes); refused here before the body is read. */
const ASSISTANT_MAX_BYTES = 10 * 1024 * 1024
const TRY_LATER = 'This mailbox cannot accept mail right now. Please try again later.'

async function assistantMail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  if (message.rawSize > ASSISTANT_MAX_BYTES) { message.setReject('Message too large: the limit is 10 MB.'); return }
  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer())
  let res: Response
  try {
    res = await fetch(env.ASSISTANT_INBOUND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'message/rfc822',
        'x-inbound-secret': env.INBOUND_EMAIL_SECRET,
        'x-mail-to': message.to,
        // Cloudflare prepends its own Authentication-Results; the app reads only that first one (parseAuthResults).
        'x-mail-auth-results': (message.headers.get('authentication-results') ?? '').replace(/[^\x20-\x7e]+/g, ' ').slice(0, 2000),
      },
      body: raw,
    })
  } catch {
    message.setReject(TRY_LATER)
    return
  }
  if (!res.ok) {
    console.log('assistant inbound failed', res.status, (await res.text()).slice(0, 200))
    message.setReject(TRY_LATER)
    return
  }
  const j = (await res.json().catch(() => null)) as { ok?: boolean; reject?: string } | null
  if (!j || j.ok !== true) message.setReject(typeof j?.reject === 'string' && j.reject ? j.reject.slice(0, 300) : 'Message not accepted.')
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    // The zone-wide catch-all lands here. Thread reply addresses and assistants' mailboxes are
    // ours; anything else (e.g. an unknown @stayloop.ai address) is rejected exactly as before
    // the catch-all existed, and never reaches the app.
    if (ASSISTANT_TO.test(message.to)) { await assistantMail(message, env); return }
    if (!/^t-[a-z0-9]{20,40}@reply\.stayloop\.ai$/i.test(message.to)) {
      message.setReject('Unknown address')
      return
    }
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
