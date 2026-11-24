// @vitest-environment jsdom
// V0.9 (2026-11-24, user: 「所有产品页面里的模块，都要能在 AI 对话里调用，也能用 AI 对话完成服务」 → asked which module
// to finish in the conversation first: 「从导入租约开始」).
// A signed-in person who asks to bring a signed lease in gets the lease import card under the reply:
// the file that came with the message (or one picked on the card) is read by the import page's own
// extraction, every field is editable, and only 「确认导入」 creates the managed tenancy — by the
// person's own calls, the same routes and RPCs as /leases/import. The model is told the card is
// there; it never decides to show it, never sees its fields and cannot submit it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const db = vi.hoisted(() => ({
  user: { id: 'u-landlord' } as null | { id: string },
  rpc: [] as [string, Record<string, unknown> | undefined][],
  uploads: [] as string[],
  households: [] as Record<string, unknown>[],
  createError: null as string | null,
  facts: 0,
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ loading: false, user: db.user, role: null }) }))
vi.mock('@/lib/facts/useFacts', () => ({ notifyFactsChanged: () => { db.facts++ } }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      db.rpc.push([name, args])
      if (name === 'my_households_for_import') return { data: db.households, error: null }
      if (name === 'create_household_import') return db.createError ? { data: null, error: { message: db.createError } } : { data: 'h-1', error: null }
      return { data: null, error: null }
    },
    storage: { from: (bucket: string) => ({ upload: async (path: string) => { db.uploads.push(`${bucket}:${path}`); return { error: null } } }) },
  },
}))

import { I18nProvider } from '../lib/i18n'
import LeaseImportChatCard, { filesFromAttachments, forgetLeaseImportReads, leaseImportDoneKey } from '../components/agent/LeaseImportChatCard'
import { LEASE_IMPORT_TURN_NOTE, wantsLeaseImport } from '../lib/agent/leaseImportIntent'
import { EMPTY_IMPORT_FORM, IMPORT_MAX_BYTES, IMPORT_MAX_FILES, acceptableLeaseFiles, createImportArgs, defaultInvites, fieldsRead, formFromExtraction, importFormError, leaseFilePath } from '../lib/household/importForm'
import { sanitizeLeaseImportExtraction } from '../lib/household/importExtract'
import { replyClaimsExecution } from '../lib/agent/guardrail'
import { MODULES_IN_CHAT } from '../lib/agent/productModules'
import { INTAKES, composeIntake } from '../lib/agent/intake'
import type { ChatAttachment } from '../lib/agent/types'

const EXTRACTION = sanitizeLeaseImportExtraction({ address: '88 Harbour St', unit: '2305', city: 'Toronto', monthly_rent: 2850, rent_due_day: 1, start_date: '2026-09-01', end_date: '2027-08-31', tenant_names: ['Mia Chen'], landlord_names: ['Sarah Lee'], note: 'Page 3 has a handwritten change.' })
const PDF: ChatAttachment = { name: 'lease.pdf', mediaType: 'application/pdf', dataUrl: `data:application/pdf;base64,${btoa('%PDF-1.4 a signed lease')}`, isImage: false, isPdf: true }
const calls: { url: string; init?: RequestInit }[] = []
let extractOk = true

