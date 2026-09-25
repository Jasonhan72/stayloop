// Three-role test report (~/Downloads/stayloop-3role-test-report.pdf, 2026-09-24).
// Each guard names the finding it closes.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { homeForHats, safeNext } from '@/lib/landlordHat'

const read = (p: string) => readFileSync(p, 'utf8')

describe('SL-T-01 · no score without evidence', () => {
  it('screen-score refuses a run with no documents and no verification, before any model call', () => {
    const s = read('app/api/screen-score/route.ts')
    const guard = s.indexOf("code: 'no_documents'")
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(s.indexOf('// ---- Stage 1: Sign all files in parallel'))
    expect(s).toMatch(/nFiles === 0 && !\(v && \(v\.id \|\| v\.bank \|\| v\.credit\)\)/)
  })
  it('the start button needs at least one file (a name alone is not enough)', () => {
    const s = read('app/screening/app/page.tsx')
    expect(s).not.toContain("(files.length === 0 && !applicantName.trim()) || classifying")
    expect(s).toContain('files.length === 0 || classifying || preparing')
  })
})

describe('SL-L-01 · applicant documents open in-page and the view is audited', () => {
  it('no window.open after an await; modal handles loading / error / retry', () => {
    const page = read('app/landlord/applicants/[id]/page.tsx')
    expect(page).not.toMatch(/window\.open\(j\.url/)
    expect(page).toContain('<FilePreviewModal')
    const modal = read('components/landlord/FilePreviewModal.tsx')
    for (const s of ["phase: 'loading'", "phase: 'error'", 'Retry', 'target="_blank"']) expect(modal).toContain(s)
    expect(modal).toMatch(/code === 403/)
  })
  it('/api/file-url writes the audit row the page promises', () => {
    expect(read('app/api/file-url/route.ts')).toContain("action: 'application_file_viewed'")
  })
})

describe('SL-A-01 / SL-T-06 / SL-T-08 · the landlord hat is explicit', () => {
  it('no page load claims a landlord row', () => {
    expect(read('lib/useLandlord.ts')).not.toContain("rpc('claim_landlord')")
    expect(read('lib/useUser.ts')).not.toContain("rpc('claim_landlord')")
  })
  it('landlord workspace sends signed-in accounts without the hat to /landlord/become', () => {
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).toMatch(/role === 'landlord' && signedIn && !hats\.loading && !hats\.landlord/)
    expect(shell).toContain("router.replace('/landlord/become?next='")
    expect(read('app/landlord/become/page.tsx')).toContain("rpc('claim_landlord')")
  })
  it('onboarding as a landlord is an explicit opt-in', () => {
    expect(read('app/onboarding/name/page.tsx')).toMatch(/role === 'landlord' && signedIn\) \{\s*void Promise\.resolve\(supabase\.rpc\('claim_landlord'\)\)/)
  })
  it('safeNext keeps only same-site paths', () => {
    expect(safeNext('/landlord/applicants?x=1')).toBe('/landlord/applicants?x=1')
    for (const bad of [null, '', 'https://evil.com', '//evil.com', '/\\evil', '/landlord/become?next=/x']) expect(safeNext(bad)).toBe('/landlord/agent')
  })
  it('sign-in lands on a hat the account holds, not the previous account’s role', () => {
    expect(homeForHats('landlord', { landlord: false, agent: null })).toBe('/tenant/agent')
    expect(homeForHats('landlord', { landlord: false, agent: 'verified' })).toBe('/agent/agent')
    expect(homeForHats('landlord', { landlord: true })).toBe('/landlord/agent')
    expect(homeForHats('tenant', { landlord: true })).toBe('/tenant/agent')
    expect(homeForHats(null, { landlord: true })).toBe('/landlord/agent')
    expect(read('app/login/page.tsx')).toContain('homeForHats(role, data as HatsLite)')
    const cb = read('app/auth/callback/page.tsx')
    expect(cb).toContain('homeForHats(candidate, hats as HatsLite)')
    // agent_configs / signup role are candidates too — never a landing page on their own
    expect(cb).not.toMatch(/dest = AGENT_HOME\[role\]/)
  })
})

