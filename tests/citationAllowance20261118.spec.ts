// 2026-11-18 · the citation check was rewriting correct section numbers. It allowed only the numbers in
// that turn's retrieved passages (six of them), while the model's instructions carry fact packs with some
// forty-five section numbers it is explicitly told it may cite. Production, a tenant asking about deposits:
// 「（RTA s.105、s.106(10)）…在安省一律是违法的（RTA s.134）」 came out as 「（相关条文（具体条号以官方页面
// 为准）、s.106(10)）…（相关条文（具体条号以官方页面为准））」 — s.105 and s.134 are right, and both are in
// the tenant fact pack. Now a number counts as given when it is in the passages, in the instructions, or
// in what the user wrote or uploaded; one that is nowhere in what the model saw is still rewritten.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkCitations, citationAllowance, allowedSections } from '@/lib/kb/cite'
import { buildSystemPrompt } from '@/lib/agent/prompts'
import type { KbHit } from '@/lib/kb/search'

const read = (p: string) => readFileSync(p, 'utf8')
const hit = (o: Partial<KbHit>): KbHit => ({ title: 'Residential Tenancies Act, 2006', section_ref: null, heading_path: [], url: 'https://example.test/rta', consolidated_date: '2026-09-21', in_force: true, body: '', ...o } as KbHit)
const HITS = [hit({ section_ref: '106 (1/2)', body: 'A landlord may require a tenant to pay a rent deposit… see section 111.' }), hit({ title: 'LTB Interpretation Guideline 11', heading_path: ['Guideline 11'], body: 'Rent arrears.' })]
const DEPOSIT = '押金上限是一个月租金（RTA s.106(2) [K1]）。它只能抵最后一期租金，不能扣作损坏赔偿（RTA s.105、s.106(10) [K1]）。损坏押金、宠物押金在安省一律是违法的（RTA s.134）。'
const wf = { workflow_type: 'tenant', workflow_id: null, current_stage: 'intake', completed_steps: [], status: 'active' } as never

describe('what a reply may cite', () => {
  it('the passages alone do not cover the fact packs — that was the defect', () => {
    expect([...allowedSections(HITS)].sort()).toEqual(['106', '111'])
    const old = checkCitations(DEPOSIT, HITS, 'zh')
    expect(old.invented).toEqual(['s.105', 's.134'])
  })
  it('numbers in the instructions count: section forms, ranges, 第 N 条 — and 第 N 页 does not', () => {
    const a = citationAllowance(HITS, '押金规则见 RTA s.105–106；额外收费 s.134。进入须按 RTA s. 27。Section 12 of the lease. 第 3 条。见第 6 页、第 2 版。按解释指南 14 与 Interpretation Guideline 5。')
    for (const n of ['105', '106', '111', '134', '27', '12', '3']) expect(a.sections.has(n), n).toBe(true)
    for (const n of ['6', '2']) expect(a.sections.has(n), n).toBe(false)
    expect([...a.guidelines].sort()).toEqual(['11', '14', '5'])
  })
  it('the real tenant instructions carry the deposit sections, so the production answer now stands as written', () => {
    const instructions = buildSystemPrompt('tenant', '', [], wf, undefined, 'zh', null, null, { message: '安省租房押金一般交多少？第一个月还要交什么？' })
    const allow = citationAllowance(HITS, instructions)
    for (const n of ['105', '106', '134']) expect(allow.sections.has(n), n).toBe(true)
    const r = checkCitations(DEPOSIT, HITS, 'zh', allow)
    expect(r.invented).toEqual([])
    expect(r.reply).toBe(DEPOSIT)
  })
  it('a number that is nowhere in what the model saw is still rewritten', () => {
    const allow = citationAllowance(HITS, 'RTA s.105–106；s.134')
    const r = checkCitations('按 RTA s. 999，房东可以随时进入；另见解释指南 7。', HITS, 'zh', allow)
    expect(r.invented).toEqual(['s.999', 'guideline 7'])
    expect(r.reply).toBe('按 相关条文（具体条号以官方页面为准），房东可以随时进入；另见LTB 解释指南（编号以官方页面为准）。')
  })
  it('a section the user asked about by number is theirs to name, and so is a clause of an uploaded lease', () => {
    const allow = citationAllowance(HITS, '用户：RTA s.83 是什么意思？\n【附件：lease.pdf 的文字】Section 14 Pets: no pets allowed.')
    expect(checkCitations('RTA s.83 让 LTB 在驱逐申请里考虑是否给予宽限。你的租约 section 14 写了禁养。', HITS, 'zh', allow).invented).toEqual([])
  })
  it('no brackets inside brackets: inside a parenthesis or a list the short form is used', () => {
    const r = checkCitations('不能扣作赔偿（RTA s.999、s.106(10) [K1]），也不能多收（见 section 42，s.888）。', HITS, 'zh')
    expect(r.reply).toBe('不能扣作赔偿（相关条文、s.106(10) [K1]），也不能多收（见 相关条文（具体条号以官方页面为准），相关条文）。')
    expect(r.reply).not.toContain('（相关条文（')
    const en = checkCitations('It cannot be kept (s. 999, s. 106).', HITS, 'en')
    expect(en.reply).toBe('It cannot be kept (the relevant provision, s. 106).')
  })
  it('without passages nothing is checked, as before', () => {
    expect(checkCitations('RTA s. 999', [], 'zh')).toEqual({ reply: 'RTA s. 999', invented: [] })
  })
})

describe('wiring', () => {
  it('the turn builds the allowance once from the instructions and the user’s text, and both checks use it', () => {
    const r = read('app/api/agent/turn/route.ts')
    expect(r).toContain('const citeAllow: CitationAllowance | undefined = kbHits.length ? citationAllowance(kbHits, `${system}\\n${userSaid}`) : undefined')
    expect(r).toContain('checkCitations(t, kbHits, uiLang, citeAllow)')
    expect(r).toContain('const cc = checkCitations(out.reply, kbHits, uiLang, citeAllow)')
    // the instructions are complete by then: nothing is appended to them after the allowance is built
    const after = r.slice(r.indexOf('const citeAllow: CitationAllowance'))
    expect(after).not.toMatch(/\n\s*system \+=/)
  })
})
