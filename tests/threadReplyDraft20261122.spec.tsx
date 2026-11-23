// @vitest-environment jsdom
// V0.9 (2026-11-22, user: 「先做起草」): an agent's reply drafted by the model — never sent by it.
// Guards:
//  · what reaches the model: people's messages only, retractions out, the last few, cut; the client's
//    first name, role, area and budget — no address of any kind;
//  · the instructions: the agent's own voice, no invented listings / prices / showings, nothing about a
//    protected ground, rules questions only from the passages, JSON out;
//  · what is kept of the answer, and the net under it (a question about a protected ground is flagged);
//  · the route: the agent of an agent ↔ client conversation only, read as the caller, registration
//    current — and it never writes a message;
//  · the composer: the button is the agent's alone, the draft lands in the box, can be taken back, and
//    is sent through the ordinary path.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { all, textOf } from './helpers/dom'

const ME = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
const TID = '33333333-3333-4333-8333-333333333333'

const h = vi.hoisted(() => ({ msgs: [] as unknown[], inserts: [] as unknown[], uid: '11111111-1111-4111-8111-111111111111' as string | null }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ loading: false, user: h.uid ? { id: h.uid } : null }) }))
vi.mock('@/lib/messages/unread', () => ({ notifyMessagesChanged: () => undefined }))
vi.mock('@/lib/messages/openThread', () => ({ takeDraft: () => null }))
vi.mock('@/lib/supabase', () => {
  const table = (name: string) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'single']) c[m] = () => c
    c.insert = (row: unknown) => { h.inserts.push({ table: name, row }); return { select: () => ({ single: async () => ({ data: { id: 99 }, error: null }) }), then: (r: (v: unknown) => unknown) => Promise.resolve({ data: { id: 99 }, error: null }).then(r) } }
    c.upsert = async () => ({ error: null })
    c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: name === 'thread_messages' ? h.msgs : [], error: null }).then(res)
    return c
  }
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    supabase: {
      from: table,
      rpc: async (fn: string) => ({ data: fn === 'find_thread' || fn === 'open_thread' ? '33333333-3333-4333-8333-333333333333' : null, error: null }),
      channel: () => channel,
      removeChannel: () => undefined,
      auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-test' } } }) },
    },
  }
})

import ThreadPanel from '../components/threads/ThreadPanel'
import {
  DRAFT_BODY_MAX, DRAFT_HISTORY_MAX, DRAFT_OUT_MAX, canOfferDraft, draftErrorText, draftReminders, draftableTurns, flagMarketClaims, flagSensitiveAsks, lastClientTurn, parseReplyDraft, replyDraftSystemPrompt, replyDraftUserText, stripKbMarks,
} from '../lib/threads/replyDraft'

const read = (p: string) => readFileSync(p, 'utf8')
const byId = (root: ParentNode, id: string) => all(root, `[data-testid="${id}"]`)
const flush = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }) }
const row = (id: number, sender: string | null, body: string, over: Record<string, unknown> = {}) => ({ id, sender_id: sender, kind: 'message', body, ref_message_id: null, created_at: `2026-11-2${id % 10}T10:00:00Z`, ...over })

