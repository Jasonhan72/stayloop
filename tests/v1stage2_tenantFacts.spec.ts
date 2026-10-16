// V1.0 阶段 2 · 乙 #8 租客事实包 + 20 问答准（2026-10-16）。
// 六道此前完全靠模型的题（预开支票 / 室温 / 转租转让 / 合租与同住 / 骚扰 / 提前解约）必须命中
// 对应段；无关问题返回空；全部命中 ≤ 2,500 字；每段带法条号且不含筛查语汇；租客 system prompt
// 含注入点与「不要编条号」规则。
import { describe, expect, it } from 'vitest'
import { TENANT_FACTS, TENANT_FACTS_FOOTER, TENANT_FACTS_HEADING, TENANT_FACTS_MAX_CHARS, tenantFactKeys, tenantFactsFor } from '@/lib/agent/tenantFacts'
import { buildSystemPrompt, RENEWAL_INTENT_RE } from '@/lib/agent/prompts'
import { GUIDELINE_TEXT, N1_NOTICE_DAYS, N4_TERMINATION_DAYS } from '@/lib/ontario/rules'
import type { WorkflowState } from '@/lib/agent/types'

const wf: WorkflowState = { current_stage: 'tenancy', completed_steps: [], context: {} } as unknown as WorkflowState

describe('tenantFactsFor — the six questions that used to rely on the model alone', () => {
  const CASES: Array<[string, string, string]> = [
    ['房东能要求我预开 12 张支票吗？', 'cheques', 's.108'],
    ['暖气太冷了，房东开到 18 度，合法吗？', 'temperature', '21°C'],
    ['我想把房子转租给朋友半年，房东不同意怎么办', 'sublet', 's.95'],
    ['我和房东住在一起共用厨房，LTB 管吗？', 'roommates', 's.5(i)'],
    ['房东天天威胁我、乱拍我家，算骚扰吗', 'harassment', 's.23'],
    ['固定租约还有 8 个月，我想提前搬走可以吗', 'earlyEnd', 's.47.0.1'],
  ]
  it.each(CASES)('%s → %s', (msg, key, cite) => {
    expect(tenantFactKeys(msg)).toContain(key)
    const out = tenantFactsFor(msg)
    expect(out).toContain(cite)
    expect(out.startsWith(TENANT_FACTS_HEADING)).toBe(true)
    expect(out.endsWith(TENANT_FACTS_FOOTER)).toBe(true)
  })

  it('English phrasings hit the same sections', () => {
    expect(tenantFactKeys('Can my landlord require post-dated cheques?')).toContain('cheques')
    expect(tenantFactKeys('I share a kitchen with my landlord, does the RTA apply?')).toContain('roommates')
    expect(tenantFactKeys('how do I get out of my lease early')).toContain('earlyEnd')
    expect(tenantFactKeys('my landlord keeps harassing me')).toContain('harassment')
  })

  it('returns an empty string for questions the pack has nothing on', () => {
    expect(tenantFactsFor('帮我找两居室公寓，预算 $2,500，North York')).toBe('')
    expect(tenantFactsFor('这个小区通勤方便吗')).toBe('')
    expect(tenantFactsFor('please show me condos downtown')).toBe('')
    expect(tenantFactsFor('')).toBe('')
  })

  it('stays within the budget when every section is hit', () => {
    const everything = TENANT_FACTS.map((f) => f.title).join(' ')
      + ' 押金 支票 租约 涨租 维修 暖气 进来 宠物 转租 室友 骚扰 提前解约 搬走 N12 欠租 拒租'
    const keys = tenantFactKeys(everything)
    expect(keys).toEqual(TENANT_FACTS.map((f) => f.key))
    const out = tenantFactsFor(everything)
    expect(out.length).toBeLessThanOrEqual(TENANT_FACTS_MAX_CHARS)
    expect(TENANT_FACTS_MAX_CHARS).toBe(2500)
  })

  it('every section cites a statute / source and never talks like a screening report', () => {
    for (const f of TENANT_FACTS) {
      expect(f.text, f.key).toMatch(/s\.\d|O\. Reg\.|Chapter|手册/)
      expect(f.text, f.key).not.toMatch(/建议录取|分数|评分|录取/)
      expect(f.key.length).toBeGreaterThan(0)
    }
    expect(TENANT_FACTS_FOOTER).toContain('不是个案法律意见')
    expect(TENANT_FACTS_FOOTER).toContain('tribunalsontario.ca/ltb')
    expect(TENANT_FACTS_FOOTER).toMatch(/社区法律诊所/)
  })

  it('numbers come from lib/ontario/rules.ts, not literals', () => {
    const deposit = TENANT_FACTS.find((f) => f.key === 'deposit')!.text
    expect(deposit).toContain(GUIDELINE_TEXT.zh)
    const rent = TENANT_FACTS.find((f) => f.key === 'rentIncrease')!.text
    expect(rent).toContain(`${N1_NOTICE_DAYS} 天`)
    const arrears = TENANT_FACTS.find((f) => f.key === 'arrears')!.text
    expect(arrears).toContain(`${N4_TERMINATION_DAYS} 天`)
  })

  it('the unverified Toronto 26°C cooling figure is not in the pack', () => {
    expect(tenantFactsFor('空调 室温')).not.toContain('26')
  })

  it('leaseDocuments forces the lease-terms section; renewalLane skips the rent-increase pointer', () => {
    expect(tenantFactKeys('帮我看看这份文件', { leaseDocuments: true })).toContain('lease')
    expect(tenantFactsFor('帮我看看这份文件', { leaseDocuments: true })).toContain('s.14')
    const msg = '房东要涨租 5%'
    expect(RENEWAL_INTENT_RE.test(msg)).toBe(true)
    expect(tenantFactKeys(msg)).toContain('rentIncrease')
    expect(tenantFactKeys(msg, { renewalLane: true })).not.toContain('rentIncrease')
  })

  it('the lease-terms section mirrors what checkLeaseTerms can flag', () => {
    const lease = TENANT_FACTS.find((f) => f.key === 'lease')!.text
    for (const cite of ['s.106(2)', 's.14', 's.36.1', 's.134', 'O. Reg. 9/18', '结束日早于开始日']) expect(lease).toContain(cite)
  })
})

