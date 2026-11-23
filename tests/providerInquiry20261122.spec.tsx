// @vitest-environment jsdom
// V0.9 (2026-11-22, user: 「维修服务和专业服务里的发消息也要有这个 ai 回复的功能」). Those two tabs had no
// in-app message at all — an e-mail address and a phone number only — so this is two things:
//  A. 「发消息」 to a service provider: a new conversation kind `provider_inquiry` (one per provider and
//     person, opened by the server), with the directory cards as its way in;
//  B. the reply drafted for the provider — never sent for them — with stricter rules for the licensed
//     professions (intake only: no opinion, no premium).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { all, textOf } from './helpers/dom'

const ME = '11111111-1111-4111-8111-111111111111'
const PERSON = '22222222-2222-4222-8222-222222222222'
const PROVIDER_ID = '55555555-5555-4555-8555-555555555555'

const h = vi.hoisted(() => ({ msgs: [] as unknown[], uid: '11111111-1111-4111-8111-111111111111' as string | null, session: true }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ loading: false, user: h.uid ? { id: h.uid } : null }) }))
vi.mock('@/lib/messages/unread', () => ({ notifyMessagesChanged: () => undefined }))
vi.mock('@/lib/messages/openThread', () => ({ takeDraft: () => null }))
vi.mock('@/lib/supabase', () => {
  const table = (name: string) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit']) c[m] = () => c
    c.upsert = async () => ({ error: null })
    c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: name === 'thread_messages' ? h.msgs : [], error: null }).then(res)
    return c
  }
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    supabase: {
      from: table,
      rpc: async () => ({ data: '33333333-3333-4333-8333-333333333333', error: null }),
      channel: () => channel,
      removeChannel: () => undefined,
      auth: { getSession: async () => ({ data: { session: h.session ? { access_token: 'jwt-test' } : null } }) },
    },
  }
})

import ThreadPanel from '../components/threads/ThreadPanel'
import ProviderContact, { providerContactErrorText } from '../components/directory/ProviderContact'
import { KIND_LABEL, KIND_TAG, threadHref } from '../lib/threads/shared'
import { DRAFT_SIDE, canOfferDraft, draftErrorText, flagUnlistedAmounts, providerDraftSystemPrompt, providerDraftUserText } from '../lib/threads/replyDraft'

const read = (p: string) => readFileSync(p, 'utf8')
const byId = (root: ParentNode, id: string) => all(root, `[data-testid="${id}"]`)
const flush = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }) }

beforeEach(() => { h.msgs = []; h.uid = ME; h.session = true })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

// ───────────────────────────────────────────────────────────── A. the conversation

describe('provider_inquiry is a conversation kind of its own', () => {
  it('named in the message centre, and it lives there', () => {
    expect(KIND_LABEL.provider_inquiry).toEqual({ zh: '服务商咨询', en: 'Provider inquiry' })
    expect(KIND_TAG.provider_inquiry.zh).toBe('服务商咨询')
    expect(threadHref('provider_inquiry', PROVIDER_ID, null, 'provider')).toBe('/messages')
  })

  it('the migration: the kind is allowed, the thread stores its provider, and who is a party is read from the stored thread', () => {
    const sql = read('supabase/migrations/20261122b_provider_inquiry_threads.sql')
    expect(sql).toContain('add column if not exists provider_id uuid references public.service_providers(id)')
    expect(sql).toMatch(/add constraint threads_kind_check[\s\S]{0,260}'provider_inquiry'::text/)
    const party = sql.slice(sql.indexOf('FUNCTION public.party_for'), sql.indexOf('FUNCTION public.people_for'))
    const branch = party.slice(party.indexOf("elsif p_kind = 'provider_inquiry' then"), party.indexOf("elsif p_kind = 'support' then"))
    // the person who wrote is 'member', the provider's own account 'provider' — nobody else
    expect(branch).toContain("from public.threads x where x.kind = 'provider_inquiry' and x.ref_id = p_ref")
    expect(branch).toContain("if th.subject_user = uid then r := 'member';")
    expect(branch).toContain('where p.id = th.provider_id and p.auth_id = uid')
    expect(branch).toContain("then r := 'provider';")
    // the caller's own arguments are not consulted in this branch
    expect(branch).not.toMatch(/p_subject|p_listing/)
    // a client cannot open one: open_thread is not part of this migration, and its kind list is unchanged
    expect(sql).not.toContain('FUNCTION public.open_thread')
    // the people list names both sides
    const people = sql.slice(sql.indexOf('FUNCTION public.people_for'))
    expect(people).toContain("'member'::text, 'app'::text, false, th.subject_user = uid")
    expect(people).toContain("from public.service_providers p where p.id = th.provider_id")
  })

  it('the server: one thread per provider and person, both sides found for notification', () => {
    const server = read('lib/threads/server.ts')
    expect(server).toContain("const COLS = 'id, kind, ref_id, household_id, title, listing_id, subject_user, provider_id'")
    expect(server).toContain('const ref = await uuidV5(provider.id, personId)')
    expect(server).toContain("return ensureThread(admin, 'provider_inquiry', ref, { title: provider.name || 'Provider', createdBy: personId, providerId: provider.id, subjectUser: personId })")
    const branch = server.slice(server.indexOf("if (t.kind === 'provider_inquiry') {"), server.indexOf("if (t.kind === 'support') {"))
    expect(branch).toContain("kind: 'member'")
    // a provider without an account is reached by relay e-mail, as on a work order
    expect(branch).toContain('email: pr.auth_id ? null : pr.contact_email')
    // the routes that look a thread's parties up read the new column
    expect(read('app/api/threads/notify/route.ts')).toContain('listing_id, subject_user, provider_id')
  })
})