beforeEach(() => { h.msgs = []; h.inserts = []; h.uid = ME })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('what reaches the model', () => {
  it('people’s messages only, in order, retracted ones out, who is who by the agent’s id', () => {
    const turns = draftableTurns([
      row(3, ME, '好的，你想住哪一带？'),
      row(1, CLIENT, '你好，我想在北约克租一居'),
      row(2, null, 'system line', { kind: 'system' }),
      row(4, CLIENT, '写错了的一条'),
      row(5, CLIENT, '', { kind: 'retraction', ref_message_id: 4 }),
      row(6, CLIENT, '预算 2500 左右'),
      row(7, CLIENT, '   '),
    ], ME)
    expect(turns.map((t) => [t.from, t.body])).toEqual([['client', '你好，我想在北约克租一居'], ['agent', '好的，你想住哪一带？'], ['client', '预算 2500 左右']])
    expect(lastClientTurn(turns)?.body).toBe('预算 2500 左右')
    expect(lastClientTurn(draftableTurns([row(1, ME, '你好')], ME))).toBeNull()
  })

  it('only the last few messages go, each cut to size', () => {
    const many = Array.from({ length: 30 }, (_, i) => row(i + 1, i % 2 ? ME : CLIENT, `m${i + 1} ` + 'x'.repeat(3000)))
    const turns = draftableTurns(many, ME)
    expect(turns.length).toBe(DRAFT_HISTORY_MAX)
    expect(turns[turns.length - 1].body.startsWith('m30 ')).toBe(true)
    for (const t of turns) expect(t.body.length).toBeLessThanOrEqual(DRAFT_BODY_MAX)
  })

  it('the context names the agent as the public directory does, the client by what they told the agent — no address', () => {
    const text = replyDraftUserText({
      agent: { name: 'Mia Chen', descriptor: '地产销售代表', brokerage: 'Avion Realty Inc., Brokerage', languages: ['普通话', '英语'], areas: ['North York'], focus: ['帮租客找房'], bio: null },
      client: { name: 'Sam', role: 'tenant', area: 'North York', budget: '$2,500' },
      turns: [{ from: 'client', body: '请问押金最多收多少？', at: '2026-11-22T10:00:00Z' }],
      seed: '你好 Sam，', reference: '【RTA s.106】…', notesLang: 'zh',
    })
    for (const part of ['注册名：Mia Chen（地产销售代表）', '经纪公司：Avion Realty Inc., Brokerage', '称呼：Sam', '身份：租客（想租房）', '对方（2026-11-22）：请问押金最多收多少？', '【经纪已写】\n你好 Sam，', '【参考资料】\n【RTA s.106】…', '【提醒语言】中文']) expect(text, part).toContain(part)
    expect(text).not.toMatch(/@|邮箱|电话/)
    // no passages → the model is told so, and rule 6 applies
    expect(replyDraftUserText({ agent: { name: 'A', descriptor: '经纪', brokerage: '', languages: [], areas: [], focus: [], bio: null }, client: { name: null, role: null, area: null, budget: null }, turns: [], seed: '', reference: '', notesLang: 'en' })).toContain('本次没有检索到相关原文')
  })
})

describe('the instructions', () => {
  const sys = replyDraftSystemPrompt()
  it('the model drafts, the agent sends', () => {
    expect(sys).toContain('由经纪本人修改后自己发送。你不发送任何东西')
    expect(sys).toContain('以经纪本人的口吻、第一人称写。不提 AI')
  })
  it('nothing invented, nothing about a protected ground, rules only from the passages, no claim of things done, no promise of representation', () => {
    expect(sys).toContain('不报具体房源、地址、价格、空置情况、带看时间、佣金或任何费用')
    for (const g of ['年龄', '国籍或移民身份', '宗教', '婚姻与家庭状况', '残障', '是否领取社会救助', '不问收入来源']) expect(sys, g).toContain(g)
    expect(sys).toContain('条号只用参考资料里出现的')
    expect(sys).toContain('不说已经做了任何事')
    expect(sys).toContain('不作代表关系上的承诺')
    expect(sys).toContain('只输出 JSON：{"draft": "要发的正文", "notes": ["只给经纪看的提醒"]}')
  })
})

