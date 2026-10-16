// V1.0 stage 2 · 丙 #14 — offer / lease-points checklist for agents, plus discussion-paper
// item 3 (the 'trreb' renderer is Stayloop's own offer summary, landlord-only, no form cross-reference).
// lib/agent/offerCheck.ts is deterministic (regex + amount parsing, no model); the page keeps the
// pasted text in state only; the rail gets one 核对清单 entry; the shell leaves the page open
// before RECO verification because it is an information tool.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkOfferText, datesIn, parseOffer, summarize, OFFER_CHECK_IDS } from '@/lib/agent/offerCheck'
import { RENT_GUIDELINE, ruleById } from '@/lib/ontario/rules'

vi.mock('@/lib/supabase', () => ({ supabase: {}, getSupabaseBrowser: () => ({}) }))
vi.mock('@/lib/messages/unread', () => ({ useUnreadMessages: () => 0 }))
vi.mock('@/lib/agent/pendingCount', () => ({ fetchPendingCount: async () => 0, PENDING_CHANGED_EVENT: 'x' }))

const read = (p: string) => readFileSync(p, 'utf8')
const noComments = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const ids = (text: string, province = 'ON') => checkOfferText(text, { province }).findings.map((f) => `${f.severity}:${f.id}`)
const blocks = (text: string) => checkOfferText(text).findings.filter((f) => f.severity === 'block').map((f) => f.id)

const CLEAN = 'Tenants: Mia Chen. Landlord: Sarah Wang. Premises: Unit 1207, 100 King St W, Toronto M5V 1A1. Term: fixed, commencing Nov 1, 2026 and ending Oct 31, 2027. Rent $2,800 per month, due on the first day of each month by e-transfer. Deposit $2,800 (last month\'s rent). Hydro and internet paid by tenant; heat and water included. Pets allowed. Parking included. Signed on Oct 20, 2026; irrevocable until Oct 22, 2026.'