describe('POST /api/providers/[id]/contact', () => {
  const route = read('app/api/providers/[id]/contact/route.ts')
  it('signed-in people only, to a verified provider only, never to yourself', () => {
    expect(route).toContain("if (!user || user.is_anonymous) return json({ error: 'sign_in_required' }, 401)")
    expect(route).toContain("if (!prov || prov.status !== 'verified') return json({ error: 'not_found' }, 404)")
    expect(route).toContain("if (prov.auth_id && prov.auth_id === user.id) return json({ error: 'own_profile' }, 400)")
    expect(route).toContain('if (message.length < CONTACT_MIN || message.length > CONTACT_MAX)')
  })
  it('it sends a notification, so its limits fail closed — per person, site-wide and per provider', () => {
    expect(route).toContain("underMailLimits('provider-contact', user.id, 5, 120)")
    expect(route).toContain('underHourlyLimit(`provider-contact:p:${prov.id}`, 30, false)')
  })
  it('the message is the person’s own, as a member; a hat is kept only when the account holds it; no address is returned', () => {
    expect(route).toContain("senderId: user.id, senderKind: 'member', actingRole")
    expect(route).toContain("if (body.as === 'landlord' && h.landlord) actingRole = 'landlord'")
    expect(route).toContain('ensureProviderThread(admin, { id: prov.id, name: providerName }, user.id)')
    expect(route).not.toMatch(/contact_email|contact_phone/)
    expect(route).toContain('return json({ ok: true, thread_id: thread.id })')
  })
})