describe('P2 items', () => {
  it('SL-T-02/03/04 · apply page shows what you apply for, prefills, and says 人权法典 in Chinese', () => {
    const s = read('app/apply/[slug]/page.tsx')
    expect(s).toContain('data-testid="apply-listing-summary"')
    expect(s).toMatch(/email: f\.email \|\| u\.email/)
    expect(s).toContain('《安大略省人权法典》')
  })
  it('SL-T-05 · deciding a card refreshes every badge', () => {
    expect(read('lib/agent/useAgentSession.ts')).toMatch(/await decidePendingAction\(getSupabaseBrowser\(\), actionId, decision, note\)\s*notifyPendingChanged\(\)/)
    for (const p of ['components/Header.tsx', 'components/WorkspaceShell.tsx']) expect(read(p)).toContain('window.addEventListener(PENDING_CHANGED_EVENT, load)')
  })
  it('SL-L-04 · /landlord/applications redirects', () => {
    expect(read('middleware.ts')).toContain("url.pathname = '/landlord/applicants' + (apps[1] || '')")
  })
  it('SL-L-08 · no US-style placeholder address', () => {
    expect(read('app/leases/import/page.tsx')).not.toContain('123 Main St')
  })
  it('SL-A-02 · sign-in method is read from the account, not hard-coded', () => {
    const s = read('app/settings/page.tsx')
    expect(s).not.toContain('value="Magic Link"')
    expect(s).toContain('signInMethods(auth.user, zh)')
  })
  it('SL-A-05 · the settings rail says 设置, not 设置与订阅', () => {
    expect(read('components/WorkspaceShell.tsx')).not.toContain('设置与订阅')
  })
  it('public copy: no 内部测试期 wording', () => {
    for (const p of ['app/pricing/page.tsx', 'components/settings/SubscriptionCard.tsx']) expect(read(p)).not.toContain('内部测试期')
  })
})

describe('round 2 (user: 改成 V0.6，其余按建议全部修)', () => {
  it('footer shows V0.6', () => {
    expect(read('components/Footer.tsx')).toContain('>V0.6<')
    expect(read('components/Footer.tsx')).not.toContain('>v5.3<')
  })
  it('SL-L-02 · the to-do page does not repeat its own cards in 今日', async () => {
    const { buildToday } = await import('@/lib/lifecycle/today')
    const pending = [{ id: '1', action_type: 'showing_request', title: '看房请求' }]
    const lc = { current: 'pre', phases: [{ key: 'pre', steps: [{ key: 'showings', state: 'current', label: { zh: '看房 / 提问', en: 'Showings' }, detail: { zh: '1 条等你回复', en: '1 waiting' }, href: '/landlord/todo' }], next: null }] } as never
    expect(buildToday(lc, pending, '/landlord/todo').map((i) => i.id)).toEqual(['approvals'])
    expect(buildToday(lc, pending, '/landlord/todo', { omitPending: true })).toEqual([])
    expect(read('components/mobile/RolePages.tsx')).toContain('omitPending')
  })
  it('SL-A-04 · client counts and tasks come from the client table', async () => {
    expect(read('components/agent/StatusOverview.tsx')).toMatch(/from\('agent_clients'\)[^\n]*neq\('stage', 'closed'\)/)
    const { clientTasks } = await import('@/lib/agent/clientBook')
    const base = { client_role: 'tenant' as const, last_contact_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    const t = clientTasks([
      { ...base, id: 'a', name: 'Amy', stage: 'searching', representation_agreement_at: null, info_guide_given_at: null },
      { ...base, id: 'b', name: 'Ben', stage: 'showing', representation_agreement_at: '2026-09-01', info_guide_given_at: '2026-09-01' },
      { ...base, id: 'c', name: 'Cat', stage: 'closed', representation_agreement_at: null, info_guide_given_at: null },
    ])
    expect(t.map((x) => x.id)).toEqual(['paper:a', 'pack:b'])
    expect(read('app/agent/tasks/page.tsx')).toContain('liveSlot={<ClientTasks')
    expect(read('components/WorkspaceShell.tsx')).not.toContain('客户与任务功能将在代表协议记录上线后开放')
  })
  it('SL-L-05 · applications can be archived and unarchived', () => {
    expect(read('supabase/migrations/20260924_applications_archive.sql')).toContain('archived_at timestamptz')
    const list = read('app/landlord/applicants/page.tsx')
    expect(list).toContain("update({ archived_at: at }).in('id', ids)")
    expect(list).toContain('data-testid="archived-applications"')
    expect(read('app/landlord/applicants/[id]/page.tsx')).toContain('data-testid="archive-toggle"')
  })
  it('SL-L-03 · wizard drafts bilingual copy only from entered fields, no false AI promise', async () => {
    const { draftListingCopy } = await import('@/lib/listingCopy')
    const d = draftListingCopy({ address: '88 Harbour St', unit: '1203', city: 'Toronto', property_type: 'condo', bedrooms: 1, bathrooms: 1, monthly_rent: 2450 })
    expect(d.title).toContain('88 Harbour St')
    expect(d.description).toMatch(/月租 \$2,450/)
    expect(d.description).toMatch(/\$2,450\/month/)
    expect(d.description).not.toMatch(/宠物|pet|包含|includes|家具|Furnished|吸烟|smoking/i)
    const w = read('app/dashboard/listings/new/page.tsx')
    expect(w).not.toContain('自动生成英中文文案、推荐价格区间、SEO 描述')
    expect(w).toContain('data-testid="listing-copy"')
    expect(read('lib/listingPublish.ts')).toContain('...(form.description ? { description: form.description } : {})')
  })
  it('SL-T-07 · a messages inbox for tenants and landlords', () => {
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).toContain("href: '/tenant/messages'")
    expect(shell).toContain("href: '/landlord/messages'")
    expect(read('components/messages/Inbox.tsx')).toContain("from('household_messages')")
    expect(read('app/h/[id]/page.tsx')).toContain('setReadMark(id,')
  })
})

