// 2026-11-17 · streamed assistant replies (product report §4.2: median 9.4 s of a blank "thinking" line,
// then the whole reply at once). The turn route now passes the reply text on as the model writes it —
// pulled out of the half-finished JSON, put through the same deterministic rewrites as the final reply —
// and the finished turn replaces that draft. Callers that do not ask for a stream get the old body.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { STREAM_HOLD_BACK, createReplyStreamer, partialReply, type TurnStreamEvent } from '@/lib/agent/replyStream'
import { TurnStreamParser } from '@/lib/agent/turnStream'
import { dropDoneSignOff, plainLiveWording } from '@/lib/agent/guardrail'
import { flattenMarkdown } from '@/lib/agent/turnHelpers'
import { checkCitations, referenceList } from '@/lib/kb/cite'
import { isGeminiEndpoint } from '@/lib/llmChat'

const read = (p: string) => readFileSync(p, 'utf8')

/** Replays wire events the way the client does. */
const apply = (events: TurnStreamEvent[]) => events.reduce((d, e) => (e.t === 'd' ? d + e.v : e.t === 'r' ? e.v : e.t === 'x' ? '' : d), '')
/** Feeds `raw` one character at a time (the harshest chunking) and returns the events. */
function streamByChar(raw: string, view?: (p: string, done: boolean) => string, holdBack?: number) {
  const events: TurnStreamEvent[] = []
  const s = createReplyStreamer({ emit: (e) => events.push(e), view, holdBack })
  for (let i = 1; i <= raw.length; i++) s.push(raw.slice(0, i))
  return { events, streamer: s }
}

describe('partialReply: the reply text out of unfinished JSON', () => {
  it('nothing until the key has arrived; then the text so far; done at the closing quote', () => {
    expect(partialReply('')).toBeNull()
    expect(partialReply('{"rep')).toBeNull()
    expect(partialReply('{"reply": "')).toEqual({ text: '', done: false })
    expect(partialReply('{"reply": "你好，我')).toEqual({ text: '你好，我', done: false })
    expect(partialReply('{"reply": "你好。", "intent": null')).toEqual({ text: '你好。', done: true })
  })
  it('decodes escapes, and waits when one is cut by the chunk boundary', () => {
    expect(partialReply('{"reply":"a\\nb \\"c\\" \\\\ d\\/e\\tf"}')).toEqual({ text: 'a\nb "c" \\ d/e\tf', done: true })
    expect(partialReply('{"reply":"line\\')).toEqual({ text: 'line', done: false })
    expect(partialReply('{"reply":"x\\u4f')).toEqual({ text: 'x', done: false })
    expect(partialReply('{"reply":"x\\u4f60\\u597d"')).toEqual({ text: 'x你好', done: true })
    expect(partialReply('{"reply":"\\ud83d\\ude00 ok"')).toEqual({ text: '😀 ok', done: true })
  })
  it('finds the reply when it is not the first key or the JSON sits in a code fence', () => {
    expect(partialReply('```json\n{ "intent": null, "reply" : "在后面"')).toEqual({ text: '在后面', done: true })
  })
})