describe('「发消息」 to a provider', () => {
  it('both tabs lead to it: the card’s 发消息 opens the contact panel on the provider’s page, where the address and the number are too', () => {
    // the same day the cards were made to match the agent directory, so the form moved off the card
    const card = read('components/directory/ProviderCard.tsx')
    expect(card).toContain('<Link href={`${href}#contact`}')
    expect(card).not.toMatch(/mailto:|ProviderContact/)
    for (const f of ['app/providers/page.tsx', 'app/providers/professional/page.tsx']) expect(read(f), f).toContain('<ProviderCard')
    const page = read('app/providers/[id]/page.tsx')
    expect(page).toContain('<ProviderContact providerId={p.id} providerName={name} zh={zh} as={activeHat(hats, auth.role)} professional={professionalOnly} />')
    expect(page).toContain('href={`mailto:${p.contact_email}`}')
  })

  it('write → send; then a link into the conversation', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: { body?: string; headers?: Record<string, string> }) => ({ ok: true, json: async () => ({ ok: true, thread_id: 'thread-9' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { container: c } = render(React.createElement(ProviderContact, { providerId: PROVIDER_ID, providerName: 'Northline', zh: true, as: 'landlord' }))
    expect(byId(c, 'provider-contact-form').length).toBe(1)
    const send = byId(c, 'provider-contact-send')[0] as HTMLButtonElement
    expect(send.disabled).toBe(true) // nothing written yet
    fireEvent.change(byId(c, 'provider-contact-input')[0], { target: { value: '太短' } })
    expect(send.disabled).toBe(true) // under the minimum
    fireEvent.change(byId(c, 'provider-contact-input')[0], { target: { value: '厨房水槽下面漏水，在 North York，周末方便上门吗？' } })
    expect(send.disabled).toBe(false)
    await act(async () => { fireEvent.click(send) })
    await flush()
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/providers/${PROVIDER_ID}/contact`)
    expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBe('Bearer jwt-test')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ message: '厨房水槽下面漏水，在 North York，周末方便上门吗？', as: 'landlord' })
    const sent = byId(c, 'provider-contact-sent')[0]
    expect(textOf(sent)).toContain('已发给 Northline')
    expect(all(sent, 'a')[0].getAttribute('href')).toBe('/messages?t=thread-9')
  })

  it('a refusal is one sentence and the text stays in the box', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'rate_limited' }) })))
    const { container: c } = render(React.createElement(ProviderContact, { providerId: PROVIDER_ID, providerName: 'Northline', zh: true }))
    const input = byId(c, 'provider-contact-input')[0] as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '热水器不出热水了，在 Markham。' } })
    await act(async () => { fireEvent.click(byId(c, 'provider-contact-send')[0]) })
    await flush()
    expect(textOf(byId(c, 'provider-contact-error')[0])).toContain('发得太频繁了')
    expect(input.value).toBe('热水器不出热水了，在 Markham。')
    expect(providerContactErrorText('own_profile', true)).toContain('你自己的服务商档案')
    expect(providerContactErrorText('whatever', false)).not.toMatch(/[一-鿿]/)
  })
})

// ───────────────────────────────────────────────────────────── B. the provider's draft

describe('the reply drafted for a provider', () => {
  const trade = providerDraftSystemPrompt(false)
  const licensed = providerDraftSystemPrompt(true)

  it('the provider answers a provider inquiry, the agent an agent conversation — never the person who wrote in', () => {
    expect(DRAFT_SIDE).toEqual({ agent_client: 'agent', provider_inquiry: 'provider' })
    const msgs = [{ kind: 'message', sender_id: PERSON }]
    expect(canOfferDraft('provider', 'provider_inquiry', msgs, ME)).toBe(true)
    expect(canOfferDraft('tenant', 'provider_inquiry', msgs, ME)).toBe(false)
    expect(canOfferDraft('landlord', 'provider_inquiry', msgs, ME)).toBe(false)
    expect(canOfferDraft('agent', 'provider_inquiry', msgs, ME)).toBe(false)
    expect(canOfferDraft('provider', 'agent_client', msgs, ME)).toBe(false)
    // a work-order conversation carries quotes and a state machine of its own: not offered there
    expect(canOfferDraft('provider', 'work_order', msgs, ME)).toBe(false)
  })

  it('a trade: its own registered prices only, no total, no promised time; safety first when it is an emergency', () => {
    expect(trade).toContain('由服务商本人修改后自己发送。你不发送任何东西')
    expect(trade).toContain('价格只能引用「服务商资料」里登记的上门费和工时费，原样引用；不估算总价、不给资料里没有的任何金额、不承诺上门时间或档期、不保证结果')
    expect(trade).toContain('拨打 911 或燃气、电力公司的紧急电话')
    expect(trade).toContain('对方是租客时，不替任何人决定费用该谁出')
    for (const g of ['年龄', '国籍或移民身份', '宗教', '残障', '是否领取社会救助']) expect(trade, g).toContain(g)
    expect(trade).not.toContain('不给法律意见')
  })

  it('a licensed profession: intake only — no opinion, no premium, no fee', () => {
    expect(licensed).toContain('持牌的专业服务（律师、持牌 Paralegal 或保险经纪）')
    expect(licensed).toContain('这条消息只做接待')
    expect(licensed).toContain('不给法律意见或保险建议，不评价对方的事有没有道理或胜算')
    expect(licensed).toContain('不报任何费用或保费')
    expect(licensed).toContain('提醒对方不要在消息里发证件号码')
    expect(licensed).not.toContain('拨打 911')
  })

  it('the context: the provider as registered, the person by first name and the hat they wrote under', () => {
    const text = providerDraftUserText({
      provider: { name: '[TEST] Northline Home Services', trades: ['水管', '电气'], cities: ['Toronto', 'Vaughan'], callOutFee: 75, hourlyRate: 110, fixedQuotes: false, professional: false },
      person: { name: 'Sam', hat: 'landlord' },
      turns: [{ from: 'client', body: '厨房水槽漏水', at: '2026-11-22T10:00:00Z' }, { from: 'agent', body: '收到', at: '2026-11-22T11:00:00Z' }],
      seed: '', notesLang: 'zh',
    })
    for (const part of ['名称：[TEST] Northline Home Services', '服务项目：水管、电气', '登记的价格：上门费 $75，工时费 $110/小时', '发消息时的身份：房东', '对方（2026-11-22）：厨房水槽漏水', '服务商（2026-11-22）：收到', '【服务商已写】（空）']) expect(text, part).toContain(part)
    expect(text).not.toMatch(/@|邮箱|电话/)
    const fixed = providerDraftUserText({ provider: { name: 'A', trades: [], cities: [], callOutFee: 75, hourlyRate: null, fixedQuotes: true, professional: false }, person: { name: null, hat: null }, turns: [], seed: '', notesLang: 'en' })
    expect(fixed).toContain('登记的价格：固定报价（了解情况后报价），没有登记单价')
    expect(fixed).toContain('发消息时的身份：未注明')
  })

  it('an amount that is not one of the provider’s registered prices is flagged', () => {
    expect(flagUnlistedAmounts('上门费 $75，工时费 $110/小时。', [75, 110], true)).toEqual([])
    expect(flagUnlistedAmounts('这种情况一般 $350 左右能修好，上门费 $75。', [75, 110], true)[0]).toContain('$350')
    expect(flagUnlistedAmounts('It usually comes to about 400 dollars.', [75, 110], false)[0]).toContain('$400')
    // a licensed profession states no amount at all
    expect(flagUnlistedAmounts('初次咨询 $150。', [], true)[0]).toContain('$150')
    expect(flagUnlistedAmounts('周六上午 10 点可以吗？', [75], true)).toEqual([])
  })

  it('the route: the provider’s own account, status verified; a licensed profession is decided from the registered trades', () => {
    const route = read('app/api/threads/draft-reply/route.ts')
    expect(route).toContain("if (!prov || !prov.auth_id || prov.auth_id !== uid) return { error: 'provider_only', status: 403 }")
    expect(route).toContain("if (prov.status !== 'verified') return { error: 'provider_not_verified', status: 403 }")
    expect(route).toContain("const LICENSED = new Set(['paralegal', 'lawyer', 'insurance_broker'])")
    expect(route).toContain('flagUnlistedAmounts(draft, professional ? [] : [fee, rate], zh)')
    // no knowledge-base passages for a provider: a rules answer is not theirs to draft from our corpus
    const prov = route.slice(route.indexOf('async function buildProvider'), route.indexOf('export async function POST'))
    expect(prov).not.toContain('kbSearch')
    expect(prov).not.toMatch(/contact_email|contact_phone/)
    expect(draftErrorText('provider_not_verified', true)).toContain('资质核验有效后')
    expect(draftErrorText('provider_only', true)).toContain('答复咨询的一方')
  })

  it('the composer offers it to the provider on a provider inquiry, and to nobody on the other side', async () => {
    const msg = { id: 1, thread_id: 't', sender_id: PERSON, sender_kind: 'member', acting_role: 'landlord', sender_label: null, kind: 'message', body: '厨房水槽漏水', ref_message_id: null, attachments: [], meta: {}, created_at: '2026-11-22T10:00:00Z', channel: 'app' }
    h.msgs = [msg]
    let r!: ReturnType<typeof render>
    await act(async () => { r = render(React.createElement(ThreadPanel, { kind: 'provider_inquiry', refId: PROVIDER_ID, viewer: 'provider', zh: true })) })
    await flush()
    expect(textOf(byId(r.container, 'thread-ai-draft')[0])).toBe('AI 起草回复')
    cleanup()
    h.uid = PERSON
    await act(async () => { r = render(React.createElement(ThreadPanel, { kind: 'provider_inquiry', refId: PROVIDER_ID, viewer: 'landlord', zh: true })) })
    await flush()
    expect(byId(r.container, 'thread-ai-draft').length).toBe(0)
  })
})
