// 2026-10-02 user: 「外省的要查外省的法规，不要用安省的法规和说法。」 — stage 2: the lease and
// decision surfaces. A home outside Ontario never gets the Ontario Standard Lease / TRREB drafting
// form (/landlord/leases/new shows that province's lease-form card + the import path), the
// applicant page's decision copy names that province's human-rights and privacy law, and the
// send_decision executor sends decisionNoticeFooterFor(<province>) with rule '<province>-decision-notice'.
// Ontario keeps every string and code path it had.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { decisionNoticeFooter } from '../lib/ontario/rules'
import { decisionNoticeFooterFor, humanRights, leaseFormGuidance, rulesFor } from '../lib/provinces/rules'
import { listingProvince } from '../lib/listingDisplay'

const read = (p: string) => readFileSync(p, 'utf8')
const NON_ON = ['QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'PE', 'NL', 'YT', 'NT', 'NU'] as const
// Ontario statutes, bodies, forms and notices. (Nova Scotia has a Consumer Reporting Act of its own, so
// the Act's name is not Ontario-only; Ontario's s.10(7) is.)
const ONTARIO = /\bRTA\b|\bLTB\b|OHRC|RECO|TRESA|Ontario|安省|安大略|2229E|TRREB|Form 400|O\. ?Reg\. ?9\/18|s\.10\(7\)|\bN(1|4|9|12|13)\b/
const noComments = (src: string) => src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
const HAN = /[一-鿿]/
/** The source between two markers (both must exist, in order). */
function between(src: string, start: string, end: string): string {
  const i = src.indexOf(start)
  expect(i, start).toBeGreaterThanOrEqual(0)
  const j = src.indexOf(end, i + start.length)
  expect(j, end).toBeGreaterThan(i)
  return src.slice(i, j)
}

// The Montréal listing that started this.
const MONTREAL = { province: 'QC', address: '1569 rue St-Hubert, Montréal, QC, H2L 3Z1', city: 'Montréal', postal_code: null }

describe('lease-form facts for the province card', () => {
  it('Quebec: the TAL mandatory form, a copy within 10 days, Section G, French first, the official link', () => {
    const zh = leaseFormGuidance('QC', 'zh')!
    const en = leaseFormGuidance('QC', 'en')!
    expect(zh.mandatory).toBe(true)
    expect(zh.copyDays).toBe(10)
    expect(zh.name).toContain('TAL 强制租约表格')
    expect(zh.name).toContain('2026 年版')
    const zl = zh.lines.join('')
    for (const s of ['10 天内', 'G 部分', '最低租金', '法文', '第 1895 条']) expect(zl).toContain(s)
    expect(en.name).toMatch(/Schedule 5/)
    expect(en.lines.join(' ')).toMatch(/Section G/)
    expect(zh.url).toBe('https://www.tal.gouv.qc.ca/en/electronic-lease')
  })
  it('every province outside Ontario has a card: its own form or "no mandatory form", an https link, no Ontario terms, no Chinese in English', () => {
    for (const c of NON_ON) {
      const zh = leaseFormGuidance(c, 'zh')!
      const en = leaseFormGuidance(c, 'en')!
      expect(zh, c).not.toBeNull()
      expect(zh.url, c).toMatch(/^https:\/\//)
      expect(zh.lines.length, c).toBeGreaterThan(0)
      for (const s of [zh.name, ...zh.lines, en.name, ...en.lines]) expect(s, `${c}: ${s.slice(0, 80)}`).not.toMatch(ONTARIO)
      for (const s of [en.name, ...en.lines]) expect(s, `${c}: ${s.slice(0, 80)}`).not.toMatch(HAN)
      if (!zh.mandatory) expect(zh.lines.join('') + zh.name, c).toMatch(/不强制|没有强制|没有政府规定|不要求特定|可以使用|「可以」使用|可选用/)
    }
    expect(leaseFormGuidance('ON', 'zh')).toBeNull()
  })
})

describe('/landlord/leases/new · a home outside Ontario gets the province card, not the Ontario form', () => {
  const page = read('app/landlord/leases/new/page.tsx')
  it('reads the listing province on every prefill path, before any form or redirect', () => {
    expect(page).toContain("listing:listings(address, unit, city, postal_code, province, monthly_rent, parking)")
    expect(page).toContain("const code = data?.listing ? listingProvince(data.listing) : 'ON'")
    // the province check comes before an Ontario draft is reopened
    expect(page.indexOf("const code = data?.listing ? listingProvince(data.listing) : 'ON'")).toBeLessThan(page.indexOf('router.replace(`/landlord/leases/new?edit=${draft.id}&reopened=1`)'))
    // edit (?edit=) and lease record (?from_lease=) paths check the province too
    expect(page).toContain('const code = await provinceForLease(data.listing_id ?? null, place)')
    expect(page).toContain('const code = await provinceForLease(src.listing_id ?? null, hh ?')
    expect(page.indexOf('const code = await provinceForLease(data.listing_id ?? null, place)')).toBeLessThan(page.indexOf('if (!leaseIsEditableDraft(data)) { setEditBlocked(data.id); return }'))
    expect(page).toContain("const { data } = await supabase.from('listings').select('address, city, postal_code, province').eq('id', listingId).maybeSingle()")
  })
  it('no form until the source is read; outside Ontario only the card renders', () => {
    expect(page).toContain('if (authLoading || !landlord || resolving) {')
    expect(page).toContain('void run().finally(() => { if (!cancelled) setResolvedKey(key) })')
    expect(page.match(/void run\(\)\.finally\(\(\) => \{ if \(!cancelled\) setResolvedKey\(key\) \}\)/g)?.length).toBe(3)
    const gate = between(page, '  if (outside) {', '\n  }\n')
    expect(gate).toContain('<ProvinceLeaseCard gate={outside} zh={zh} />')
    expect(page.indexOf('  if (outside) {')).toBeLessThan(page.indexOf("{formType === 'trreb' ? 'TRREB FORM 400' : 'ONTARIO STANDARD LEASE'}"))
  })
  it('the card: the province rules, the official link, the import path — nothing Ontario', () => {
    const card = between(page, 'function ProvinceLeaseCard(', '\nfunction NewLeasePageInner(')
    expect(card).toContain('leaseFormGuidance(gate.code, lang)')
    expect(card).toContain('{g.lines.map((line, i) => <li key={i}>{line}</li>)}')
    expect(card).toContain('<a href={g.url} target="_blank" rel="noopener noreferrer"')
    expect(card).toContain('<Link href="/leases/import"')
    expect(card).toContain('data-testid="lease-province-card"')
    // comments may say "Ontario"; the rendered strings must not
    const code = noComments(card)
    expect(code).not.toMatch(ONTARIO)
    // one language per UI language: each English string is all English
    for (const en of ["'Signing a lease in ${name}'", "'Official link ↗'", "'Import an existing lease →'", "'Once it is signed'"]) expect(code).toContain(en.slice(1, -1))
  })
  it('the Ontario path is unchanged', () => {
    expect(page).toContain(".eq('application_id', applicationParam)")
    expect(page).toContain('router.replace(`/landlord/leases/new?edit=${draft.id}&reopened=1`)')
    expect(page).toContain("(zh ? '起草安省标准租约' : 'Draft an Ontario Standard Lease')")
    expect(page).toContain('checkLeaseTerms({')
  })
  it('the Montréal listing resolves to Quebec; a Toronto one stays Ontario', () => {
    expect(listingProvince(MONTREAL)).toBe('QC')
    expect(listingProvince({ province: 'ON', address: '100 King St W', city: 'Toronto', postal_code: 'M5X 1A9' })).toBe('ON')
  })
})

describe('/landlord/applicants/[id] · decision copy follows the listing province', () => {
  const page = read('app/landlord/applicants/[id]/page.tsx')
  it('reads the province with the listing and keeps every Ontario string', () => {
    expect(page).toContain('listing:listings(address, unit, monthly_rent, city, postal_code, province)')
    expect(page).toContain("const code = listing ? listingProvince(listing) : 'ON'")
    // Ontario literals (also pinned by threeRoleFilm / siteTest specs)
    expect(page).toContain('`批准后我会给${applicantWhoSp}发录取通知（发到 TA 申请时填写的邮箱），并说明租约随后送达。信里固定带《消费者报告法》s.10(7) 与 OHRC 声明。`')
    expect(page).toContain("'评分与档位仅供参考 · 非拒绝依据（OHRC 租房政策）。完整报告含四项评分（付款能力、信用、租务与司法历史、核验）、取证、法庭与 LTB 检索。'")
    expect(page).toContain("{zh ? 'RTA 提示：' : 'RTA notice: '}")
    // the draft-lease link stays (its page shows the province card)
    expect(page).toContain('href={`/landlord/leases/new?application_id=${app.id}`}')
  })
  it('the non-Ontario branches name only that province’s law', () => {
    const helper = between(page, 'function provinceDecisionCopy(', '\nfunction RealApplicantDetail(')
    expect(helper).toContain('`${r.humanRights.law.zh}声明与${r.privacyLaw.zh}说明`')
    const summary = between(page, 'const summary = pc', "      : decision === 'approved'\n      ? `批准后我会给${applicantWhoSp}发录取通知（发到 TA 申请时填写的邮箱），并说明租约随后送达。信里固定带《消费者报告法》")
    const score = between(page, "{pc\n                ? (zh ? '评分与档位仅供参考", ": (zh ? '评分与档位仅供参考 · 非拒绝依据（OHRC")
    const redraft = between(page, '{pc\n                  ? (zh ? `这份申请已标为', ': zh ? `这份申请已标为')
    const rights = between(page, 'data-testid="decision-rights-province"', "{zh ? 'RTA 提示：' : 'RTA notice: '}")
    for (const [k, s] of Object.entries({ summary, score, redraft, rights })) {
      // the closing marker of `rights` is the Ontario branch itself — cut it off
      const body = k === 'rights' ? s.slice(0, s.lastIndexOf(') : (')) : s
      expect(body, k).not.toMatch(ONTARIO)
    }
    expect(score).toContain('取证与公开记录检索')
    expect(rights).toContain('pc.hr.zh.law')
    expect(rights).toContain('pc.hr.zh.examples')
  })
  it('Quebec: asking for more documents follows the CAI limits (only what assessing needs; job / pay / bank only volunteered)', () => {
    expect(page).toContain('{pc?.screeningLimits && (')
    expect(page).toContain("'需要补充什么（如：现任或前任房东的联系方式）'")
    const q = rulesFor('QC')!.quebec!.screeningLimits
    expect(q.zh).toMatch(/自愿提供/)
    expect(q.zh).toMatch(/社会保险号/)
    expect(q.en).not.toMatch(HAN)
  })
  it('what the notice "carries" for each province is that province’s law, in one language per UI', () => {
    for (const c of NON_ON) {
      const r = rulesFor(c)!
      const zh = `${r.humanRights.law.zh}声明与${r.privacyLaw.zh}说明`
      const en = `a statement under ${r.humanRights.law.en} and a note on ${r.privacyLaw.en}`
      expect(zh, c).not.toMatch(ONTARIO)
      expect(en, c).not.toMatch(ONTARIO)
      expect(en, c).not.toMatch(HAN)
      const hr = humanRights(c, 'en')!
      expect(hr.url, c).toMatch(/^https:\/\//)
      expect(`${hr.law} ${hr.examples}`, c).not.toMatch(HAN)
    }
  })
})

describe('send_decision executor · the footer and rule follow the listing province', () => {
  const route = read('app/api/agent/execute/route.ts')
  const fn = between(route, 'async function executeSendDecision(', '\n}\n')
  it('reads the province from the application’s listing and branches on it', () => {
    expect(fn).toContain("listing:listings(id, address, unit, landlord_id, city, postal_code, province)")
    expect(fn).toContain('const province = listingProvince(listing)')
    expect(fn).toContain("? `${decisionNoticeFooter('zh')}\\n\\n${decisionNoticeFooter('en')}`")
    expect(fn).toContain(": `${decisionNoticeFooterFor(province, 'zh')}\\n\\n${decisionNoticeFooterFor(province, 'en')}`")
    expect(fn).toContain("const noticeRule = inOntario ? 'CRA-10-7-notice' : `${province}-decision-notice`")
    expect(fn).toContain('rule_id: noticeRule')
    expect(fn).toContain('rule: noticeRule }')
    expect(fn).not.toContain("rule_id: 'CRA-10-7-notice'")
  })
  it('outside Ontario the acceptance email names no Ontario lease; Ontario keeps its line', () => {
    // (the branch's own condition line says inOntario — the body after it is what is sent)
    const outside = noComments(between(fn, "if (decision === 'approved' && !inOntario) {", "} else if (decision === 'approved') {")).replace(/^.*\n/, '')
    expect(outside).not.toMatch(ONTARIO)
    expect(outside).toContain('接下来房东会和你联系签订租约')
    expect(fn).toContain('The Ontario standard lease will follow to this address through Stayloop; watch for the signing link.')
  })
  it('the footer the Montréal applicant gets is Quebec’s; Ontario’s is the one it always was', () => {
    const p = listingProvince(MONTREAL)
    const zh = decisionNoticeFooterFor(p, 'zh')
    const en = decisionNoticeFooterFor(p, 'en')
    expect(zh).toContain('《魁北克人权与自由宪章》')
    expect(zh).toContain('《私营部门个人信息保护法》第 27 条')
    expect(en).toContain('Charter of human rights and freedoms')
    expect(zh).not.toMatch(ONTARIO)
    expect(en).not.toMatch(ONTARIO)
    expect(en).not.toMatch(HAN)
    expect(zh).not.toBe(decisionNoticeFooter('zh'))
    for (const l of ['zh', 'en'] as const) expect(decisionNoticeFooterFor('ON', l)).toBe(decisionNoticeFooter(l))
    for (const c of NON_ON) for (const l of ['zh', 'en'] as const) expect(decisionNoticeFooterFor(c, l), `${c} ${l}`).not.toMatch(ONTARIO)
  })
})
