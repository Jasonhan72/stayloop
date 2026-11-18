// 2026-11-17 · the void-clause rule (guardrail 2) fired on explanations. A tenant asking 「安省租房押金一般
// 交多少」 got a correct answer — 「安省法律明令禁止收取…损坏押金（Damage Deposit）」 — and then, underneath,
// 「注：安省 RTA 下「禁止养宠」「押金超过一个月」等条款无效,我不会写进租约。」 The deploy smoke test asks
// exactly that question, so every deployment also logged a compliance "hit" (8 of 8 production events).
// The rule is for a reply that DRAFTS such a term; one that says the term is void or unlawful is
// explaining the law: no note, no hit.
import { describe, expect, it } from 'vitest'
import { applyGuardrail } from '@/lib/agent/guardrail'

const turn = (reply: string, proposedAction: unknown = null) => ({ reply, memoryWrites: [], proposedAction, nextStage: null }) as never
const run = (role: 'tenant' | 'landlord' | 'agent', reply: string, lang: 'zh' | 'en' = 'zh') => applyGuardrail(role, turn(reply), lang)
const NOTE_ZH = '我不会写进租约'

const EXPLAINING = [
  // the smoke test's question, as the model answers it
  '3. 哪些费用房东绝对不能收？\n安省法律明令禁止收取以下费用：\n· 损坏押金（Damage Deposit）\n· 宠物押金（Pet Deposit）\n· 看房费、申请费',
  '租约里的「禁止养宠」条款在安省是无效的（RTA s.14）。',
  '房东不能收取超过一个月的押金；押金超过一个月的部分你可以要求退还。',
  '房东无权要求押金高于一个月租金。',
  '「不允许小孩」这类要求违反人权法。',
  '共管公寓的管理规约可以禁止养宠，租客须遵守大楼规则。',
  '不得养宠的条款即使写进租约也没有约束力。',
  'A "no pets" clause is void in Ontario.',
  'A landlord cannot charge a damage deposit in Ontario.',
  'Damage deposits are illegal here; only a last-month rent deposit is allowed.',
  "No children policies are against the Code, and a landlord can't require a damage deposit.",
]
const DRAFTING = [
  '附表 B：禁止养宠。',
  '附加条款：1. 禁止养宠；2. 不得转租；3. 每晚 10 点后保持安静。',
  '租客须支付损坏押金（damage deposit）500 元。',
  '押金条款：押金高于一个月租金，共两个月。',
  'Schedule B: no pets.',
  'Listing copy: bright 2-bed, no pets, no children, damage deposit $500.',
]

describe('explaining a void term is not drafting one', () => {
  it('no note and no compliance hit under an explanation — for any hat', () => {
    for (const role of ['tenant', 'landlord', 'agent'] as const) for (const s of EXPLAINING) {
      const r = run(role, s, /[一-鿿]/.test(s) ? 'zh' : 'en')
      expect(r.flags, `${role}: ${s}`).not.toContain('illegal_lease_term')
      expect(r.out.reply, `${role}: ${s}`).toBe(s)
    }
  })
  it('a drafted clause still gets the note and the hit', () => {
    for (const role of ['landlord', 'agent'] as const) for (const s of DRAFTING) {
      const zh = /[一-鿿]/.test(s)
      const r = run(role, s, zh ? 'zh' : 'en')
      expect(r.flags, `${role}: ${s}`).toContain('illegal_lease_term')
      expect(r.out.reply, `${role}: ${s}`).toContain(zh ? NOTE_ZH : "I won't write them into a lease")
    }
  })
  it('an ordinary prohibition in a draft (不得转租) does not pass for an explanation', () => {
    const r = run('landlord', '附加条款：禁止养宠；不得转租；不能在阳台烧烤。')
    expect(r.flags).toContain('illegal_lease_term')
  })
  it('another province still gets neither (its own rules decide)', () => {
    const r = applyGuardrail('landlord', turn('附表 B：禁止养宠。'), 'zh', 'QC')
    expect(r.flags).not.toContain('illegal_lease_term')
    expect(r.out.reply).toBe('附表 B：禁止养宠。')
  })
})

describe('cards', () => {
  const card = (summary: string) => ({ action_type: 'send_message', title: '给房东发消息', summary, recipient_label: '房东', data_scope: ['消息正文'], excluded_data: [], risk_level: 'low', metadata: { subject: 's', body: 'b' } })
  it('a tenant’s message card that mentions the clause is not a lease draft', () => {
    const r = applyGuardrail('tenant', turn('好的，卡片在下面。', card('问房东租约里禁止养宠那一条')), 'zh')
    expect(r.flags).not.toContain('illegal_lease_term')
    expect(r.out.reply).not.toContain(NOTE_ZH)
  })
  it('a landlord-side card carrying the term is still flagged', () => {
    const r = applyGuardrail('landlord', turn('好的。', card('在租约里加一条：禁止养宠')), 'zh')
    expect(r.flags).toContain('illegal_lease_term')
    expect(r.out.reply).toContain(NOTE_ZH)
  })
})