describe('what is kept of the answer', () => {
  it('JSON, fenced JSON and plain text all give a draft; a half-written object gives none', () => {
    expect(parseReplyDraft('{"draft":"你好 Sam，方便说下入住时间吗？","notes":["预算他没说上限"]}')).toEqual({ draft: '你好 Sam，方便说下入住时间吗？', notes: ['预算他没说上限'] })
    expect(parseReplyDraft('```json\n{"draft":"Hi Sam","notes":[]}\n```').draft).toBe('Hi Sam')
    expect(parseReplyDraft('Hi Sam, when would you like to move in?')).toEqual({ draft: 'Hi Sam, when would you like to move in?', notes: [] })
    expect(parseReplyDraft('{"draft":"Hi Sam, when wou').draft).toBe('')
    expect(parseReplyDraft('').draft).toBe('')
  })
  it('a label in front is dropped, blank runs collapse, the draft and the notes are capped', () => {
    expect(parseReplyDraft('{"draft":"草稿：你好\\n\\n\\n\\n再见","notes":[]}').draft).toBe('你好\n\n再见')
    const long = parseReplyDraft(JSON.stringify({ draft: 'a'.repeat(5000), notes: ['1', '2', '3', '4', 5, ''] }))
    expect(long.draft.length).toBe(DRAFT_OUT_MAX)
    expect(long.notes).toEqual(['1', '2', '3'])
  })
  it('a question about a protected ground is flagged for the agent; ordinary questions are not', () => {
    expect(flagSensitiveAsks('你好，请问你们有孩子吗？打算什么时候入住？', true)[0]).toContain('婚姻与家庭状况')
    expect(flagSensitiveAsks('Are you a permanent resident? And how old are you?', false)[0]).toMatch(/age.*citizenship|citizenship.*age/)
    expect(flagSensitiveAsks('请问你是领救济吗？', true)[0]).toContain('社会救助')
    expect(flagSensitiveAsks('想住哪个区域、预算多少、几个人住、要不要车位？之后的申请需要收入证明。', true)).toEqual([])
    expect(flagSensitiveAsks('How many people will live there, and do you need parking?', false)).toEqual([])
  })
  it('a judgement on the market is flagged — the model has no data for one (the first live draft wrote 「房源选择不少」)', () => {
    expect(flagMarketClaims('North York 两室目前的房源选择不少，我很乐意协助您找房。', true)[0]).toContain('AI 没有这方面的数据')
    expect(flagMarketClaims('There are plenty of options in that area right now.', false).length).toBe(1)
    expect(flagMarketClaims('It is a competitive market, so let us move fast.', false).length).toBe(1)
    expect(flagMarketClaims('很高兴收到您的消息。方便说下几个人住、要不要车位吗？我确认后回复你。', true)).toEqual([])
    expect(flagMarketClaims('Happy to help. How many people will live there?', false)).toEqual([])
    expect(replyDraftSystemPrompt()).toContain('也不评价市场或房源多少——你没有任何市场数据')
  })
  it('the passage marks never reach the message (the first live rules draft read 「…的租金 [K1][K2]。」)', () => {
    expect(stripKbMarks('押金只能用于抵扣最后一个周期的租金 [K1][K2]。请问几个人住？')).toBe('押金只能用于抵扣最后一个周期的租金。请问几个人住？')
    expect(stripKbMarks('The deposit is capped at one month [K1, K3]. Anything else?')).toBe('The deposit is capped at one month. Anything else?')
    expect(stripKbMarks('见 [K2、K4]，另见[ K10 ]')).toBe('见，另见')
    expect(stripKbMarks('Unit [B] on King St, call [Kevin]')).toBe('Unit [B] on King St, call [Kevin]')
    const route = read('app/api/threads/draft-reply/route.ts')
    expect(route).toContain('referenceList(cited.reply, hits).refs')
    expect(route).toContain('const draft = stripKbMarks(cited.reply)')
    // the marks are read for the sources before they are removed
    expect(route.indexOf('referenceList(cited.reply, hits)')).toBeLessThan(route.indexOf('stripKbMarks(cited.reply)'))
  })
  it('the reminder comes from the client row, not from the model', () => {
    expect(draftReminders({ info_guide_given_at: null }, true)[0]).toContain('RECO Information Guide')
    expect(draftReminders({ info_guide_given_at: '2026-11-01' }, true)).toEqual([])
  })
})