describe('createReplyStreamer: what goes on the wire', () => {
  const raw = `{"reply": "${'水管漏水属于房东的维修责任，你可以先报修。'.repeat(3)}", "intent": null, "memory_writes": []}`
  const full = '水管漏水属于房东的维修责任，你可以先报修。'.repeat(3)
  it('the pieces add up to the reply, whatever the chunking; nothing after the reply field is sent', () => {
    const { events } = streamByChar(raw)
    expect(apply(events)).toBe(full)
    expect(events.every((e) => e.t === 'd')).toBe(true)
    expect(JSON.stringify(events)).not.toContain('memory_writes')
    // one push with everything gives the same text
    const once: TurnStreamEvent[] = []
    createReplyStreamer({ emit: (e) => once.push(e) }).push(raw)
    expect(apply(once)).toBe(full)
  })
  it('holds the tail back while the reply is still growing, and releases it at the end', () => {
    const events: TurnStreamEvent[] = []
    const s = createReplyStreamer({ emit: (e) => events.push(e) })
    const open = `{"reply": "${full}`
    s.push(open)
    expect(apply(events)).toBe(full.slice(0, full.length - STREAM_HOLD_BACK))
    s.push(open + '"')
    expect(apply(events)).toBe(full)
    // nothing is sent twice
    const n = events.length
    s.push(open + '", "intent": null}')
    expect(events.length).toBe(n)
  })
  it('a short reply shows only when it is complete', () => {
    const events: TurnStreamEvent[] = []
    const s = createReplyStreamer({ emit: (e) => events.push(e) })
    s.push('{"reply": "我查一下')
    expect(events).toEqual([])
    s.push('{"reply": "我查一下。"')
    expect(events).toEqual([{ t: 'd', v: '我查一下。' }])
  })
  it('reset withdraws the draft before a second model call, and says nothing when there was none', () => {
    const events: TurnStreamEvent[] = []
    const s = createReplyStreamer({ emit: (e) => events.push(e) })
    s.reset()
    expect(events).toEqual([])
    s.push('{"reply": "我查一下。"')
    s.reset()
    s.push('{"reply": "查到了：两份租约。"')
    expect(events).toEqual([{ t: 'd', v: '我查一下。' }, { t: 'x' }, { t: 'd', v: '查到了：两份租约。' }])
    expect(apply(events)).toBe('查到了：两份租约。')
  })
  it('never ends a piece on half an emoji', () => {
    const text = 'ab😀cd'
    const events: TurnStreamEvent[] = []
    const s = createReplyStreamer({ emit: (e) => events.push(e), holdBack: 3 })
    s.push(`{"reply": "${text}`)        // visible would be 'ab' + high surrogate
    for (const e of events) if (e.t === 'd' || e.t === 'r') expect(/[\ud800-\udbff]$/.test(e.v)).toBe(false)
    s.push(`{"reply": "${text}"`)
    expect(apply(events)).toBe(text)
  })
})

