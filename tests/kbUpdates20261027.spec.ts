// Knowledge base · update mechanism (design/rag-knowledge-base-plan-2026-10-27.md §7.3, 2026-10-27). Rules this file keeps:
//   • a new version of a source → section diff → the rules that cite those sections → a pending change row
//   • while pending: the assistant prompt and /rules carry「待核对」for those rules; review clears it
//   • the rules table is never edited by a machine; a rule may carry effective_from / effective_to
//   • the queue is admin-read / admin-review only; the public notice RPC exposes rule ids and dates only
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { baseSection, parseStatute, rulesAffectedBy } from '@/lib/kb/ruleMap'
import { diffSections, sectionNumbers } from '@/lib/kb/diff'
import { noticePromptBlock } from '@/lib/kb/notices'
import { kbQueryText } from '@/lib/kb/trigger'
import { activeRules, checkLeaseTerms, checkListingCompliance, ONTARIO_RULES, ruleInForce, type Rule } from '@/lib/ontario/rules'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('statute → source → rules', () => {
  it('parses the statute strings the rules table actually uses', () => {
    expect(parseStatute('RTA s.106(2)')).toEqual({ sourceKeys: ['on-rta-2006'], section: '106' })
    expect(parseStatute('O. Reg. 516/06 s.17(1)')).toEqual({ sourceKeys: ['on-reg-516-06'], section: '17' })
    expect(parseStatute('O. Reg. 9/18')).toEqual({ sourceKeys: ['on-reg-9-18'], section: null })
    expect(parseStatute('RTA s.59(1) · Bill 60 · N4 (2026/09)')!.section).toBe('59')
    expect(parseStatute('RTA s.6.1')!.section).toBe('6.1')
    expect(parseStatute('Consumer Reporting Act s.8')).toBeNull()
    expect(baseSection('126 (2/5)')).toBe('126')
    // every rule's statute either maps to a source or is a statute we have not ingested (never a parse crash)
    for (const r of ONTARIO_RULES) expect(() => parseStatute(r.statute)).not.toThrow()
  })
  it('a change in s.106 touches the deposit rules and nothing else; a whole-regulation change touches every rule citing it', () => {
    const ids = rulesAffectedBy('on-rta-2006', ['106'])
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(ONTARIO_RULES.find((r) => r.id === id)!.statute).toMatch(/RTA s\.106/)
    expect(rulesAffectedBy('on-rta-2006', ['999'])).toEqual([])
    const reg = rulesAffectedBy('on-reg-9-18', [])
    expect(reg.length).toBeGreaterThan(0)
    for (const id of reg) expect(ONTARIO_RULES.find((r) => r.id === id)!.statute).toMatch(/O\. Reg\. 9\/18/)
    expect(rulesAffectedBy('ltb-ig-14', ['x'])).toEqual([])
  })
})

describe('section diff', () => {
  const c = (ref: string | null, text: string, ord = 0, path: string[] = []) => ({ section_ref: ref, heading_path: path, ord, text })
  it('names added, removed and changed sections; split parts of one section count as one', () => {
    const d = diffSections(
      [c('116', 'old text', 0), c('126 (1/2)', 'a', 1), c('126 (2/2)', 'b', 2), c('130', 'gone', 3)],
      [c('116', 'new  text', 0), c('126 (1/2)', 'a', 1), c('126 (2/2)', 'b', 2), c('131', 'new section', 3)],
    )
    expect(d).toEqual({ added: ['s.131'], removed: ['s.130'], changed: ['s.116'] })
    expect(sectionNumbers(d.changed)).toEqual(['116'])
    expect(diffSections([c(null, 'x', 0, ['Guide', 'Rent'])], [c(null, 'y', 0, ['Guide', 'Rent'])]).changed).toEqual(['Guide › Rent'])
  })
})

