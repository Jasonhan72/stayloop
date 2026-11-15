// Is an inbound email a machine's reply rather than a person's? (code review 2026-11-15, S3-7)
// An out-of-office responder answers the notification from the party's own address to the
// thread's reply address — token and sender both check out, so it used to be recorded as that
// person's message (and announced to the other side, whose own responder could answer back).
// The signals are the standard ones: RFC 3834 `Auto-Submitted` (anything but "no"), the older
// `Precedence: bulk | junk | list | auto_reply`, and the `X-Autoreply` family. Pure — tested.

const HEADER_SCAN_BYTES = 64 * 1024

/** The header block of a raw message, unfolded, as lower-cased `name → value` (last one wins). */
export function rawHeaders(raw: Uint8Array): Map<string, string> {
  const head = raw.subarray(0, Math.min(raw.byteLength, HEADER_SCAN_BYTES))
  let text = ''
  for (let i = 0; i < head.length; i++) text += String.fromCharCode(head[i])
  const end = text.search(/\r?\n\r?\n/)
  const block = (end === -1 ? text : text.slice(0, end)).replace(/\r?\n[ \t]+/g, ' ')
  const out = new Map<string, string>()
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    out.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim())
  }
  return out
}

/** Which header marks the message as automatic, or null for an ordinary reply. */
export function autoReplySignal(raw: Uint8Array): string | null {
  const h = rawHeaders(raw)
  const auto = (h.get('auto-submitted') || '').toLowerCase()
  if (auto && !/^no\b/.test(auto)) return 'auto-submitted'
  const precedence = (h.get('precedence') || '').toLowerCase()
  if (/^(bulk|junk|list|auto_reply|auto-reply)\b/.test(precedence)) return 'precedence'
  for (const name of ['x-autoreply', 'x-autorespond', 'x-autoreply-from', 'x-auto-reply']) if (h.has(name)) return name
  return null
}