describe('the draft goes through the same rewrites as the final reply', () => {
  const hits = [
    { title: 'Residential Tenancies Act, 2006', section_ref: '20', heading_path: ['Part III'], url: 'https://example.test/rta#s20', consolidated_date: '2026-01-01', in_force: true, body: 'x' },
    { title: 'LTB Interpretation Guideline 5', section_ref: null, heading_path: ['Guideline 5'], url: 'https://example.test/g5', consolidated_date: '2026-01-01', in_force: true, body: 'x' },
  ] as unknown as Parameters<typeof referenceList>[1]
  // What the route's view does (app/api/agent/turn/route.ts).
  const view = (partial: string, done: boolean) => {
    let t = referenceList(checkCitations(partial, hits, 'zh').reply, hits).reply
    t = plainLiveWording(t)
    return flattenMarkdown(done ? dropDoneSignOff(t) : t)
  }
  const reply = '**先报修。** 按 RTA s. 20 维修是房东的责任 [K1]，细节见解释指南 5 [K2]。\n- 我会实时更新进度\n- 另见 RTA s. 999 的说法 [K1, K2]\n办完了。'
  const raw = JSON.stringify({ reply, intent: null })
  it('markers, invented section numbers, 「实时」, markdown and the sign-off never reach the reader', () => {
    const { events } = streamByChar(raw, view)
    const final = apply(events)
    expect(final).toBe(view(reply, true))
    expect(final).toContain('[1]')
    expect(final).toContain('[1, 2]')
    expect(final).toContain('相关条文（具体条号以官方页面为准）')
    expect(final).not.toMatch(/\[K|\*\*|实时|s\. 999|办完了/)
    // …and not at any point on the way there
    let draft = ''
    for (const e of events) {
      draft = e.t === 'd' ? draft + e.v : e.t === 'r' ? e.v : e.t === 'x' ? '' : draft
      expect(draft, JSON.stringify(e)).not.toMatch(/\[K\s*\d|s\. 999/)
    }
  })
  it('a rewrite that changes text already sent is corrected with a replace, not left wrong', () => {
    // hold-back 0 forces the case: 「实时」 is sent before 「更新」 arrives and removes it
    const { events } = streamByChar(JSON.stringify({ reply: '我会实时更新进度。' }), view, 0)
    expect(events.some((e) => e.t === 'r')).toBe(true)
    expect(apply(events)).toBe('我会更新进度。')
  })
})

describe('TurnStreamParser: the browser side', () => {
  const payload = { reply: '好的。', memory_writes: [], next_stage: null }
  const body = ` \n{"t":"d","v":"好"}\n \n{"t":"d","v":"的"}\n{"t":"final","payload":${JSON.stringify(payload)}}\n`
  it('heartbeats are ignored, drafts accumulate, the final payload is the turn', () => {
    const p = new TurnStreamParser()
    expect(p.feed(body)).toBe(true)
    p.end()
    expect(p.draft).toBe('好的')
    expect(p.final).toEqual(payload)
  })
  it('gives the same result wherever the network cuts the body', () => {
    for (let cut = 1; cut < body.length; cut++) {
      const p = new TurnStreamParser()
      p.feed(body.slice(0, cut)); p.feed(body.slice(cut)); p.end()
      expect([p.draft, p.final], `cut at ${cut}`).toEqual(['好的', payload])
    }
  })
  it('replace and withdraw', () => {
    const p = new TurnStreamParser()
    p.feed('{"t":"d","v":"我查一下"}\n')
    expect(p.draft).toBe('我查一下')
    expect(p.feed('{"t":"x"}\n')).toBe(true)
    expect(p.draft).toBe('')
    p.feed('{"t":"d","v":"查到了"}\n{"t":"r","v":"查到两份"}\n')
    expect(p.draft).toBe('查到两份')
  })
  it('a server that did not stream: whitespace then one JSON object is the final payload', () => {
    const p = new TurnStreamParser()
    expect(p.feed('   ')).toBe(false)
    p.feed(JSON.stringify(payload))
    expect(p.final).toBeNull()
    p.end()
    expect(p.final).toEqual(payload)
    expect(p.draft).toBe('')
    const err = new TurnStreamParser(); err.feed(' {"error":"agent reasoning unavailable"}'); err.end()
    expect(err.final).toEqual({ error: 'agent reasoning unavailable' })
  })
  it('the folded-in sources arrive ahead of the text and do not count as a draft change', () => {
    const p = new TurnStreamParser()
    expect(p.feed('{"t":"s","v":[{"href":"/messages","zh":"消息中心","en":"Messages"}]}\n')).toBe(false)
    expect(p.sources).toEqual([{ href: '/messages', zh: '消息中心', en: 'Messages' }])
    expect(p.feed('{"t":"d","v":"好"}\n')).toBe(true)
    expect(p.sources).toHaveLength(1)
  })
  it('a broken line in the middle is skipped; a body that ends broken throws', () => {
    const p = new TurnStreamParser()
    p.feed('{"t":"d","v":"a"}\n{not json}\n{"t":"d","v":"b"}\n')
    expect(p.draft).toBe('ab')
    const bad = new TurnStreamParser(); bad.feed(' {"reply": "cut off')
    expect(() => bad.end()).toThrow()
  })
})

describe('wiring', () => {
  const route = read('app/api/agent/turn/route.ts')
  it('the route streams only when asked, and keeps the old body otherwise', () => {
    expect(route).toContain('const wantStream = body.stream === true')
    expect(route).toContain("wantStream ? `${JSON.stringify({ t: 'final', payload })}\\n` : JSON.stringify(payload)")
    expect(route).toContain(": { 'Content-Type': 'application/json; charset=utf-8' } })")
    expect(route).toContain("'Cache-Control': 'no-store, no-transform'")
    // an error rides as the final payload in both modes
    expect(route).toContain('controller.enqueue(finalChunk({ error: safe }))')
  })
  it('the main call and the lookup pass are streamed; the unparseable-retry withdraws the draft; failures keep their types', () => {
    expect(route).toContain('callTurn = (m: CatalogModel): Promise<{ text: string }> => callTurnModel({')
    expect(route).toMatch(/runLookup\(sbAuth, role, turnUserId, lookupReq\)\s*\n\s*const \{ text: raw2 \} = await callTurnModel\(\{/)
    expect(route).toMatch(/replyStreamer\?\.reset\(\)\s*\n\s*const \{ text: raw2 \} = await llmChat\(\{/)
    expect(route).toContain("if (r.streamError) throw new LlmHttpError(503, `stream error: ${r.streamError}`)")
    expect(route).toContain("throw new LlmTruncatedError('stream finish_reason=length')")
    expect(route).toContain('if (!replyStreamer) return llmChat(params)')
  })
  it('the turn model thinks at the low setting, only Gemini is sent the field, and a refusal is retried without it', () => {
    expect(route).toContain("const TURN_REASONING_EFFORT: 'low' | 'medium' | 'high' | undefined = 'low'")
    expect(route).toContain('return await callTurnOnce({ ...base, reasoningEffort: TURN_REASONING_EFFORT })')
    expect(route).toContain('if (!TURN_REASONING_EFFORT || !(e instanceof LlmHttpError) || e.status !== 400) throw e')
    expect(route).toContain('return callTurnOnce(base)')
    const llm = read('lib/llmChat.ts')
    expect(llm).toContain('...(p.reasoningEffort && isGeminiEndpoint(p.model.baseUrl) ? { reasoning_effort: p.reasoningEffort } : {}),')
    expect(isGeminiEndpoint('https://generativelanguage.googleapis.com/v1beta/openai')).toBe(true)
    expect(isGeminiEndpoint('https://api.deepseek.com/v1')).toBe(false)
    expect(isGeminiEndpoint('https://evil.test/generativelanguage.googleapis.com/')).toBe(false)
    expect(isGeminiEndpoint(null)).toBe(false)
  })
  it('the draft view uses the same functions as the final reply', () => {
    const i = route.indexOf('view: (partial, done) => {')
    const view = route.slice(i, route.indexOf('},', i))
    for (const fn of ['checkCitations(', 'referenceList(', 'plainLiveWording(', 'flattenMarkdown(', 'dropDoneSignOff(']) expect(view, fn).toContain(fn)
  })
  it('the client asks for a stream only when it can show one, and the draft is never a message', () => {
    const orch = read('lib/agent/orchestrator.ts')
    expect(orch).toContain('...(args.onDraft ? { stream: true } : {})')
    expect(orch).toContain('const turn = (streamedTurn ?? JSON.parse(rawBody)) as {')
    const hook = read('lib/agent/useAgentSession.ts')
    expect(hook).toContain('onDraft: (t, src) => { if (threadIdRef.current === tid) { setStreamingText(t || null); setStreamingSources(src) } }')
    expect(route).toContain("if (wantStream && !anonymous && folded.items.length) streamEmit?.({ t: 's', v: folded.items })")
    expect((hook.match(/setStreamingText\(null\)/g) || []).length).toBeGreaterThanOrEqual(3)
    expect(hook).not.toMatch(/setMessages\([^)]*streamingText/)
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain('data-testid="agent-streaming"')
    expect(chat).toContain(': <ThinkingIndicator status={status} lang={lang} />}')
    expect(read('components/agent/AgentWorkspacePage.tsx')).toContain('streamingText={streamingText}')
  })
})