describe('pending notices', () => {
  it('the prompt block names the rule, the statute, the date and the official link; nothing when empty', () => {
    const r = ONTARIO_RULES.find((x) => x.statute.startsWith('RTA s.106'))!
    const block = noticePromptBlock([{ rule_id: r.id, source_key: 'on-rta-2006', source_title: 'RTA', new_date: '2026-11-01', detected_at: '2026-11-03T00:00:00Z' }], 'zh')
    expect(block).toContain('【规则待核对】')
    expect(block).toContain(r.title.zh)
    expect(block).toContain('2026-11-01')
    expect(block).toContain('https://www.ontario.ca/laws/statute/06r17')
    expect(noticePromptBlock([], 'zh')).toBe('')
    expect(noticePromptBlock([{ rule_id: 'nope', source_key: 'x', source_title: 'x', new_date: null, detected_at: '2026-11-03T00:00:00Z' }], 'en')).toBe('')
  })
  it('the turn route appends them on every law question; /rules shows the badge; the admin page reviews them', () => {
    const t = code('app/api/agent/turn/route.ts')
    expect(t).toContain('system += noticePromptBlock(await loadPendingNotices(), uiLang)')
    expect(t.indexOf('system += noticePromptBlock')).toBeLessThan(t.indexOf('const callTurn = (m: CatalogModel) => llmChat({'))
    const rules = code('app/rules/page.tsx')
    expect(rules).toContain("fetch('/api/kb/notices')")
    expect(rules).toContain('data-testid="rule-pending-notice"')
    const page = code('app/admin/knowledge/page.tsx')
    expect(page).toContain("fetch('/api/admin/knowledge'")
    for (const st of ['reviewed', 'no_impact', 'rule_updated']) expect(page).toContain(`'${st}'`)
    expect(page).not.toMatch(/window\.confirm|alert\(/)
    const api = code('app/api/admin/knowledge/route.ts')
    expect(api).toContain("sb.rpc('is_stayloop_admin')")
    expect(api.match(/^export (async )?function (GET|PATCH)\b/gm)?.length).toBe(2)
    expect(api).not.toMatch(/^export (const|function|async function) (?!GET|PATCH)/m)
    expect(code('app/admin/page.tsx')).toContain("href: '/admin/knowledge'")
  })
})

describe('rules with effective dates', () => {
  const base = ONTARIO_RULES[0]
  it('a rule is in force between its dates; the table has no dated rule today so nothing changes', () => {
    expect(ruleInForce({}, '2026-10-27')).toBe(true)
    expect(ruleInForce({ effective_from: '2027-01-01' }, '2026-12-31')).toBe(false)
    expect(ruleInForce({ effective_from: '2027-01-01' }, '2027-01-01')).toBe(true)
    expect(ruleInForce({ effective_to: '2027-01-01' }, '2027-01-01')).toBe(false)
    expect(activeRules('2026-10-27').length).toBe(ONTARIO_RULES.length)
    expect(ONTARIO_RULES.every((r) => !r.effective_from && !r.effective_to)).toBe(true)
    void base
  })
  it('both compliance checks drop findings whose rule is not in force on asOf', () => {
    const listing = { monthly_rent: 2000, deposit: 4000, pets_allowed: 'no' }
    const today = checkListingCompliance(listing)
    expect(today.findings.map((f) => f.rule)).toEqual(expect.arrayContaining(['RTA-106-deposit-cap', 'RTA-14-no-pet-clause']))
    expect(checkListingCompliance(listing, '2026-10-27').findings.length).toBe(today.findings.length)
    const lease = checkLeaseTerms({ rent_amount: 2000, deposit_amount: 4000 }, '2026-10-27')
    expect(lease.findings.map((f) => f.rule)).toContain('RTA-106-deposit-cap')
    expect(code('lib/ontario/rules.ts').match(/inForceFindings\(f, asOf\)/g)?.length).toBe(2)
  })
})

describe('ingest, queue and schema', () => {
  it('a superseded version produces a diff, a queue row and a reviewer email; nothing is deleted', () => {
    const s = code('scripts/kb/ingest.ts')
    expect(s).toContain("from('knowledge_changes').insert({")
    expect(s).toContain('rulesAffectedBy(src.key, sectionNumbers([...d.added, ...d.removed, ...d.changed]))')
    expect(s).toContain('notifyReviewers(src, d, affected, f.consolidatedDate)')
    expect(s).toContain('KB_REVIEW_EMAIL')
    expect(s).not.toMatch(/\.delete\(/)
    const sql = read('supabase/migrations/20261027_knowledge_changes.sql')
    expect(sql).toContain("status            text not null default 'pending' check (status in ('pending','reviewed','no_impact','rule_updated'))")
    expect(sql).toContain('revoke all on public.knowledge_changes from public, anon, authenticated')
    expect(sql).toContain('grant update (status, note, reviewed_by, reviewed_at) on public.knowledge_changes to authenticated')
    expect(sql).toContain('for update to authenticated using (public.is_stayloop_admin()) with check (public.is_stayloop_admin())')
    expect(sql).not.toMatch(/for insert/)
    expect(sql).toContain('grant execute on function public.kb_pending_rule_notices() to anon, authenticated, service_role')
    expect(sql).toContain('revoke execute on function public.kb_source_status() from public, anon')
    const wf = read('.github/workflows/kb-refresh.yml')
    expect(wf).toContain('scripts/kb/eval.ts')
    expect(wf).not.toMatch(/^\s*pull_request(_target)?:/m)
  })
  it('a late-fee question searches charges, not arrears (eval 2026-10-27)', () => {
    const q = kbQueryText('迟交房租房东能收滞纳金吗？')
    expect(q).toContain('late payment charge')
    expect(q).not.toContain('arrears')
  })
})