describe('SL-L-06 · screening pages speak the UI language', () => {
  it('summaries are persisted in both languages and picked by UI language', async () => {
    const { summaryFor } = await import('@/lib/screening/summaryText')
    const row = { ai_summary: 'Strong credit.', ai_summary_en: 'Strong credit.', ai_summary_zh: '信用强。' }
    expect(summaryFor(row, true)).toBe('信用强。')
    expect(summaryFor(row, false)).toBe('Strong credit.')
    expect(summaryFor({ ai_summary: 'Old row, English only.' }, true)).toBe('Old row, English only.')
    const route = read('app/api/screen-score/route.ts')
    expect(route).toContain('ai_summary_zh: parsed.summary_zh || null')
    for (const p of ['app/screening/[id]/done/page.tsx', 'app/landlord/applicants/[id]/page.tsx', 'app/screening/app/page.tsx']) expect(read(p)).toContain('summaryFor(')
  })
  it('gate / flag codes are shown as plain language, never as raw codes only', async () => {
    const { signalLabel } = await import('@/lib/screening/signalLabels')
    expect(signalLabel('doc_tampering', true)).toBe('文件疑似被改动（取证）')
    expect(signalLabel('forensics_timestamp_batch_creation', true)).toBe('多份文件创建时间几乎相同')
    expect(signalLabel('cross_doc_contradictions', false)).toBe('Documents contradict each other')
    expect(signalLabel('brand_new_code', true)).toBe('其他信号：brand new code')
    expect(signalLabel('A free-text flag.', true)).toBe('A free-text flag.')
    expect(read('app/screening/[id]/report/page.tsx')).toContain('signalLabel(g, zh)')
    expect(read('app/screening/[id]/done/page.tsx')).toContain('signalLabel(f, zh)')
  })
  it('done / graph pages are bilingual; share page no longer fakes a share form', () => {
    for (const p of ['app/screening/[id]/done/page.tsx', 'app/screening/[id]/graph/page.tsx']) {
      const s = read(p)
      expect(s).toContain("const zh = lang === 'zh'")
      expect(s).toMatch(/[一-龥]/)
    }
    expect(read('app/screening/[id]/done/page.tsx')).not.toMatch(/>\s*Screening Complete\s*</)
    const share = read('app/screening/[id]/share/page.tsx')
    expect(share).toContain('分享链接尚未上线')
    expect(share).not.toContain("alert('Share links are coming soon")
  })
  it('report tier labels match the result card wording in Chinese', () => {
    const r = read('app/screening/[id]/report/page.tsx')
    expect(r).toContain("zh ? '优质 · 建议通过' : 'PROCEED'")
    expect(r).toContain('tierInfo(tier, zh)')
  })
})

