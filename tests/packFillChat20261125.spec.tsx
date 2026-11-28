// @vitest-environment jsdom
// V0.9 (2026-11-25, user: 「接着做护照」 — the last product module finished in the AI conversation).
// A signed-in tenant who asks to get the application pack ready gets the pack card under the reply:
// the pay stub or employment letter that came with the message (or picked on the card) is read, the
// pack fields it shows are listed only where the pack is still empty, every value is editable, and
// only 「确认写进申请包」 writes — the confirmed columns onto the applicant's own row, the ticked files
// through the pack's own upload route. No identifier can come back from the read; the consent box is
// never ticked for anyone; what is written stays self-declared.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  user: { id: 'u-tenant' } as null | { id: string },
  profile: null as Row | null,
  files: 0,
  loadFails: false,
  extraction: null as Row | null,
  extracts: 0,
  saved: [] as Row[],
  saveOk: true,
  stored: [] as [string, string, string | null][],
  storeFails: {} as Record<string, string>,
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ loading: false, user: db.user, role: null }) }))
vi.mock('@/lib/profile/packClient', () => ({
  loadPack: async () => { if (db.loadFails) throw new Error('boom'); return { profile: db.profile, files: db.files } },
  extractPack: async () => { db.extracts++; return { extraction: db.extraction, status: db.extraction ? 200 : 502 } },
  savePackFields: async (_uid: string, patch: Row) => { if (db.saveOk) db.saved.push(patch); return db.saveOk },
  storePackFile: async (file: File, kind: string, asOf: string | null) => {
    const why = db.storeFails[file.name]
    if (why) return { ok: false, message: why }
    db.stored.push([file.name, kind, asOf]); return { ok: true }
  },
}))

import { I18nProvider } from '../lib/i18n'
import PackFillChatCard, { forgetPackReads, packFilesFromAttachments, packFillDoneKey } from '../components/agent/PackFillChatCard'
import { PACK_FILL_TURN_NOTE, wantsPackFill } from '../lib/agent/packFillIntent'
import { INTAKES, composeIntake } from '../lib/agent/intake'
import { MODULES_IN_CHAT, productModulesGuide } from '../lib/agent/productModules'
import { replyClaimsExecution } from '../lib/agent/guardrail'
import { PACK_EXTRACT_PROMPT, monthlyFromPay, sanitizePackExtraction } from '../lib/profile/packExtract'
import { PACK_FILL_FIELDS, PACK_FILL_LABEL, nameDiffers, packFillError, packPatch, packSuggestion, payBasisLine } from '../lib/profile/packFill'
import type { ChatAttachment } from '../lib/agent/types'

