// Streaming the assistant's reply (2026-11-17). The turn model answers with one JSON object whose
// `reply` field is what the person reads; the rest (memory writes, a proposed action, a draft listing)
// only makes sense whole. So while the model is still writing we pull the reply text out of the
// half-finished JSON and send it on, and the finished turn — guardrail notes, cards, receipts —
// replaces that draft when it is ready. Pure: no I/O here, the route owns the wire.
//
// The draft is the same text the final reply will contain: the guardrail only ever APPENDS notes to a
// reply (lib/agent/guardrail.ts), and the deterministic rewrites the final goes through (citation
// markers, 「实时」 wording, markdown) are applied to the draft too by the `view` the route passes in.

/** One line on the wire in stream mode. d = append, r = replace the draft, x = drop the draft
 *  (a second model call is starting: fallback model, retry, or the pass after a data lookup). */
export type TurnStreamEvent = { t: 'd'; v: string } | { t: 'r'; v: string } | { t: 'x' }

const REPLY_KEY = /"reply"\s*:\s*"/

/** The decoded `reply` string from a possibly unfinished JSON text, or null when the model has not
 *  reached it yet. `done` = the closing quote has arrived. A JSON escape cut by the chunk boundary is
 *  left for the next call. */
export function partialReply(raw: string): { text: string; done: boolean } | null {
  const m = REPLY_KEY.exec(raw)
  if (!m) return null
  let i = m.index + m[0].length
  let out = ''
  while (i < raw.length) {
    const c = raw[i]
    if (c === '"') return { text: out, done: true }
    if (c !== '\\') { out += c; i++; continue }
    const n = raw[i + 1]
    if (n === undefined) break
    if (n === 'u') {
      const hex = raw.slice(i + 2, i + 6)
      if (hex.length < 4) break
      if (/^[0-9a-fA-F]{4}$/.test(hex)) out += String.fromCharCode(parseInt(hex, 16))
      i += 6
      continue
    }
    out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' || n === 'b' || n === 'f' ? '' : n
    i += 2
  }
  return { text: out, done: false }
}

/** How many trailing characters stay unsent while the reply is still growing. The rewrites the final
 *  reply goes through look a few characters ahead (「实时」 before 「更新」, "[K3]" markers, "s. 58"),
 *  so the tail is held until what follows it is known. */
export const STREAM_HOLD_BACK = 24

/** Turns the model's accumulated output into wire events. `push` is called with the whole text so far;
 *  it emits only what is new, and a replace when a rewrite changed text already sent. */
export function createReplyStreamer(opts: {
  emit: (e: TurnStreamEvent) => void
  /** The reply as the reader will see it: the same deterministic rewrites as the final reply. */
  view?: (partial: string, done: boolean) => string
  holdBack?: number
}) {
  const hold = opts.holdBack ?? STREAM_HOLD_BACK
  let sent = ''
  return {
    push(raw: string): void {
      const p = partialReply(raw)
      if (!p) return
      const shown = opts.view ? opts.view(p.text, p.done) : p.text
      let visible = p.done ? shown : shown.slice(0, Math.max(0, shown.length - hold))
      // Never end on half of a surrogate pair (an emoji cut in two renders as �).
      const last = visible.charCodeAt(visible.length - 1)
      if (!p.done && last >= 0xd800 && last <= 0xdbff) visible = visible.slice(0, -1)
      if (visible === sent) return
      if (visible.startsWith(sent)) opts.emit({ t: 'd', v: visible.slice(sent.length) })
      else opts.emit({ t: 'r', v: visible })
      sent = visible
    },
    /** A new model call starts: whatever was drafted belongs to the abandoned one. */
    reset(): void {
      if (sent) opts.emit({ t: 'x' })
      sent = ''
    },
    get sent(): string { return sent },
  }
}