describe('SL-L-06 · report text in Chinese (rubric, court sources, model free text)', () => {
  it('every rubric rule line the engine can emit has a Chinese rendering', async () => {
    const { rubricObservedZh } = await import('@/lib/screening/localize')
    const cases: Array<[string, string, RegExp]> = [
      ['income_rent_ratio', '3.25x verified — information only, not a refusal ground', /3\.25 倍/],
      ['income_verified_no_rent', 'verified $5,200/mo · no target rent — ratio not computed / 未填目标租金 — 未计算收入租金比', /\$5,200/],
      ['income_documented_no_bank_trail', '$6,000/mo on 2 reconciling payroll-system stubs · no personal-account trail yet', /2 张/],
      ['income_unverified', 'claimed $4,000/mo, no personal-account trail · no target rent — ratio not computed', /申报月收入 \$4,000.*未填目标租金/],
      ['employment_tenure', '42 months in role', /^在职 42 个月$/],
      ['no_credit_report', 'no bureau report supplied', /^未提供征信报告$/],
      ['bureau_score', '723 (Equifax)', /信用分 723（Equifax）/],
      ['credit_report_aging', 'report is 7 months old — request a current pull', /7 个月.*重新拉取/],
      ['revolving_utilisation', '85% of $12,000 revolving', /\$12,000.*85%/],
      ['thin_file', '1 tradeline(s), 8 months of history — short history is information, not a negative', /1 个信贷账户、8 个月/],
      ['no_landlord_reference', 'no prior address or landlord given', /^未提供过往地址或房东$/],
      ['rent_payments_observed', '$2,400 recurring in 3 statement month(s)', /3 个月.*\$2,400/],
      ['documents_present', '3/4 required kinds (id_document, pay_stub, bank_statement)', /4 类材料有 3 类（证件、工资单、银行流水）/],
      ['corroborations', 'payroll_processor_recognized, deposits_match_paystub_net', /代发机构.*实发/],
      ['identity_consistent', 'ID-document name matches the applicant name', /一致/],
      ['cross_doc_contradiction', 'cross_doc_income_mismatch (high), residence_timeline_contradiction (medium)', /（高）.*居住时间线.*（中）/],
      ['no_external_verification', 'documents are consistent with each other; no third-party check yet', /第三方核验/],
    ]
    for (const [code, en, re] of cases) {
      const zh = rubricObservedZh(code, en)
      expect(zh, code).toMatch(re)
      expect(zh, code).toMatch(/[一-龥]/)
    }
    // Unknown shapes fall back to the stored text instead of disappearing.
    expect(rubricObservedZh('some_future_rule', 'x y z')).toBe('x y z')
  })
  it('court sources and notes render in Chinese without changing the stored source', async () => {
    const { courtSourceZh, courtNoteZh } = await import('@/lib/screening/localize')
    expect(courtSourceZh('Ontario Courts Portal — Civil & Small Claims')).toBe('安省法院门户 · 民事与小额法庭')
    expect(courtSourceZh('LTB Order Catalogue — Ontario Open Data (Jane Doe)')).toBe('LTB 判令目录（安省开放数据）（Jane Doe）')
    expect(courtNoteZh("No matches in Ontario Courts Portal (116 name-search results returned; none matched the applicant's exact name after verification)")).toMatch(/116 条结果/)
    expect(courtNoteZh('No matches in Ontario Courts Portal')).toBe('安省法院门户无匹配')
    expect(courtNoteZh('Full-text search of canlii.org via its public web index: no page mentions this exact name.')).toMatch(/没有任何页面/)
    expect(courtNoteZh('No LTB order in the published catalogue names this person as a responding tenant (catalogue currently covers 2026-01-01 to 2026-05-31, 40,844 orders).')).toMatch(/2026-01-01 至 2026-05-31 共 40,844 份/)
    expect(courtNoteZh('2 published order(s) name this person as a responding tenant (L1). None is at an address the applicant declared, so this may be a namesake.')).toMatch(/2 份.*同名/)
    // The report logic branches on the English source; renderers only translate at display.
    const route = read('app/screening/app/page.tsx')
    expect(route).toContain("q.source === 'CanLII' && q.status === 'unavailable'")
    expect(route).toContain("lang === 'zh' ? courtSourceZh(q.source) : q.source")
  })
  it('localizeResult swaps model *_zh twins in, and only when the lists line up', async () => {
    const { localizeResult } = await import('@/lib/screening/localize')
    const r = {
      income_evidence: '2 paystubs', income_evidence_zh: '两张工资单',
      rubric: { hits: [{ code: 'employment_tenure', observed: '42 months in role' }] },
      cross_doc_verification: {
        income_corroboration: { observed_pattern: 'p', detail: 'd', observed_pattern_zh: '模式', detail_zh: '说明' },
        related_party: { signals: ['a', 'b'], signals_zh: ['甲'] },
        verification_checklist: ['call X'], verification_checklist_zh: ['致电 X'],
      },
    }
    const z = localizeResult(r, true)
    expect(z.income_evidence).toBe('两张工资单')
    expect(z.rubric.hits[0].observed).toBe('在职 42 个月')
    expect(z.cross_doc_verification.income_corroboration.detail).toBe('说明')
    expect(z.cross_doc_verification.related_party.signals).toEqual(['a', 'b']) // length mismatch → keep English
    expect(z.cross_doc_verification.verification_checklist).toEqual(['致电 X'])
    expect(localizeResult(r, false)).toBe(r)
    for (const p of ['app/screening/[id]/report/page.tsx', 'lib/generateReport.ts']) expect(read(p)).toContain('localizeResult(')
  })
  it('the model is asked for the Chinese twins; the report no longer shows a second-language summary box', () => {
    const route = read('app/api/screen-score/route.ts')
    for (const k of ['"income_evidence_zh"', '"observed_pattern_zh"', '"detail_zh"', '"signals_zh"', '"suspicious_transfers_zh"', '"verification_checklist_zh"']) expect(route).toContain(k)
    expect(read('app/screening/[id]/report/page.tsx')).not.toContain('altSummary')
  })
})