describe('the route', () => {
  const route = read('app/api/threads/draft-reply/route.ts')
  it('reads the thread as the caller, and only for the agent of an agent ↔ client conversation with a current registration', () => {
    expect(route).toContain("sb.from('threads').select('id, kind, ref_id, provider_id, subject_user').eq('id', tid).maybeSingle()")
    expect(route).toContain("sb.from('thread_messages').select('id, sender_id, kind, body, ref_message_id, created_at, acting_role')")
    // two kinds of conversation have an answering side (the provider's is guarded in providerInquiry20261122)
    expect(route).toContain("if (thread.kind !== 'agent_client' && thread.kind !== 'provider_inquiry') return json({ error: 'not_supported' }, 403)")
    expect(route).toContain("if (!client || client.agent_auth_id !== uid) return { error: 'agent_only', status: 403 }")
    expect(route).toContain("!isRegistrationCurrent(prof)) return { error: 'registration_not_live', status: 403 }")
    expect(route).toContain("if ('error' in built) return json({ error: built.error }, built.status)")
    expect(route).toContain("if (!last) return json({ error: 'nothing_to_reply' }, 409)")
  })
  it('never posts: no write to the conversation, and the audit row carries no text', () => {
    expect(route).not.toMatch(/from\('thread_messages'\)\s*\.(insert|update|upsert|delete)/)
    expect(route).not.toContain('postSystemMessage')
    expect(route).not.toContain('notifyThreadParties')
    expect(route).toContain("action: 'thread_reply_drafted'")
    const meta = route.slice(route.indexOf('metadata: {', route.indexOf('thread_reply_drafted')))
    expect(meta.slice(0, meta.indexOf('}'))).not.toMatch(/draft:|body|text/)
  })
  it('first name only to the model, cost limits fail open, citations are checked like the assistant’s', () => {
    expect(route).toContain("const firstName = (n: string | null | undefined) => (n || '').trim().split(/\\s+/)[0] || null")
    expect(route).toContain('client: { name: firstName(client.name),')
    expect(route).not.toMatch(/select\('[^']*\b(email|phone)\b/)
    expect(route).toContain('underHourlyLimit(`thread-draft:${uid}`, PER_USER_PER_HOUR, true)')
    expect(route).toContain("underHourlyLimit('thread-draft:global', SITE_PER_HOUR, true)")
    expect(route).toContain('checkCitations(parsed.draft, hits, notesLang, citationAllowance(hits, userText))')
    expect(route).toContain("meta: { userId: uid, slot: 'turn', source: 'thread-draft' }")
  })
})

describe('who is offered the draft, and what the composer says when it fails', () => {
  const msgs = [{ kind: 'message', sender_id: CLIENT }]
  it('the agent of an agent ↔ client conversation, once the other side has written', () => {
    expect(canOfferDraft('agent', 'agent_client', msgs, ME)).toBe(true)
    expect(canOfferDraft('agent', 'agent_client', [{ kind: 'message', sender_id: ME }], ME)).toBe(false)
    expect(canOfferDraft('agent', 'agent_client', [{ kind: 'system', sender_id: null }], ME)).toBe(false)
    expect(canOfferDraft('tenant', 'agent_client', msgs, ME)).toBe(false)
    expect(canOfferDraft('landlord', 'agent_client', msgs, ME)).toBe(false)
    expect(canOfferDraft('agent', 'tenancy', msgs, ME)).toBe(false)
    expect(canOfferDraft('agent', 'agent_client', msgs, null)).toBe(false)
  })
  it('each refusal has its own sentence, in one language', () => {
    expect(draftErrorText('nothing_to_reply', true)).toContain('对方还没有发来消息')
    expect(draftErrorText('registration_not_live', true)).toContain('RECO')
    expect(draftErrorText('rate_limited', false)).toContain('Too many drafts')
    expect(draftErrorText('whatever', true)).toContain('请再试一次，或者自己写')
    expect(draftErrorText('model_failed', false)).not.toMatch(/[一-鿿]/)
  })
})