describe('tenant system prompt — injection point and citation discipline', () => {
  it('injects the facts pack for ANY tenant question, not only renewal intent', () => {
    const p = buildSystemPrompt('tenant', 'Momo', [], wf, undefined, 'zh', null, null, { message: '房东能要求我预开支票吗' })
    expect(p).toContain(TENANT_FACTS_HEADING)
    expect(p).toContain('s.108')
    expect(p).toContain('不要编条号')
    expect(p).toContain('建议到 LTB 页面核对')
    expect(p).toContain('不是个案法律意见')
  })
  it('keeps the citation rule even when nothing is hit, and never leaks it to other hats', () => {
    const t = buildSystemPrompt('tenant', 'Momo', [], wf, undefined, 'zh', null, null, { message: '帮我找两居室' })
    expect(t).toContain('不要编条号')
    expect(t).not.toContain(TENANT_FACTS_HEADING)
    const l = buildSystemPrompt('landlord', 'Atlas', [], wf, undefined, 'zh', null, null, { message: '房东能要求预开支票吗' })
    expect(l).not.toContain(TENANT_FACTS_HEADING)
    expect(l).not.toContain('法规引用纪律(租客)')
    const a = buildSystemPrompt('agent', 'Brief', [], wf, undefined, 'zh', null, null, { message: '转租' })
    expect(a).not.toContain(TENANT_FACTS_HEADING)
  })
  it('skips the rent-increase pointer when the renewal lane will inject the full RTA pack', () => {
    const p = buildSystemPrompt('tenant', 'Momo', [], wf, undefined, 'zh', null, null, { message: '房东要涨租，合理吗' })
    expect(p).not.toContain('- 涨租:提前至少')
  })
  it('forces the lease-terms section when a PDF came with the turn', () => {
    const p = buildSystemPrompt('tenant', 'Momo', [], wf, undefined, 'zh', null, null, { message: '帮我看看', leaseDocuments: true })
    expect(p).toContain('租约与无效条款')
    expect(p).toContain('【附件：')
  })
  it('callers without context still get a valid tenant prompt (backward compatible)', () => {
    const p = buildSystemPrompt('tenant', 'Momo', [], wf)
    expect(p).toContain('不要编条号')
    expect(p).not.toContain(TENANT_FACTS_HEADING)
  })
})