const TODAY = '2026-11-25'
const RAW = {
  first_name: 'Mia', last_name: 'Chen', employment_status: 'employed', employer_name: 'Northwind Design Inc.', job_title: 'Product Designer',
  employment_start_date: '2024-03-04', employer_phone: '416-555-0142', employer_email: 'hr@northwind.example.org',
  pay: { amount: 2400, period: 'biweekly' }, files: [{ kind: 'paystub', as_of: '2026-11-14' }, { kind: 'employment_letter', as_of: '2026-10-02' }],
}
const STUB: ChatAttachment = { name: 'paystub.pdf', mediaType: 'application/pdf', dataUrl: `data:application/pdf;base64,${btoa('%PDF-1.4 a pay stub')}`, isImage: false, isPdf: true }
const LETTER: ChatAttachment = { name: 'letter.jpg', mediaType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${btoa('jpeg bytes of a letter')}`, isImage: true }

beforeEach(() => {
  localStorage.setItem('stayloop_lang', 'zh')
  db.user = { id: 'u-tenant' }; db.profile = null; db.files = 0; db.loadFails = false
  db.extraction = sanitizePackExtraction(RAW, 2, TODAY) as unknown as Row; db.extracts = 0
  db.saved.length = 0; db.saveOk = true; db.stored.length = 0; db.storeFails = {}
  forgetPackReads()
})
afterEach(() => { cleanup(); localStorage.clear() })

const mount = (props: Partial<React.ComponentProps<typeof PackFillChatCard>> = {}) => render(<I18nProvider><PackFillChatCard offer={{ id: 'offer-1' }} role="tenant" attachments={[STUB, LETTER]} {...props} /></I18nProvider>)
const card = (c: ParentNode) => only<HTMLElement>(c, '[data-testid="pack-fill-card"]')
const ready = async (c: ParentNode, step = 'form') => { await waitFor(() => expect(card(c).dataset.step).toBe(step)) }
const field = (c: ParentNode, k: string) => only<HTMLInputElement | HTMLSelectElement>(c, `[data-testid="pack-fill-${k}"]`)
const shown = (c: ParentNode) => all(c, '[data-testid="pack-fill-fields"] label').map((l) => textOf(l).replace('AI 读出', '').trim())

describe('when the card is offered: a tenant’s own words, read deterministically', () => {
  it('asking to get the pack ready, or to put documents into it', () => {
    for (const said of [
      '帮我准备申请包，要哪些材料？', '帮我准备一份申请包，我手上有工资单和在职信', '帮我填申请包', '申请包怎么填', '更新一下我的租客护照',
      '把工资单和在职信放进我的申请包', '把这张工资单存进护照', '帮我把申请材料包整理好',
      'Help me build my application pack — what do I need?', 'Fill in my tenant passport', 'Add this pay stub to my application pack',
    ]) expect(wantsPackFill(said), said).toBe(true)
  })
  it('not: sharing it, asking what it is or what a landlord sees, a travel passport, anything else', () => {
    for (const said of [
      '把我的护照分享给房东', '租客护照是什么', '护照盖章是什么', '房东在申请包里能看到什么', '我的护照可以当身份证件吗',
      '帮我解读租约', '帮我导入租约', '10 月的租金收到了', '帮我找个经纪', '帮我找房',
      'What is the tenant passport?', 'Share my application pack with the landlord', '', '  ',
    ]) expect(wantsPackFill(said), said).toBe(false)
    expect(wantsPackFill(null)).toBe(false)
  })
  it('the product page’s sentence and the tenant’s quick start both open it — and the quick start now takes the files', () => {
    const m = MODULES_IN_CHAT.find((x) => x.href === '/tenant/passport')!
    for (const a of m.asks) for (const said of [a.ask.zh, a.ask.en]) expect(wantsPackFill(said), said).toBe(true)
    const spec = INTAKES.applicant_pack
    expect(spec.steps.find((s) => s.key === 'have')?.attach).toBe(true)
    for (const lang of ['zh', 'en'] as const) for (const n of [0, 2]) {
      const said = composeIntake(spec, { part: { picks: ['all'], text: '' }, have: { picks: ['paystub'], text: '' } }, lang, n)
      expect(wantsPackFill(said), said).toBe(true)
      expect(said.includes(lang === 'zh' ? '文件已经附上' : 'the files are attached'), said).toBe(n > 0)
    }
    // files added without ticking anything: the sentence does not also say there is nothing on hand (production, 2026-11-25)
    for (const lang of ['zh', 'en'] as const) {
      const none = lang === 'zh' ? '手头还没有材料' : 'no documents on hand'
      const withFiles = composeIntake(spec, { part: { picks: ['identity'], text: '' } }, lang, 2)
      expect(withFiles.includes(none), withFiles).toBe(false)
      expect(wantsPackFill(withFiles), withFiles).toBe(true)
      expect(composeIntake(spec, { part: { picks: ['identity'], text: '' } }, lang, 0).includes(none)).toBe(true)
      expect(composeIntake(spec, { part: { picks: ['identity'], text: '' }, have: { picks: ['nothing'], text: '' } }, lang, 0).includes(none)).toBe(true)
    }
  })
  it('the card is the tenant’s: the landlord’s and the agent’s assistant are told it is not in their conversation', () => {
    // production, 2026-11-25: an anonymous landlord was told 「登录后你可以在对话里直接唤起申请包卡片」
    const m = MODULES_IN_CHAT.find((x) => x.href === '/tenant/passport')!
    for (const role of ['landlord', 'agent'] as const) {
      expect(m.guide[role]).toContain('申请包卡只出现在租客自己的对话里')
      expect(m.guide[role]).toContain('不要说在这里(或登录后在这里)能唤起它')
    }
    expect(m.guide.tenant).not.toContain('申请包卡只出现在租客自己的对话里')
    // and the route never offers it outside the tenant's conversation
    expect(read('app/api/agent/turn/route.ts')).toContain("role === 'tenant' && !leaseImportOffer && !rentRecordOffer && !directoryOffer && wantsPackFill(own)")
  })
})

describe('the turn: the server decides, the model is told; tenants only, one card a turn', () => {
  const route = read('app/api/agent/turn/route.ts')
  it('offered from the message, for a signed-in tenant; never with another card', () => {
    expect(route).toContain("const packFillOffer = !anonymous && !!turnUserId && role === 'tenant' && !leaseImportOffer && !rentRecordOffer && !directoryOffer && wantsPackFill(own)")
    expect(route).toContain("(packFillOffer ? PACK_FILL_TURN_NOTE : '') +")
    expect(route).toContain('pack_fill: packFillOffer ? { id: crypto.randomUUID() } : undefined,')
    expect(route).not.toMatch(/parsed\??\.pack_fill/)
    expect(read('lib/agent/prompts.ts')).not.toContain('"pack_fill"')
    expect(read('lib/agent/orchestrator.ts')).toContain("packFill: !anonymous && turn.pack_fill && typeof turn.pack_fill.id === 'string' ? { id: turn.pack_fill.id } : undefined,")
    // the turn itself reads no pack row and stores no file
    expect(route).not.toMatch(/applicant_profiles|applicant_profile_files|profile\/extract/)
    const anon = route.match(/const ANON_PROMPT_ADDENDUM = `([\s\S]*?)`\n/)?.[1] ?? ''
    expect(anon).toContain('申请包卡)只在登录后的对话里出现')
  })
  it('the note keeps the reply in step with the card', () => {
    expect(PACK_FILL_TURN_NOTE).toContain('系统会在你这条回复下面放一张「申请包」卡')
    expect(PACK_FILL_TURN_NOTE).toContain('点「确认写进申请包」之后才会保存')
    expect(PACK_FILL_TURN_NOTE).toContain('【不要】说「已经存进申请包」「已经填好了」')
    expect(PACK_FILL_TURN_NOTE).toContain('【不要】自己复述或推断文件里的姓名、雇主、收入')
    expect(PACK_FILL_TURN_NOTE).toContain('不要评价他的收入够不够')
    expect(PACK_FILL_TURN_NOTE).toContain('同意书永远由他本人在护照页勾选,卡片不会替他勾')
    expect(PACK_FILL_TURN_NOTE).toContain('不等于已核验')
    expect(PACK_FILL_TURN_NOTE).not.toMatch(/四枚章|助手|管家|背调/)
    expect(replyClaimsExecution('下面有一张申请包卡：请核对读出的内容，确认之前什么都不会保存。')).toBe(false)
    // the assistant does not know which fields the card lists, so it is told not to enumerate them
    expect(PACK_FILL_TURN_NOTE).toContain('【不要】列举「请核对姓名、雇主、收入」之类的清单')
    // 2026-11-25, the first real reply: 「已在下方为你生成了申请包卡片」 was taken for 「已…申请」 and got the 「尚未真正执行」 note
    expect(replyClaimsExecution('我已经读取了你发来的工资单和在职信。系统已在下方为你生成了申请包卡片，请逐项核对，在卡片上点击确认后才会保存。')).toBe(false)
    expect(replyClaimsExecution('已帮你申请了这套房。')).toBe(true)
    expect(productModulesGuide('tenant')).toContain('系统会在你的回复下面放一张申请包卡')
    expect(productModulesGuide('tenant')).toContain('卡上的内容你看不到,也不要说「已经填好了」')
    // the landlord's and the agent's assistant are never told a pack card is offered — only that it is the tenant's
    for (const role of ['landlord', 'agent'] as const) {
      expect(productModulesGuide(role)).not.toContain('放一张申请包卡')
      expect(productModulesGuide(role)).toContain('申请包卡只出现在租客自己的对话里')
    }
  })
  it('the chat shows the card under the reply, in a live session only, with the files the question carried', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain("{m.role === 'agent' && m.packFill && live && (")
    expect(chat).toContain("<PackFillChatCard offer={m.packFill} role={role} attachments={messages[i - 1]?.role === 'user' ? messages[i - 1].attachments : undefined} />")
    expect(read('lib/agent/useAgentSession.ts')).toContain('packFill = turn.packFill')
  })
})

describe('what a read may return: the pack’s own columns, in their own shape — never an identifier', () => {
  it('a clean answer comes through, and the monthly income is worked out here, not by the model', () => {
    const x = sanitizePackExtraction({ ...RAW, monthly_income: 9999 }, 2, TODAY)
    expect(x).toEqual({
      first_name: 'Mia', last_name: 'Chen', employment_status: 'employed', employer_name: 'Northwind Design Inc.', job_title: 'Product Designer',
      employment_start_date: '2024-03-04', employer_phone: '416-555-0142', employer_email: 'hr@northwind.example.org',
      pay: { amount: 2400, period: 'biweekly' }, monthly_income: 5200,
      files: [{ kind: 'paystub', as_of: '2026-11-14' }, { kind: 'employment_letter', as_of: '2026-10-02' }],
    })
    expect([monthlyFromPay({ amount: 1200, period: 'weekly' }), monthlyFromPay({ amount: 2400, period: 'biweekly' }), monthlyFromPay({ amount: 2600, period: 'semimonthly' }), monthlyFromPay({ amount: 5200, period: 'monthly' }), monthlyFromPay({ amount: 62400, period: 'annual' })]).toEqual([5200, 5200, 5200, 5200, 5200])
    // an hourly rate, or no period: nothing to convert
    expect(sanitizePackExtraction({ pay: { amount: 32, period: 'hourly' } }, 0, TODAY).monthly_income).toBeNull()
    expect(sanitizePackExtraction({ pay: { amount: 5 , period: 'annual' } }, 0, TODAY).monthly_income).toBeNull()
    expect(monthlyFromPay(null)).toBeNull()
  })
  it('there is no field for an identifier, so none can come back', () => {
    const x = sanitizePackExtraction({ ...RAW, sin: '123-456-789', social_insurance_number: '123456789', date_of_birth: '1994-02-03', current_address: '88 Harbour St', phone: '647-555-0000', account_number: '0012345', licence_number: 'C1234-56789', health_card: '1234567890' }, 2, TODAY)
    const keys = Object.keys(x).sort()
    expect(keys).toEqual(['employer_email', 'employer_name', 'employer_phone', 'employment_start_date', 'employment_status', 'files', 'first_name', 'job_title', 'last_name', 'monthly_income', 'pay'])
    expect(JSON.stringify(x)).not.toMatch(/123-456-789|123456789|1994-02-03|Harbour|0012345|C1234/)
    // the proposal is narrower still: nine fields, none of them the consent, the date of birth, the address or the household
    expect([...PACK_FILL_FIELDS]).toEqual(['first_name', 'last_name', 'employment_status', 'employer_name', 'job_title', 'employment_start_date', 'monthly_income', 'employer_phone', 'employer_email'])
  })
  it('each value is held to its shape; what does not fit is dropped, not repaired', () => {
    const x = sanitizePackExtraction({
      first_name: 'Mia 123-456-789', last_name: 'O’Neil-Smith', employment_status: 'tenured', employer_name: '  Northwind\nDesign  ', job_title: 'x'.repeat(200),
      employment_start_date: '2030-01-01', employer_phone: 'call HR', employer_email: 'hr at northwind', pay: { amount: '2,400.50', period: 'Bi-Weekly' },
      files: [{ kind: 'selfie', as_of: '2026-11-14' }, { kind: 'id', as_of: '2029-05-01' }, { kind: 'paystub', as_of: '2027-01-01' }, { kind: 'paystub', as_of: '2026-11-01' }],
    }, 3, TODAY)
    expect(x.first_name).toBeNull()
    expect(x.last_name).toBe('O’Neil-Smith')
    expect(x.employment_status).toBeNull()
    expect(x.employer_name).toBe('Northwind Design')
    expect(x.job_title?.length).toBe(80)
    expect(x.employment_start_date).toBeNull() // not in the future
    expect(x.employer_phone).toBeNull()
    expect(x.employer_email).toBeNull()
    expect(x.pay).toEqual({ amount: 2400.5, period: 'biweekly' })
    // one entry per file sent; an unknown kind is no kind; an ID's date is its expiry (ahead), any other document's is not
    expect(x.files).toEqual([{ kind: null, as_of: '2026-11-14' }, { kind: 'id', as_of: '2029-05-01' }, { kind: 'paystub', as_of: null }])
    expect(sanitizePackExtraction(null, 1, TODAY).files).toEqual([{ kind: null, as_of: null }])
    expect(sanitizePackExtraction('not json', 0, TODAY).first_name).toBeNull()
  })
  it('no remark of the model’s reaches the card: there is no free-text field to carry one', () => {
    // 2026-11-25: the first real reads came back with a note — once that the two documents agreed (with both figures),
    // once that they DISAGREED, when they matched to the dollar. The model is no longer asked for one.
    const x = sanitizePackExtraction({ ...RAW, note: '工资单与在职信的年薪换算结果不一致，申请人可能需要核实。', comment: 'income looks low', summary: 'x' }, 2, TODAY)
    expect(JSON.stringify(x)).not.toMatch(/不一致|核实|looks low|summary|note|comment/)
    expect(PACK_EXTRACT_PROMPT).not.toContain('"note"')
    expect(PACK_EXTRACT_PROMPT).toContain('Output these keys only. No remarks, no summary, no comparison between the documents')
    const cardSrc = read('components/agent/PackFillChatCard.tsx')
    expect(cardSrc).not.toMatch(/x\?\.note|pack-fill-note/)
    // what the card does warn about is checked in code, not by the model
    expect(cardSrc).toContain('const otherName = nameDiffers(profile, x)')
  })
  it('the model is asked for printed facts only, never an identifier, never its own arithmetic or opinion', () => {
    expect(PACK_EXTRACT_PROMPT).toContain('NEVER output a Social Insurance Number, an ID / licence / passport number, a bank account number, a date of birth, a health card number or a home address')
    expect(PACK_EXTRACT_PROMPT).toContain('do NOT convert it to monthly')
    expect(PACK_EXTRACT_PROMPT).toContain('Never guess, never fill a gap')
    expect(PACK_EXTRACT_PROMPT).toContain('no comment on whether the income is enough')
  })
  it('the route: signed in, rate-limited, typed files only — and it writes nothing', () => {
    const r = read('app/api/profile/extract/route.ts')
    expect(r).toContain("if (userErr || !ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })")
    expect(r).toContain('underHourlyLimit(`profile-extract:${ud.user.id}`, 20, true)')
    expect(r).toContain("if (!PACK_EXTRACT_TYPES.test(f.type)) return NextResponse.json({ error: 'file_type' }")
    expect(r).toContain('sanitizePackExtraction(safeParseJson(text), files.length, torontoDate())')
    expect(r).toContain("meta: { userId: ud.user.id, slot: 'classify', source: 'profile/extract' }")
    expect(r).not.toMatch(/\.from\(|\.storage|\.upsert\(|\.insert\(|SERVICE_ROLE|writeAuditEvent/)
    expect(read('scripts/route-audit.mjs')).toContain('/api/profile/extract')
    // the privacy page says these files go to the model providers to be read
    const privacy = read('app/privacy/page.tsx')
    expect(privacy).toContain('你让 AI 助理读取来导入租约或填申请包的文件')
    expect(privacy).toContain('the files you have the AI Agent read to import a lease or fill your application pack')
  })
})

describe('what is proposed and what is written', () => {
  it('only what the pack still lacks is proposed; what the applicant typed is kept', () => {
    const x = sanitizePackExtraction(RAW, 2, TODAY)
    expect(packSuggestion(null, x)).toEqual({ fill: { first_name: 'Mia', last_name: 'Chen', employment_status: 'employed', employer_name: 'Northwind Design Inc.', job_title: 'Product Designer', employment_start_date: '2024-03-04', monthly_income: '5200', employer_phone: '416-555-0142', employer_email: 'hr@northwind.example.org' }, kept: [] })
    const mine = { first_name: 'Mia', last_name: '', employer_name: 'Old Co', monthly_income: 4800, job_title: null }
    const s = packSuggestion(mine, x)
    expect(Object.keys(s.fill)).toEqual(['last_name', 'employment_status', 'job_title', 'employment_start_date', 'employer_phone', 'employer_email'])
    expect(s.kept).toEqual(['first_name', 'employer_name', 'monthly_income'])
    // nothing read: nothing proposed
    expect(packSuggestion(mine, sanitizePackExtraction({}, 0, TODAY))).toEqual({ fill: {}, kept: [] })
  })
  it('the write: blanks left out, the income a number, each value checked first', () => {
    expect(packPatch({ first_name: ' Mia ', last_name: '', monthly_income: '5200.4', employer_email: 'hr@northwind.example.org' })).toEqual({ first_name: 'Mia', monthly_income: 5200, employer_email: 'hr@northwind.example.org' })
    expect(packPatch({})).toEqual({})
    expect(packFillError({ monthly_income: 'a lot' }, true)).toBe('月收入请填一个数字。')
    expect(packFillError({ employment_start_date: '03/04/2024' }, true)).toBe('入职日期的格式应为 YYYY-MM-DD。')
    expect(packFillError({ employment_status: 'tenured' }, true)).toBe('雇佣状态请从列表里选。')
    expect(packFillError({ employer_email: 'hr at northwind' }, true)).toBeTruthy()
    expect(packFillError({ first_name: 'Mia', monthly_income: '5200', employment_start_date: '2024-03-04', employment_status: 'employed' }, true)).toBeNull()
    expect(payBasisLine({ amount: 2400, period: 'biweekly' }, true)).toBe('按文件上每两周税前 $2,400 折算成月收入，请对一下。')
    expect(payBasisLine(null, true)).toBeNull()
  })
  it('documents in another name: the pack’s name is kept, and both names are given back so the card can say so', () => {
    const x = { first_name: 'Taylor', last_name: 'Testerson' }
    expect(nameDiffers({ first_name: 'Test', last_name: 'Tenant' }, x)).toEqual({ doc: 'Taylor Testerson', pack: 'Test Tenant' })
    expect(nameDiffers({ first_name: ' taylor ', last_name: 'TESTERSON' }, x)).toBeNull()
    // the same two words the other way round is the same name
    expect(nameDiffers({ first_name: 'Testerson', last_name: 'Taylor' }, x)).toBeNull()
    // nothing to compare: no warning
    expect(nameDiffers({ first_name: 'Test', last_name: '' }, x)).toBeNull()
    expect(nameDiffers(null, x)).toBeNull()
    expect(nameDiffers({ first_name: 'Test', last_name: 'Tenant' }, { first_name: 'Taylor', last_name: null })).toBeNull()
    expect(packSuggestion({ first_name: 'Test', last_name: 'Tenant' }, sanitizePackExtraction(RAW, 2, TODAY)).kept).toEqual(['first_name', 'last_name'])
  })
  it('the labels are the passport page’s own', () => {
    const page = read('components/profile/ProfileSections.tsx')
    for (const f of PACK_FILL_FIELDS) expect(page, f).toContain(`label={zh ? '${PACK_FILL_LABEL[f].zh}' : '${PACK_FILL_LABEL[f].en}'}`)
  })
  it('the same writes as the passport page — the applicant’s own session, the pack’s own upload route — and never the consent', () => {
    const client = read('lib/profile/packClient.ts')
    const upsert = "supabase.from('applicant_profiles').upsert({ auth_id: uid, ...patch }, { onConflict: 'auth_id' })"
    expect(client).toContain(upsert)
    expect(read('app/tenant/passport/page.tsx')).toContain(upsert)
    const post = "fetch('/api/profile/files', { method: 'POST', headers: { Authorization: "
    expect(client).toContain(post)
    expect(read('components/profile/ProfileFiles.tsx')).toContain(post)
    for (const s of ["fd.set('kind', kind)", "fd.set('file', "]) { expect(client, s).toContain(s); expect(read('components/profile/ProfileFiles.tsx'), s).toContain(s) }
    expect(client).not.toMatch(/service_role|SERVICE_ROLE|createClient\(|\.delete\(/)
    // consent is read (to say whether it is still to be ticked) and never written; the proposal cannot name it
    expect(JSON.stringify(packPatch({ consent_version: 'x', consent_at: 'y', date_of_birth: '1994-02-03', current_address: 'x' } as never))).toBe('{}')
    const cardSrc = read('components/agent/PackFillChatCard.tsx')
    expect(cardSrc).not.toMatch(/supabase\.|fetch\(|window\.confirm|alert\(|consent_version|consent_at|date_of_birth/)
  })
})

describe('the card', () => {
  it('the documents that came with the message are read at once; an empty pack is offered everything they show', async () => {
    const { container: c } = mount()
    await ready(c)
    expect(db.extracts).toBe(1)
    expect(shown(c)).toEqual(['名', '姓', '雇佣状态', '雇主', '职位', '入职日期', '月收入（税前，$）', '雇主电话', '雇主邮箱'])
    expect([field(c, 'first_name').value, field(c, 'employment_status').value, field(c, 'employer_name').value, field(c, 'employment_start_date').value, field(c, 'monthly_income').value]).toEqual(['Mia', 'employed', 'Northwind Design Inc.', '2024-03-04', '5200'])
    expect(all(c, '[data-testid="pack-fill-read"]').length).toBe(9)
    expect(textOf(only(c, '[data-testid="pack-fill-basis"]'))).toBe('按文件上每两周税前 $2,400 折算成月收入，请对一下。')
    // the files, each under the kind read and with its own date — both ticked
    const rows = all<HTMLElement>(c, '[data-testid="pack-fill-file-row"]')
    expect(rows.map((r) => [textOf(only(r, 'label')), only<HTMLSelectElement>(r, '[data-testid="pack-fill-kind"]').value, only<HTMLInputElement>(r, '[data-testid="pack-fill-asof"]').value, r.dataset.keep])).toEqual([['paystub.pdf', 'paystub', '2026-11-14', '1'], ['letter.jpg', 'employment_letter', '2026-10-02', '1']])
    // reading wrote nothing
    expect([db.saved, db.stored]).toEqual([[], []])
  })
  it('a pack that already has values keeps them: only the gaps are proposed, and the rest is named as untouched', async () => {
    db.profile = { first_name: 'Mia', last_name: 'Chen', employer_name: 'Old Co', monthly_income: 4800 }
    const { container: c } = mount()
    await ready(c)
    expect(shown(c)).toEqual(['雇佣状态', '职位', '入职日期', '雇主电话', '雇主邮箱'])
    expect(textOf(only(c, '[data-testid="pack-fill-kept"]'))).toBe('申请包里已经有、没有动的：名、姓、雇主、月收入（税前，$）')
    expect(c.querySelector('[data-testid="pack-fill-employer_name"]')).toBeNull()
    fireEvent.click(only(c, '[data-testid="pack-fill-confirm"]'))
    await ready(c, 'done')
    expect(db.saved).toEqual([{ employment_status: 'employed', job_title: 'Product Designer', employment_start_date: '2024-03-04', employer_phone: '416-555-0142', employer_email: 'hr@northwind.example.org' }])
  })
  it('documents in another name than the pack’s: the card says so, and leaves the name alone', async () => {
    db.profile = { first_name: 'Test', last_name: 'Tenant' }
    const { container: c } = mount()
    await ready(c)
    expect(textOf(only(c, '[data-testid="pack-fill-name"]'))).toBe('⚠ 文件上的姓名是「Mia Chen」，申请包里是「Test Tenant」。申请包里的姓名没有动；请确认这些文件是你本人的。')
    expect(c.querySelector('[data-testid="pack-fill-first_name"]')).toBeNull()
    cleanup(); forgetPackReads()
    db.profile = { first_name: 'Mia', last_name: 'Chen' }
    const same = mount({ offer: { id: 'offer-2' } })
    await ready(same.container)
    expect(same.container.querySelector('[data-testid="pack-fill-name"]')).toBeNull()
  })
  it('only 「确认写进申请包」 writes: what is on the card at that moment, and the ticked files under the kinds shown', async () => {
    const { container: c } = mount()
    await ready(c)
    fireEvent.change(field(c, 'monthly_income'), { target: { value: '5300' } })
    expect(all(c, '[data-testid="pack-fill-read"]').length).toBe(8)
    expect(c.querySelector('[data-testid="pack-fill-basis"]')).toBeNull()
    fireEvent.change(field(c, 'employer_phone'), { target: { value: '' } })
    const rows = all<HTMLElement>(c, '[data-testid="pack-fill-file-row"]')
    fireEvent.change(only(rows[1], '[data-testid="pack-fill-kind"]'), { target: { value: 'reference' } })
    fireEvent.click(only(c, '[data-testid="pack-fill-confirm"]'))
    await ready(c, 'done')
    expect(db.saved).toEqual([{ first_name: 'Mia', last_name: 'Chen', employment_status: 'employed', employer_name: 'Northwind Design Inc.', job_title: 'Product Designer', employment_start_date: '2024-03-04', monthly_income: 5300, employer_email: 'hr@northwind.example.org' }])
    expect(db.stored).toEqual([['paystub.pdf', 'paystub', '2026-11-14'], ['letter.jpg', 'reference', '2026-10-02']])
    const done = only(c, '[data-testid="pack-fill-done"]')
    expect(textOf(done)).toContain('✓ 已写进申请包：8 项资料、2 份文件')
    // the consent is the applicant's to tick, and the card says where
    expect(textOf(only(c, '[data-testid="pack-fill-next"]'))).toContain('同意书还没有勾选：到租客护照页自己勾选后')
    expect(only<HTMLAnchorElement>(c, '[data-testid="pack-fill-open"]').getAttribute('href')).toBe('/tenant/passport')
    expect(JSON.parse(localStorage.getItem(packFillDoneKey('u-tenant', 'offer-1'))!)).toEqual({ fields: ['first_name', 'last_name', 'employment_status', 'employer_name', 'job_title', 'employment_start_date', 'monthly_income', 'employer_email'], files: 2, consented: false })
  })
  it('a file can be left out; with consent already on file the closing line says what happens next instead', async () => {
    db.profile = { consent_version: 'profile-v1-2026-10', consent_at: '2026-11-01T12:00:00Z' }
    const { container: c } = mount()
    await ready(c)
    fireEvent.click(only(all(c, '[data-testid="pack-fill-file-row"]')[1], '[data-testid="pack-fill-keep"]'))
    fireEvent.click(only(c, '[data-testid="pack-fill-confirm"]'))
    await ready(c, 'done')
    expect(db.stored).toEqual([['paystub.pdf', 'paystub', '2026-11-14']])
    expect(textOf(only(c, '[data-testid="pack-fill-next"]'))).toContain('申请房源时申请包会自动带入')
    expect(textOf(only(c, '[data-testid="pack-fill-next"]'))).not.toContain('同意书还没有勾选')
  })
  it('a value that does not fit is refused before anything is written', async () => {
    const { container: c } = mount()
    await ready(c)
    fireEvent.change(field(c, 'monthly_income'), { target: { value: 'about 5k' } })
    fireEvent.click(only(c, '[data-testid="pack-fill-confirm"]'))
    await waitFor(() => expect(textOf(only(c, '[data-testid="pack-fill-error"]'))).toBe('月收入请填一个数字。'))
    expect([db.saved, db.stored]).toEqual([[], []])
  })
  it('the details not saved: nothing else is written either', async () => {
    db.saveOk = false
    const { container: c } = mount()
    await ready(c)
    fireEvent.click(only(c, '[data-testid="pack-fill-confirm"]'))
    await waitFor(() => expect(c.querySelector('[data-testid="pack-fill-error"]')).not.toBeNull())
    expect(textOf(only(c, '[data-testid="pack-fill-error"]'))).toContain('什么都没写进去')
    expect(db.stored).toEqual([])
    expect(card(c).dataset.step).toBe('form')
    expect(localStorage.getItem(packFillDoneKey('u-tenant', 'offer-1'))).toBeNull()
  })
  it('a file the pack refuses says why beside it; the details are in, and the file can be tried again', async () => {
    db.storeFails = { 'letter.jpg': '这一类最多 6 份，先删掉一份再传。' }
    const { container: c } = mount()
    await ready(c)
    fireEvent.click(only(c, '[data-testid="pack-fill-confirm"]'))
    await waitFor(() => expect(c.querySelector('[data-testid="pack-fill-file-error"]')).not.toBeNull())
    expect(textOf(only(c, '[data-testid="pack-fill-file-error"]'))).toBe('这一类最多 6 份，先删掉一份再传。')
    expect(textOf(only(c, '[data-testid="pack-fill-error"]'))).toContain('资料已写进申请包；有 1 份文件没有存上')
    expect(db.saved.length).toBe(1)
    expect(db.stored).toEqual([['paystub.pdf', 'paystub', '2026-11-14']])
    // the details are not offered a second time; the one file is
    expect(c.querySelector('[data-testid="pack-fill-fields"]')).toBeNull()
    db.storeFails = {}
    fireEvent.click(only(c, '[data-testid="pack-fill-confirm"]'))
    await ready(c, 'done')
    expect(db.saved.length).toBe(1)
    expect(db.stored.map((s) => s[0])).toEqual(['paystub.pdf', 'letter.jpg'])
  })
  it('no file with the message: the card asks for one; a read that fails still lets the file into the pack', async () => {
    const a = mount({ attachments: undefined })
    await ready(a.container, 'pick')
    expect(db.extracts).toBe(0)
    expect(textOf(only(a.container, '[data-testid="pack-fill-pick"]'))).toContain('只填申请包里还空着的')
    cleanup()
    db.extraction = null
    const b = mount({ offer: { id: 'offer-2' } })
    await ready(b.container)
    expect(textOf(only(b.container, '[data-testid="pack-fill-nothing"]'))).toContain('这些文件我没有读出来')
    expect(all(b.container, '[data-testid="pack-fill-kind"]').map((s) => (s as HTMLSelectElement).value)).toEqual(['other', 'other'])
    fireEvent.click(only(b.container, '[data-testid="pack-fill-confirm"]'))
    await ready(b.container, 'done')
    expect([db.saved, db.stored.length]).toEqual([[], 2])
  })
  it('the pack could not be read: the card touches nothing and offers a retry', async () => {
    db.loadFails = true
    const { container: c } = mount()
    await ready(c, 'failed')
    expect(db.extracts).toBe(0)
    expect(textOf(only(c, '[data-testid="pack-fill-failed"]'))).toContain('申请包没有读出来，所以这里先不动它')
  })
  it('written from this card already: after a reload it says so and reads nothing; one read per card', async () => {
    localStorage.setItem(packFillDoneKey('u-tenant', 'offer-1'), JSON.stringify({ fields: ['employer_name'], files: 1, consented: true }))
    const a = mount()
    await ready(a.container, 'done')
    expect(db.extracts).toBe(0)
    cleanup(); localStorage.removeItem(packFillDoneKey('u-tenant', 'offer-1'))
    const b = mount()
    await ready(b.container)
    cleanup()
    const c2 = mount()
    await ready(c2.container)
    expect(db.extracts).toBe(1)
  })
  it('the pack is the tenant’s: no card in a landlord’s or an agent’s conversation, or with nobody signed in', () => {
    for (const role of ['landlord', 'agent'] as const) { expect(mount({ role }).container.querySelector('[data-testid="pack-fill-card"]')).toBeNull(); cleanup() }
    db.user = null
    expect(mount().container.querySelector('[data-testid="pack-fill-card"]')).toBeNull()
    expect(db.extracts).toBe(0)
  })
  it('only PDFs and photos the model can read are taken from the message', () => {
    const heic: ChatAttachment = { name: 'id.heic', mediaType: 'image/heic', dataUrl: `data:image/heic;base64,${btoa('x')}`, isImage: true }
    const stored: ChatAttachment = { ...STUB, name: 'old.pdf', dataUrl: '' }
    expect(packFilesFromAttachments([STUB, heic, stored, LETTER]).map((f) => [f.name, f.type])).toEqual([['paystub.pdf', 'application/pdf'], ['letter.jpg', 'image/jpeg']])
    expect(packFilesFromAttachments(undefined)).toEqual([])
  })
  it('in English the card is English', async () => {
    localStorage.setItem('stayloop_lang', 'en')
    const { container: c } = mount()
    await ready(c)
    await waitFor(() => expect(textOf(only(c, '[data-testid="pack-fill-confirm"]'))).toBe('Confirm & add to my pack'))
    expect(textOf(card(c))).not.toMatch(/[一-鿿]/)
    expect(textOf(only(c, '[data-testid="pack-fill-basis"]'))).toBe('Worked out from $2,400 gross every two weeks as printed — please check it.')
  })
})
