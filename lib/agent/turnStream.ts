// Client side of the streamed turn (2026-11-17). In stream mode /api/agent/turn answers with lines:
// whitespace heartbeats, draft events ({t:'d'|'r'|'x'}, lib/agent/replyStream.ts) and one
// {t:'final', payload} carrying the finished turn. A server that does not stream (an older deploy
// during a rollout, or a caller that did not ask) sends whitespace then ONE JSON object with no
// newline — `end()` reads that as the final payload, so the client works against both.
export class TurnStreamParser {
  private buf = ''
  /** The reply text drafted so far ('' = nothing to show). */
  draft = ''
  /** The finished turn, once it has arrived. */
  final: Record<string, unknown> | null = null
  /** The turn's folded-in sources, sent ahead of the reply text (null = none sent). */
  sources: unknown[] | null = null

  /** Feed decoded body text. Returns true when the draft changed. */
  feed(chunk: string): boolean {
    this.buf += chunk
    let changed = false
    for (let nl = this.buf.indexOf('\n'); nl >= 0; nl = this.buf.indexOf('\n')) {
      const line = this.buf.slice(0, nl).trim()
      this.buf = this.buf.slice(nl + 1)
      if (line && this.handle(line, false)) changed = true
    }
    return changed
  }

  /** The body ended: whatever is left is the last line (or the whole legacy body). */
  end(): void {
    const rest = this.buf.trim()
    this.buf = ''
    if (rest) this.handle(rest, true)
  }

  private handle(line: string, last: boolean): boolean {
    let ev: Record<string, unknown>
    try { ev = JSON.parse(line) as Record<string, unknown> } catch (e) {
      // A broken line mid-stream is skipped (the final payload still decides the turn); a body that
      // ends on something unparseable is an error the caller must see, as JSON.parse always was.
      if (last) throw e
      return false
    }
    if (!ev || typeof ev !== 'object') return false
    const before = this.draft
    if (ev.t === 'd' && typeof ev.v === 'string') this.draft += ev.v
    else if (ev.t === 'r' && typeof ev.v === 'string') this.draft = ev.v
    else if (ev.t === 'x') this.draft = ''
    else if (ev.t === 's' && Array.isArray(ev.v)) this.sources = ev.v
    else if (ev.t === 'final' && ev.payload && typeof ev.payload === 'object') this.final = ev.payload as Record<string, unknown>
    else if (ev.t === undefined) this.final = ev
    return this.draft !== before
  }
}