describe('checkOfferText — one finding per problem, deterministic', () => {
  it('deposit of two months (English and Chinese) blocks under RTA s.106', () => {
    const en = checkOfferText('Unit 1207, 100 King St W. Rent $2,800/month due on the first day of each month. Deposit: two months rent. Term Nov 1, 2026 to Oct 31, 2027. Hydro extra. Signed on Oct 20, 2026.')
    expect(en.findings.map((f) => f.id)).toEqual(['deposit-over-one-month'])
    expect(en.findings[0]).toMatchObject({ severity: 'block', rule: 'RTA-106-deposit-cap', href: '/rules#RTA-106-deposit-cap' })
    expect(en.parsed).toMatchObject({ rent: 2800, deposit: 5600, depositMonths: 2, startDate: '2026-11-01', endDate: '2027-10-31' })
    const zh = checkOfferText('地址：100 King St W 1207 室。月租 $2,800，每月 1 日付。押金两个月。租期 2026 年 11 月 1 日至 2027 年 10 月 31 日。')
    expect(blocks('地址：100 King St W 1207 室。月租 $2,800，每月 1 日付。押金两个月。租期 2026 年 11 月 1 日至 2027 年 10 月 31 日。')).toEqual(['deposit-over-one-month'])
    // the year after 「两个月。租期」 is not read as the deposit amount
    expect(zh.parsed.deposit).toBe(5600)
    // an amount above the rent blocks too; exactly one month does not
    expect(blocks('月租 $2,500，押金 $3,000。')).toEqual(['deposit-over-one-month'])
    expect(blocks('月租 $2,500，押金 $2,500。')).toEqual([])
  })
  it('a pet / cleaning / damage deposit blocks under s.134(2), separately from the cap', () => {
    expect(blocks('月租 $2,500，押金 $2,500，另收宠物押金 $500。')).toEqual(['deposit-purpose'])
    expect(blocks('Rent $2,000 per month. Deposit $2,000 to cover any damage.')).toEqual(['deposit-purpose'])
  })
  it('any fee charged to the tenant blocks under s.134(1)', () => {
    expect(blocks('Rent $2,000 per month. Application fee $50 payable on submission.')).toEqual(['fee-to-tenant'])
    expect(blocks('月租 $2,000，签约时收手续费 $100。')).toEqual(['fee-to-tenant'])
    // a stated "no application fee" is compliance, not a breach
    expect(blocks('Rent $2,000 per month. No application fee.')).toEqual([])
  })
  it('a key deposit above replacement cost warns; a modest one passes', () => {
    expect(ids('Rent $2,000/month. Key deposit $400.')).toContain('warn:key-deposit')
    expect(ids('Rent $2,000/month. Key deposit $60.')).not.toContain('warn:key-deposit')
  })
  it('a pet ban blocks under s.14', () => {
    expect(blocks('月租 $2,000，押金 $2,000。No pets allowed.')).toEqual(['pet-ban'])
    expect(blocks('月租 $2,000。不允许养宠物。')).toEqual(['pet-ban'])
  })
  it('an air-conditioner ban blocks under s.36.1 — the shared regex and the "shall not install" form', () => {
    expect(blocks('Rent $2,000/month. No air conditioners.')).toEqual(['ac-ban'])
    expect(blocks('Rent $2,000/month. Tenant shall not install air conditioners.')).toEqual(['ac-ban'])
    expect(blocks('月租 $2,000。租客不得安装空调。')).toEqual(['ac-ban'])
  })
  it('a written 5% annual increase blocks above the guideline for the year it would take effect', () => {
    const r = checkOfferText('Rent $2,000 per month commencing 2026-12-01 ending 2027-11-30; rent will increase by 5% annually.')
    const f = r.findings.find((x) => x.id === 'increase-above-guideline')
    expect(f).toMatchObject({ severity: 'block', rule: 'RTA-120-guideline', href: '/rules#RTA-120-guideline' })
    expect(f!.zh).toContain(`${RENT_GUIDELINE[2027]}%`)
    expect(f!.en).toContain('2027')
    // within the guideline it still warns: an offer clause cannot replace the N1
    expect(ids('Rent $2,000 per month commencing 2026-12-01 ending 2027-11-30; rent increases 1.5% each year.')).toContain('warn:increase-automatic')
    expect(ids('月租 $2,000，每年自动按 CPI 上调。')).toContain('warn:increase-automatic')
    // a percentage with no increase word nearby is not an increase
    expect(ids('Rent $2,000 per month. Tenant pays 50% of the hydro bill.').some((x) => x.includes('increase'))).toBe(false)
  })
  it('post-dated cheques: required = block, merely mentioned = warn (s.108), no numbered rule → /rules', () => {
    const req = checkOfferText('月租 $2,000。租客必须提供 12 张预开支票。').findings.find((f) => f.id === 'post-dated-cheques')
    expect(req).toMatchObject({ severity: 'block', statute: 'RTA s.108', href: '/rules' })
    expect(req!.rule).toBeUndefined()
    const opt = checkOfferText('Rent $2,000/month. Tenant may pay by post-dated cheques if they prefer.').findings.find((f) => f.id === 'post-dated-cheques')
    // "may" is not a requirement word on its own, but "pay" is not either — the sentence has none
    expect(opt?.severity).toBe('warn')
  })
  it('an early-termination penalty warns', () => {
    expect(ids('Rent $2,000/month. If the tenant terminates early, a penalty of two months rent applies.')).toContain('warn:early-termination-penalty')
    expect(ids('月租 $2,000。提前退租需支付两个月租金作为违约金。')).toContain('warn:early-termination-penalty')
  })
  it('a bare offer lists the standard-lease items it left out, each as info pointing at O. Reg. 9/18', () => {
    const r = checkOfferText('Unit 1207, rent $2,800')
    const missing = r.findings.filter((f) => f.id.startsWith('missing-'))
    expect(missing.map((f) => f.id)).toEqual(['missing-term', 'missing-payment-day', 'missing-services', 'missing-deposit', 'missing-signature-date'])
    for (const f of missing) expect(f).toMatchObject({ severity: 'info', rule: 'OREG9-18-standard-lease', href: '/rules#OREG9-18-standard-lease' })
    expect(missing[0].zh).toContain('要约里没写')
    expect(missing[0].zh).toContain('签安省标准租约时要补')
    expect(r.findings.some((f) => f.severity === 'block')).toBe(false)
  })
  it('a clean, complete offer has no findings at all; empty text has none', () => {
    expect(checkOfferText(CLEAN).findings).toEqual([])
    expect(checkOfferText('   ').findings).toEqual([])
    expect(summarize(checkOfferText(CLEAN).findings)).toEqual({ block: 0, warn: 0, info: 0 })
  })
  it('end before start blocks', () => {
    expect(blocks('Rent $2,000 per month, commencing 2027-11-01 and ending 2026-11-30.')).toEqual(['dates-order'])
  })
  it('outside Ontario: exactly one info line naming the province, no Ontario section', () => {
    const r = checkOfferText('Rent $2,000 per month, deposit two months, no pets, application fee $50.', { province: 'QC' })
    expect(r.findings.map((f) => f.id)).toEqual(['province-outside-ontario'])
    expect(r.findings[0].severity).toBe('info')
    expect(r.findings[0].zh).toContain('魁北克')
    expect(r.findings[0].en).toContain('Quebec')
    expect(r.findings[0].zh + r.findings[0].en).not.toMatch(/RTA|s\.\d|安省的押金上限/)
    expect(checkOfferText('deposit two months', { province: 'British Columbia' }).findings[0].en).toContain('British Columbia')
    // unknown / blank province is treated as Ontario (the product's default)
    expect(checkOfferText('Rent $2,000 per month, deposit two months.', { province: null }).findings[0].id).toBe('deposit-over-one-month')
  })
  it('every finding carries a /rules link; numbered rules exist; ids are from the published list; sorted block → warn → info', () => {
    const everything = 'Unit 1207. Rent $2,000/month. Deposit two months, pet deposit $300, application fee $50, key deposit $500. No pets. No air conditioners. Rent increases 5% annually. Tenant must provide post-dated cheques. Early termination penalty $1,000.'
    const r = checkOfferText(everything)
    expect(r.findings.length).toBeGreaterThan(8)
    for (const f of r.findings) {
      expect(f.href).toMatch(/^\/rules(#[A-Za-z0-9-]+)?$/)
      if (f.rule) { expect(ruleById(f.rule), f.rule).toBeTruthy(); expect(f.href).toBe(`/rules#${f.rule}`) }
      expect(OFFER_CHECK_IDS).toContain(f.id)
      expect(f.zh.length).toBeGreaterThan(10)
      expect(f.en.length).toBeGreaterThan(10)
    }
    const order = r.findings.map((f) => ({ block: 0, warn: 1, info: 2 })[f.severity])
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
  it('date parsing covers ISO, slash, English and Chinese spellings; signing dates are not the term', () => {
    expect(datesIn('2026-11-01, 2027/10/31, Nov 1, 2026, 1 November 2026, 2026年11月1日')).toEqual(['2026-11-01', '2027-10-31'])
    // text order, not sorted — a reversed term stays reversed
    expect(datesIn('ending 2026-11-30, commencing 2027-11-01')).toEqual(['2026-11-30', '2027-11-01'])
    expect(parseOffer(CLEAN)).toMatchObject({ startDate: '2026-11-01', endDate: '2027-10-31', rent: 2800, deposit: 2800 })
  })
})

describe('the module is deterministic and self-contained', () => {
  it('no model call, no fetch, no storage — only rules.ts and provinces/detect', () => {
    const src = read('lib/agent/offerCheck.ts')
    expect(src).not.toMatch(/llmChat|fetch\(|supabase|localStorage|anthropic|openai/i)
    expect(src).toContain("from '@/lib/ontario/rules'")
    expect(src).toContain('checkLeaseTerms({')
    expect(src).toContain('mentionsFee(t)')
    expect(src).toContain('guidelineFor(effective)')
  })
})

describe('/agent/checklist page', () => {
  const page = read('app/agent/checklist/page.tsx')
  it('wears the agent shell, carries the LSA disclaimer, the no-storage line and the next-step line', () => {
    expect(page).toContain('<WorkspaceShell role="agent" hideAside>')
    expect(page).toContain('《法律协会法》s.1(6)')
    expect(page).toContain('Law Society Act s.1(6)')
    expect(page).toContain('不是法律意见')
    expect(page).toContain('不会保存')
    expect(page).toContain('never stored')
    expect(page).toContain('data-testid="checklist-disclaimer"')
    expect(page).toContain('data-testid="checklist-next-step"')
    expect(page).toContain('href="/landlord/leases/new"')
    expect(page).toContain('不要贴申请人的证件号、SIN')
  })
  it('never persists or sends the pasted text; three severities render; province select defaults to ON', () => {
    const code = noComments(page)
    expect(code).not.toMatch(/supabase|fetch\(|localStorage|sessionStorage/)
    expect(code).toContain("useState<ProvinceCode>('ON')")
    expect(code).toContain('checkOfferText(checked.text, { province: checked.province })')
    for (const sev of ['block', 'warn', 'info']) expect(code).toContain(`${sev}: {`)
    expect(code).toContain('data-testid="checklist-findings"')
    // user-visible naming: AI 助理 / AI Agent only (no 助手 / assistant)
    expect(code).not.toMatch(/助手|管家/)
  })
  it('the agent rail has 核对清单 (pages group, its own icon) and the shell keeps the page open before RECO verification', async () => {
    const { RAIL_BY_ROLE } = await import('@/components/workspace/rail')
    const it_ = RAIL_BY_ROLE.agent.find((it) => it.key === 'checklist')
    expect(it_).toMatchObject({ href: '/agent/checklist', group: 'pages', label: { zh: '核对清单', en: 'Checklist' } })
    const icons = RAIL_BY_ROLE.agent.map((it) => (it.icon as { type: { name: string } }).type.name)
    expect(new Set(icons).size).toBe(icons.length)
    expect(RAIL_BY_ROLE.tenant.some((it) => it.key === 'checklist')).toBe(false)
    expect(RAIL_BY_ROLE.landlord.some((it) => it.key === 'checklist')).toBe(false)
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).toContain("if (/^\\/agent\\/checklist(\\/|$)/.test(path)) return false")
  })
})

describe('discussion-paper item 3: the trreb renderer is an offer summary in Stayloop’s own format, landlord-only', () => {
  const model = read('lib/lease/trreb.ts')
  const doc = read('components/lease/TrrebLeaseDoc.tsx')
  it('no form cross-reference in code or rendered text', () => {
    for (const [name, src] of [['lib/lease/trreb.ts', model], ['components/lease/TrrebLeaseDoc.tsx', doc]] as const) {
      expect(noComments(src), name).not.toMatch(/Form 400|OREA|TRREB|Lessor|Lessee/)
    }
    expect(model).toContain('export type OfferSummaryTerms')
    expect(model).toContain('export function emptyOfferSummaryTerms()')
    expect(model).not.toContain('TrrebLeaseTerms')
    expect(doc).toContain('export default function OfferSummaryDoc(')
    expect(doc).toContain('Offer to Lease — Summary of Terms (Stayloop format)')
    expect(doc).toContain('not a substitute for the standard lease required by O. Reg. 9/18')
  })
  it('the landlord pages and the invitation email call it an offer summary; the stored form_type stays trreb', () => {
    const newPage = read('app/landlord/leases/new/page.tsx')
    const detail = read('app/landlord/leases/[id]/page.tsx')
    const sign = read('app/lease/sign/[token]/page.tsx')
    const mail = read('lib/lease/sendLease.ts')
    for (const [name, src] of [['new', newPage], ['detail', detail], ['sign', sign], ['mail', mail]] as const) {
      expect(noComments(src), name).not.toMatch(/Form 400|OREA|TRREB FORM|TRREB Form|TRREB 协议|TRREB 租赁|Lessor|Lessee/)
    }
    expect(newPage).toContain("['trreb', zh ? '要约要点摘要' : 'Offer summary of terms'")
    expect(newPage).toContain("type FormType = 'ontario_standard' | 'trreb'")
    expect(mail).toContain("isTrreb ? 'Offer to Lease — Summary of Terms' : 'Ontario Standard Lease'")
  })
  it('only landlord surfaces (and the tenant signing page) import the renderer — no agent entry', () => {
    const users = ['app/landlord/leases/new/page.tsx', 'app/landlord/leases/[id]/page.tsx', 'app/lease/sign/[token]/page.tsx']
    for (const u of users) expect(read(u)).toContain("from '@/components/lease/TrrebLeaseDoc'")
    const agentDir = ['app/agent/page.tsx', 'app/agent/clients/page.tsx', 'app/agent/checklist/page.tsx', 'components/agent/ClientBook.tsx']
    for (const f of agentDir) expect(read(f), f).not.toMatch(/TrrebLeaseDoc|lib\/lease\/trreb|OfferSummaryDoc/)
    // the checklist page only checks — no drafting / generating of an offer anywhere in it
    expect(read('app/agent/checklist/page.tsx')).not.toMatch(/起草要约|生成要约|draft (an|the) offer|generate (an|the) offer/i)
  })
})