describe('the composer', () => {
  const full = (id: number, sender: string, body: string) => ({ id, thread_id: TID, sender_id: sender, sender_kind: sender === ME ? 'agent' : 'tenant', acting_role: null, sender_label: null, kind: 'message', body, ref_message_id: null, attachments: [], meta: {}, created_at: '2026-11-22T10:00:00Z', channel: 'app' })
  const mount = async (viewer: 'agent' | 'tenant', kind: 'agent_client' | 'tenancy' = 'agent_client') => {
    let r!: ReturnType<typeof render>
    await act(async () => { r = render(React.createElement(ThreadPanel, { kind, refId: '44444444-4444-4444-8444-444444444444', viewer, zh: true })) })
    await flush()
    return r.container
  }

  it('the button is there for the agent, not for the client and not on another kind of conversation', async () => {
    h.msgs = [full(1, CLIENT, '你好，我想在北约克租一居')]
    expect(byId(await mount('agent'), 'thread-ai-draft').length).toBe(1)
    cleanup()
    h.uid = CLIENT
    expect(byId(await mount('tenant'), 'thread-ai-draft').length).toBe(0)
    cleanup()
    h.uid = ME
    expect(byId(await mount('agent', 'tenancy'), 'thread-ai-draft').length).toBe(0)
  })

  it('the draft lands in the box with its notes; it can be taken back; nothing is posted until the agent sends', async () => {
    h.msgs = [full(1, CLIENT, '你好，我想在北约克租一居')]
    const fetchMock = vi.fn(async (_url: string, _init?: { body?: string }) => ({ ok: true, json: async () => ({ draft: '你好，方便说下入住时间吗？', notes: ['预算他没说'], sources: [{ label: 'RTA s. 106', url: 'https://www.ontario.ca/laws/statute/06r17#BK153' }, { label: 'bad', url: 'javascript:alert(1)' }], reminders: ['客户表里还没有记录向这位客户提供 RECO Information Guide 的日期。'] }) }))
    vi.stubGlobal('fetch', fetchMock)
    const c = await mount('agent')
    const input = byId(c, 'thread-input')[0] as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '你好，' } })
    expect(textOf(byId(c, 'thread-ai-draft')[0])).toBe('AI 接着写完')
    await act(async () => { fireEvent.click(byId(c, 'thread-ai-draft')[0]) })
    await flush()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/threads/draft-reply')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ thread_id: TID, seed: '你好，', lang: 'zh' })
    expect(input.value).toBe('你好，方便说下入住时间吗？')
    expect(input.getAttribute('rows')).toBe('6')
    const note = byId(c, 'thread-ai-note')[0]
    expect(textOf(note)).toContain('AI 起草的，发出前请核对和修改。发出去就是你本人的消息。')
    expect(byId(c, 'thread-ai-note-line').map(textOf)).toEqual(['· 预算他没说'])
    expect(byId(c, 'thread-ai-reminder').length).toBe(1)
    // the passages the rules part rests on, as links for the agent — only https ones are drawn
    expect(all(byId(c, 'thread-ai-sources')[0], 'a').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['RTA s. 106 ↗', 'https://www.ontario.ca/laws/statute/06r17#BK153']])
    // drafting wrote nothing to the conversation
    expect(h.inserts).toEqual([])
    // take it back: the agent's own words return
    fireEvent.click(byId(c, 'thread-ai-undo')[0])
    expect(input.value).toBe('你好，')
    expect(byId(c, 'thread-ai-note').length).toBe(0)
  })

  it('a refusal is one sentence under the box, and the box keeps what the agent wrote', async () => {
    h.msgs = [full(1, CLIENT, '你好')]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'registration_not_live' }) })))
    const c = await mount('agent')
    const input = byId(c, 'thread-input')[0] as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '我自己写的' } })
    await act(async () => { fireEvent.click(byId(c, 'thread-ai-draft')[0]) })
    await flush()
    expect(input.value).toBe('我自己写的')
    expect(byId(c, 'thread-ai-note').length).toBe(0)
    expect(textOf(c)).toContain('RECO 注册核验有效后才能用 AI 起草。')
  })

  it('the wiring in the source: the agent sends through the ordinary path, and sending clears the note', () => {
    const panel = read('components/threads/ThreadPanel.tsx')
    expect(panel).toContain('{canOfferDraft(viewer, kind, msgs, me) && (')
    expect(panel).toContain("setDraft(''); setPending([]); setAiNote(null)")
    expect(panel).toContain('rows={aiNote ? 6 : 1}')
    // one insert path for messages (plus the retraction one) — drafting added none
    expect(panel.match(/from\('thread_messages'\)\.insert\(/g)?.length).toBe(2)
  })
})