describe('found while walking the landlord test account (2026-09-24)', () => {
  it('renewal card labels read the guideline from the card, never a hard-coded 2.5%', () => {
    const s = read('components/agent/ApprovalActionCard.tsx')
    expect(s).not.toMatch(/2\.5%|\?\? 2\.5/)
    expect(s).toContain('m.guideline_pct != null')
  })
  it('applicant list: no credit/income "policy" pre-screen copy, no "offer" mix, compare excludes archived', () => {
    const s = read('app/landlord/applicants/page.tsx')
    expect(s).not.toContain('按 信用/收入/法庭记录 政策预筛')
    expect(s).not.toContain('接受其他 offer')
    expect(s).toContain('rows={activeRows.map(')
  })
  it('hub messages push the other side, and the inbox says what actually happens', () => {
    expect(read('app/h/[id]/page.tsx')).toContain("fetch('/api/household/notify-message'")
    const route = read('app/api/household/notify-message/route.ts')
    expect(route).toContain(".eq('sender_id', ud.user.id)")
    expect(route).not.toMatch(/sendEmail/)
    expect(read('components/messages/Inbox.tsx')).not.toContain('回复会同时发到对方邮箱')
  })
  it('forensics verdict and document kinds are shown in Chinese', async () => {
    expect(read('app/screening/[id]/report/page.tsx')).toContain("clean: '未见异常'")
    const { rubricObservedZh } = await import('@/lib/screening/localize')
    expect(rubricObservedZh('documents_present', '2/4 required kinds (pay_stub, government_id)')).toBe('必需的 4 类材料有 2 类（工资单、证件）')
  })
  it('listing draft title spacing and the empty-rent summary', async () => {
    const { draftListingCopy } = await import('@/lib/listingCopy')
    expect(draftListingCopy({ address: '88 Harbour St', bedrooms: 1, bathrooms: 1, property_type: 'condo' }).title).toMatch(/^1 卧 1 卫 公寓 · 88 Harbour St/)
    expect(read('app/dashboard/listings/new/page.tsx')).toContain("form.monthly_rent.trim() ? `$${form.monthly_rent}` : NOT_PROVIDED[lang]")
  })
})

describe('found while walking the agent test account (2026-09-24)', () => {
  it('a live-registered agent screens for clients inside the agent workspace, no landlord hat needed', () => {
    const s = read('app/screening/app/page.tsx')
    expect(s).toContain("agentLive && (!hats.landlord || asAgent) ? 'agent' : 'landlord'")
    expect(read('components/agent/ClientBook.tsx')).toContain('href="/screening/app?as=agent"')
    const become = read('app/landlord/become/page.tsx')
    expect(become).not.toContain('经纪代客筛查会在代表协议记录上线后开放')
    expect(become).toContain('从客户那一行点「发起筛查」')
  })
  it('client-table task text spaces CJK and Latin', async () => {
    const { clientTasks } = await import('@/lib/agent/clientBook')
    const now = new Date().toISOString()
    const [t] = clientTasks([{ id: 'x', name: 'Ann', stage: 'searching', client_role: 'tenant', representation_agreement_at: '2026-09-01', info_guide_given_at: null, last_contact_at: now, updated_at: now }])
    expect(t.zh).toContain('记录 RECO Information Guide 的日期')
  })
})