beforeEach(() => {
  localStorage.setItem('stayloop_lang', 'zh')
  db.user = { id: 'u-landlord' }; db.rpc.length = 0; db.uploads.length = 0; db.households = []; db.createError = null; db.facts = 0
  calls.length = 0; extractOk = true; forgetLeaseImportReads()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    if (String(url) === '/api/household/extract') return extractOk ? { ok: true, status: 200, json: async () => ({ extraction: EXTRACTION }) } : { ok: false, status: 500, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const mount = (props: Partial<React.ComponentProps<typeof LeaseImportChatCard>> = {}) => render(<I18nProvider><LeaseImportChatCard offer={{ id: 'offer-1' }} role="landlord" {...props} /></I18nProvider>)
const card = (c: ParentNode) => only<HTMLElement>(c, '[data-testid="lease-import-card"]')
const value = (c: ParentNode, k: string) => only<HTMLInputElement>(c, `[data-testid="lease-import-${k}"]`).value
const type = (c: ParentNode, k: string, v: string) => fireEvent.change(only(c, `[data-testid="lease-import-${k}"]`), { target: { value: v } })
const rpcNames = () => db.rpc.map((r) => r[0])

describe('when the card is offered: the person’s own words, read deterministically', () => {
  it('asking to bring a signed lease in', () => {
    for (const said of [
      '帮我导入租约', '我要导入一份已经签好的租约。', '租约怎么导入', '把这份合同录入系统', '这是我和租客签的租约，帮我录进去',
      '我的房子已经租出去了，租约是之前签好的，怎么把这份租约放到 Stayloop 上管理？', '把租约存到 Stayloop',
      'Import my lease', 'I want to import a lease that is already signed.', 'Can you get this lease into Stayloop?',
    ]) expect(wantsLeaseImport(said), said).toBe(true)
  })
  it('not: explaining a lease, drafting or sending a new one, adding a clause, anything else', () => {
    for (const said of [
      '帮我解读租约', '帮我逐条解释租约里最需要注意的条款。', '上传了租约，帮我看看有没有无效条款', '续约方案', '租约什么时候到期',
      '帮我起草一份新租约', '帮我写一份租约然后导入', '把这一条加进租约里', '这句话能放到合同里吗', '把宠物条款放进租约', '从 Realtor 导入房源',
      '这个月的租金租客已经转给我了，帮我记一下', 'Help me draft a lease', 'Send the lease to my tenant', 'What does my lease say about pets?', '', '   ',
    ]) expect(wantsLeaseImport(said), said).toBe(false)
    expect(wantsLeaseImport(null)).toBe(false)
  })
  it('the sentences the product page and the landlord’s quick start send do open it', () => {
    const leases = MODULES_IN_CHAT.find((m) => m.href === '/leases/import')!
    for (const a of leases.asks) { expect(wantsLeaseImport(a.ask.zh), a.ask.zh).toBe(true); expect(wantsLeaseImport(a.ask.en), a.ask.en).toBe(true) }
    const chat = read('components/agent/AgentChat.tsx')
    const quick = chat.match(/\{ key: 'lease_import'[^\n]+/)?.[0] ?? ''
    expect(quick).toContain("label: { zh: '导入已签租约', en: 'Import a signed lease' }")
    for (const said of [...quick.matchAll(/prompt: \{ zh: '([^']+)', en: '([^']+)' \}/g)].flatMap((m) => [m[1], m[2]])) expect(wantsLeaseImport(said), said).toBe(true)
    // …through a guided card like every quick start (user 2026-09-27): it collects the file, and whatever
    // it composes — with a file or without, in either language — is a sentence that opens the import card
    const spec = INTAKES.lease_import
    expect(spec.steps.map((s) => [s.key, !!s.optional, !!s.attach])).toEqual([['form', false, false], ['file', true, true]])
    for (const lang of ['zh', 'en'] as const) for (const n of [0, 1, 3]) {
      const said = composeIntake(spec, { form: { picks: ['pdf'], text: '' } }, lang, n)
      expect(wantsLeaseImport(said), said).toBe(true)
      expect(said.includes(lang === 'zh' ? '文件已经附上' : 'the file is attached'), said).toBe(n > 0)
    }
    // it is the landlord's first quick start: the main way in for a landlord who already has a tenant
    expect(chat.indexOf("{ key: 'lease_import'")).toBeGreaterThan(chat.indexOf('  landlord: ['))
    expect(chat.indexOf("{ key: 'lease_import'")).toBeLessThan(chat.indexOf("{ key: 'screen'"))
  })
})

describe('the turn: the server decides, the model is told, an anonymous turn never carries the card', () => {
  const route = read('app/api/agent/turn/route.ts')
  it('offered from the message, for a signed-in caller only', () => {
    expect(route).toContain('const leaseImportOffer = !anonymous && !!turnUserId && wantsLeaseImport(message)')
    expect(route).toContain("(leaseImportOffer ? LEASE_IMPORT_TURN_NOTE : '') +")
    expect(route).toContain('lease_import: leaseImportOffer ? { id: crypto.randomUUID() } : undefined,')
    // never from the model's output: the response schema has no such field, and the route reads none
    expect(route).not.toMatch(/parsed\??\.lease_import/)
    expect(read('lib/agent/prompts.ts')).not.toContain('"lease_import"')
    const orch = read('lib/agent/orchestrator.ts')
    expect(orch).toContain("leaseImport: !anonymous && turn.lease_import && typeof turn.lease_import.id === 'string' ? { id: turn.lease_import.id } : undefined,")
  })
  it('the note keeps the reply in step with the card: check and confirm there, nothing is saved before', () => {
    expect(LEASE_IMPORT_TURN_NOTE).toContain('系统会在你这条回复下面放一张「导入租约」卡')
    expect(LEASE_IMPORT_TURN_NOTE).toContain('点「确认导入」之后才会建成在管租约')
    expect(LEASE_IMPORT_TURN_NOTE).toContain('【不要】说「已经导入」「已经保存」「已经建好」')
    expect(LEASE_IMPORT_TURN_NOTE).toContain('【不要】再让他去 /leases/import')
    expect(LEASE_IMPORT_TURN_NOTE).toContain('【不要】自己复述或猜测租约里的地址、租金、日期、姓名')
    // a reply written the way the note asks is not a claim that something was carried out
    expect(replyClaimsExecution('我在下面放了一张导入卡：请核对读出的地址、租期和租金，确认之后才会保存。')).toBe(false)
  })
  it('the chat shows the card under the reply, in a live session only, with the files the question carried', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain('{m.role === \'agent\' && m.leaseImport && live && (')
    expect(chat).toContain("<LeaseImportChatCard offer={m.leaseImport} role={role} attachments={messages[i - 1]?.role === 'user' ? messages[i - 1].attachments : undefined} />")
    expect(read('lib/agent/useAgentSession.ts')).toContain('leaseImport = turn.leaseImport')
  })
})

describe('one flow, two surfaces: the card and the import page agree', () => {
  const page = read('app/leases/import/page.tsx')
  it('the same form fields', () => {
    const iface = page.match(/interface FormState \{([\s\S]*?)\n\}/)?.[1] ?? ''
    const fields = [...iface.matchAll(/(\w+): string/g)].map((m) => m[1])
    expect(fields.sort()).toEqual(Object.keys(EMPTY_IMPORT_FORM).sort())
  })
  it('the same arguments to create_household_import, built the same way', () => {
    const block = page.match(/supabase\.rpc\('create_household_import', \{([\s\S]*?)\n      \}\)/)?.[1] ?? ''
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    const args = createImportArgs({ ...EMPTY_IMPORT_FORM, address: ' 88 Harbour St ', unit: ' 2305 ', city: 'Toronto', monthly_rent: '2850', rent_due_day: '1', start_date: '2026-09-01', end_date: '', tenant_name: ' Mia Chen ', tenant_email: '' }, 'landlord')
    expect(lines.map((l) => l.split(':')[0]).sort()).toEqual(Object.keys(args).sort())
    expect(args).toEqual({ p_address: '88 Harbour St', p_unit: '2305', p_city: 'Toronto', p_monthly_rent: 2850, p_rent_due_day: 1, p_start_date: '2026-09-01', p_end_date: null, p_creator_role: 'landlord', p_tenant_name: 'Mia Chen', p_tenant_email: null })
    // the lib's own expressions are the page's, line for line
    const lib = read('lib/household/importForm.ts')
    for (const l of lines.filter((x) => !x.startsWith('p_creator_role'))) expect(lib, l).toContain(l)
  })
  it('the same routes, RPCs and bucket, in the same order; the same limits as the extraction route', () => {
    const client = read('lib/household/importClient.ts')
    for (const s of ["'/api/household/extract'", "rpc('my_households_for_import')", "rpc('create_household_import'", "from('tenancy-files')", "rpc('attach_household_lease_file'", "'/api/household/invite'"]) {
      expect(client, s).toContain(s)
      expect(page, s).toContain(s)
    }
    const route = read('app/api/household/extract/route.ts')
    expect(route).toContain(`const MAX_FILES = ${IMPORT_MAX_FILES}`)
    expect(route).toContain('const MAX_BYTES = 10 * 1024 * 1024')
    expect(IMPORT_MAX_BYTES).toBe(10 * 1024 * 1024)
    // nothing here writes with the service role, and the card calls nothing but this lib
    expect(client).not.toMatch(/service_role|SERVICE_ROLE|createClient\(/)
    const cardSrc = read('components/agent/LeaseImportChatCard.tsx')
    expect(cardSrc).not.toMatch(/supabase\.|fetch\(|window\.confirm|alert\(/)
  })
  it('the pure parts: what an extraction fills, what blocks a save, who is invited, where a file goes', () => {
    expect(formFromExtraction(EXTRACTION)).toEqual({ address: '88 Harbour St', unit: '2305', city: 'Toronto', monthly_rent: '2850', rent_due_day: '1', start_date: '2026-09-01', end_date: '2027-08-31', tenant_name: 'Mia Chen', tenant_email: '' })
    expect(fieldsRead(EXTRACTION)).toEqual(['address', 'unit', 'city', 'monthly_rent', 'rent_due_day', 'start_date', 'end_date', 'tenant_name'])
    expect(fieldsRead(sanitizeLeaseImportExtraction({}))).toEqual([])
    expect(importFormError({ ...EMPTY_IMPORT_FORM, address: '88' }, true)).toBe('请填写房屋地址')
    expect(importFormError({ ...EMPTY_IMPORT_FORM, address: '88 Harbour St', tenant_email: 'mia(at)x' }, true)).toBeTruthy()
    expect(importFormError({ ...EMPTY_IMPORT_FORM, address: '88 Harbour St' }, true)).toBeNull()
    expect(defaultInvites('landlord')).toEqual([{ email: '', role: 'tenant' }])
    expect(defaultInvites('tenant')).toEqual([{ email: '', role: 'landlord' }])
    expect(defaultInvites('agent').map((i) => i.role)).toEqual(['landlord', 'tenant'])
    expect(leaseFilePath('h-1', 'abcd1234', 0, 'My Lease.PDF')).toBe('h-1/lease-abcd1234-1.pdf')
    const f = (type: string, size: number) => ({ type, size })
    expect(acceptableLeaseFiles([f('application/pdf', 1), f('text/plain', 1), f('image/jpeg', 1), f('image/png', 1), f('image/webp', 1)]).map((x) => x.type)).toEqual(['application/pdf', 'image/jpeg', 'image/png'])
    expect(acceptableLeaseFiles([f('application/pdf', IMPORT_MAX_BYTES), f('image/png', 1)]).length).toBe(1)
    expect(filesFromAttachments([PDF, { ...PDF, name: 'stored.pdf', dataUrl: '' }]).map((x) => [x.name, x.type])).toEqual([['lease.pdf', 'application/pdf']])
  })
})

describe('the card', () => {
  it('with no file: a picker, or straight to the form — and a short address saves nothing', async () => {
    const { container: c } = mount()
    expect(card(c).dataset.step).toBe('pick')
    expect(calls).toEqual([])
    fireEvent.click(only(c, '[data-testid="lease-import-manual"]'))
    expect(card(c).dataset.step).toBe('form')
    expect(all(c, '[data-testid="lease-import-read"]')).toEqual([])
    type(c, 'address', '88')
    fireEvent.click(only(c, '[data-testid="lease-import-confirm"]'))
    await waitFor(() => expect(textOf(only(c, '[data-testid="lease-import-error"]'))).toBe('请填写房屋地址'))
    expect(db.rpc).toEqual([])
  })
  it('the lease that came with the message is read at once, by the import page’s extraction; the fields it read are marked until touched', async () => {
    const { container: c } = mount({ attachments: [PDF] })
    await waitFor(() => expect(card(c).dataset.step).toBe('form'))
    expect(calls.map((x) => x.url)).toEqual(['/api/household/extract'])
    const sent = calls[0].init!.body as FormData
    expect(sent.getAll('files').map((f) => (f as File).name)).toEqual(['lease.pdf'])
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect([value(c, 'address'), value(c, 'unit'), value(c, 'city'), value(c, 'monthly_rent'), value(c, 'start_date'), value(c, 'end_date'), value(c, 'tenant_name'), value(c, 'tenant_email')]).toEqual(['88 Harbour St', '2305', 'Toronto', '2850', '2026-09-01', '2027-08-31', 'Mia Chen', ''])
    expect(all(c, '[data-testid="lease-import-read"]').length).toBe(8)
    expect(textOf(only(c, '[data-testid="lease-import-note"]'))).toContain('handwritten change')
    type(c, 'monthly_rent', '2900')
    expect(all(c, '[data-testid="lease-import-read"]').length).toBe(7)
    // reading saved nothing
    expect(db.rpc).toEqual([])
    expect(db.uploads).toEqual([])
  })
  it('only 「确认导入」 creates the tenancy — from what is on the card, as the conversation’s role — then stores the file', async () => {
    const { container: c } = mount({ attachments: [PDF] })
    await waitFor(() => expect(card(c).dataset.step).toBe('form'))
    type(c, 'monthly_rent', '2900')
    type(c, 'tenant_email', 'mia@example.org')
    fireEvent.click(only(c, '[data-testid="lease-import-confirm"]'))
    await waitFor(() => expect(card(c).dataset.step).toBe('invite'))
    expect(rpcNames()).toEqual(['my_households_for_import', 'create_household_import', 'attach_household_lease_file'])
    expect(db.rpc[1][1]).toEqual({ p_address: '88 Harbour St', p_unit: '2305', p_city: 'Toronto', p_monthly_rent: 2900, p_rent_due_day: 1, p_start_date: '2026-09-01', p_end_date: '2027-08-31', p_creator_role: 'landlord', p_tenant_name: 'Mia Chen', p_tenant_email: 'mia@example.org' })
    expect(db.uploads.length).toBe(1)
    expect(db.uploads[0]).toMatch(/^tenancy-files:h-1\/lease-[0-9a-f]{8}-1\.pdf$/)
    expect(db.rpc[2][1]).toEqual({ p_household: 'h-1', p_path: db.uploads[0].slice('tenancy-files:'.length) })
    expect(db.facts).toBe(1)
  })
  it('a tenant’s conversation imports as the tenant and invites the landlord', async () => {
    const { container: c } = mount({ role: 'tenant' })
    fireEvent.click(only(c, '[data-testid="lease-import-manual"]'))
    type(c, 'address', '12 Elm Street')
    fireEvent.click(only(c, '[data-testid="lease-import-confirm"]'))
    await waitFor(() => expect(card(c).dataset.step).toBe('invite'))
    expect((db.rpc[1][1] as { p_creator_role: string }).p_creator_role).toBe('tenant')
    expect(db.uploads).toEqual([])
    expect(only<HTMLSelectElement>(c, '[data-testid="lease-import-invite"] select').value).toBe('landlord')
  })
  it('the same address again: the tenancy that is already there, and nothing is created unless the person says it is another one', async () => {
    db.households = [{ id: 'h-0', address: '88 Harbour Street', unit: '2305', verified: false, relation: 'member', is_creator: true, invite_token: null }]
    const { container: c } = mount({ attachments: [PDF] })
    await waitFor(() => expect(card(c).dataset.step).toBe('form'))
    fireEvent.click(only(c, '[data-testid="lease-import-confirm"]'))
    await waitFor(() => expect(c.querySelector('[data-testid="lease-import-existing"]')).not.toBeNull())
    expect(only<HTMLAnchorElement>(c, '[data-testid="lease-import-existing-open"]').getAttribute('href')).toBe('/h/h-0')
    expect(rpcNames()).toEqual(['my_households_for_import'])
    fireEvent.click(only(c, '[data-testid="lease-import-force"]'))
    await waitFor(() => expect(card(c).dataset.step).toBe('invite'))
    expect(rpcNames()).toEqual(['my_households_for_import', 'create_household_import', 'attach_household_lease_file'])
  })
  it('inviting: the other side’s email goes to the invite route; then the card is done and says where the tenancy is', async () => {
    const { container: c } = mount({ attachments: [PDF] })
    await waitFor(() => expect(card(c).dataset.step).toBe('form'))
    fireEvent.click(only(c, '[data-testid="lease-import-confirm"]'))
    await waitFor(() => expect(card(c).dataset.step).toBe('invite'))
    fireEvent.change(only(c, '[data-testid="lease-import-invite-email"]'), { target: { value: 'mia@example.org' } })
    fireEvent.click(only(c, '[data-testid="lease-import-invite-send"]'))
    await waitFor(() => expect(card(c).dataset.step).toBe('done'))
    const invite = calls.find((x) => x.url === '/api/household/invite')!
    expect(JSON.parse(String(invite.init!.body))).toEqual({ household_id: 'h-1', invites: [{ email: 'mia@example.org', role: 'tenant' }] })
    expect(only<HTMLAnchorElement>(c, '[data-testid="lease-import-open"]').getAttribute('href')).toBe('/h/h-1')
    expect(textOf(only(c, '[data-testid="lease-import-done"]'))).toContain('88 Harbour St · 2305')
    expect(textOf(only(c, '[data-testid="lease-import-done"]'))).toContain('已发出 1 封邀请')
    expect(textOf(only(c, '[data-testid="lease-import-next"]'))).toContain('把每一期租金记上')
    expect(JSON.parse(localStorage.getItem(leaseImportDoneKey('u-landlord', 'offer-1'))!)).toEqual({ id: 'h-1', address: '88 Harbour St · 2305', invited: 1 })
  })
  it('「稍后再邀」 sends nothing', async () => {
    const { container: c } = mount()
    fireEvent.click(only(c, '[data-testid="lease-import-manual"]'))
    type(c, 'address', '12 Elm Street')
    fireEvent.click(only(c, '[data-testid="lease-import-confirm"]'))
    await waitFor(() => expect(card(c).dataset.step).toBe('invite'))
    fireEvent.click(only(c, '[data-testid="lease-import-invite-later"]'))
    expect(card(c).dataset.step).toBe('done')
    expect(calls.filter((x) => x.url === '/api/household/invite')).toEqual([])
    expect(textOf(only(c, '[data-testid="lease-import-done"]'))).toContain('还没有邀请对方')
  })
  it('a finished import stays finished after a reload: no second read, no second tenancy offered', async () => {
    localStorage.setItem(leaseImportDoneKey('u-landlord', 'offer-1'), JSON.stringify({ id: 'h-1', address: '88 Harbour St · 2305', invited: 0 }))
    const { container: c } = mount({ attachments: [PDF] })
    await waitFor(() => expect(card(c).dataset.step).toBe('done'))
    expect(calls).toEqual([])
    expect(c.querySelector('[data-testid="lease-import-confirm"]')).toBeNull()
    // another account on this browser is not told about it
    cleanup()
    db.user = { id: 'u-other' }
    const again = mount()
    expect(card(again.container).dataset.step).toBe('pick')
  })
  it('one read per card, however often the thread re-mounts it', async () => {
    const first = mount({ attachments: [PDF] })
    await waitFor(() => expect(card(first.container).dataset.step).toBe('form'))
    cleanup()
    const second = mount({ attachments: [PDF] })
    await waitFor(() => expect(card(second.container).dataset.step).toBe('form'))
    expect(calls.filter((x) => x.url === '/api/household/extract').length).toBe(1)
    expect(value(second.container, 'address')).toBe('88 Harbour St')
  })
  it('a read that fails is not a failed import: the form starts blank and says so', async () => {
    extractOk = false
    const { container: c } = mount({ attachments: [PDF] })
    await waitFor(() => expect(card(c).dataset.step).toBe('form'))
    expect(value(c, 'address')).toBe('')
    expect(textOf(only(c, '[data-testid="lease-import-form"]'))).toContain('这份文件我没有读出来，请直接填写')
    expect(textOf(only(c, '[data-testid="lease-import-files"]'))).toContain('lease.pdf')
  })
  it('a create that fails says so and leaves the form to try again', async () => {
    db.createError = 'permission denied'
    const { container: c } = mount()
    fireEvent.click(only(c, '[data-testid="lease-import-manual"]'))
    type(c, 'address', '12 Elm Street')
    fireEvent.click(only(c, '[data-testid="lease-import-confirm"]'))
    await waitFor(() => expect(c.querySelector('[data-testid="lease-import-error"]')).not.toBeNull())
    expect(textOf(only(c, '[data-testid="lease-import-error"]'))).toContain('没有导入成功')
    expect(card(c).dataset.step).toBe('form')
    expect(localStorage.getItem(leaseImportDoneKey('u-landlord', 'offer-1'))).toBeNull()
  })
  it('nobody signed in: no card', () => {
    db.user = null
    const { container: c } = mount({ attachments: [PDF] })
    expect(c.querySelector('[data-testid="lease-import-card"]')).toBeNull()
    expect(calls).toEqual([])
  })
  it('in English the card is English', async () => {
    localStorage.setItem('stayloop_lang', 'en')
    const { container: c } = mount({ attachments: [PDF] })
    await waitFor(() => expect(card(c).dataset.step).toBe('form'))
    await waitFor(() => expect(textOf(only(c, '[data-testid="lease-import-confirm"]'))).toBe('Confirm & import'))
    expect(textOf(card(c)).replace('Page 3 has a handwritten change.', '')).not.toMatch(/[一-鿿]/)
  })
})
