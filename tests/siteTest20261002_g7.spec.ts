// Site test 2026-10-02 · L7-anon D-03: the landlord/agent reply check appended an
// OHRC "do not send this passage" warning to an educational answer that lists
// protected grounds only as things screening never considers. The rule is now
// per sentence: a protected ground AND a refusal verb in the same sentence, with
// the refusal not negated and not called unlawful.
import { describe, expect, it } from 'vitest'
import { applyGuardrail, hasDiscriminatoryRefusal } from '../lib/agent/guardrail'

const run = (role: 'landlord' | 'agent' | 'tenant', reply: string, lang: 'zh' | 'en' = 'en') =>
  applyGuardrail(role, { reply, memoryWrites: [], proposedAction: null, nextStage: null }, lang)

// The production reply to the /landlord page's own example question (body only).
const EDUCATIONAL_EN = `Tenant screening evaluates objective tenancy capacity and legal compliance, while strictly excluding protected grounds under the Ontario Human Rights Code (OHRC) and the Residential Tenancies Act (RTA).

What tenant screening looks at:
· Payment Capacity: Verifiable income via pay stubs, employment letters, and bank statements to assess rent affordability.
· Credit Reliability: Credit scores, debt obligations, collections history, and payment track records.
· Tenancy & Legal History: Previous landlord references, public Ontario Landlord and Tenant Board (LTB) orders, and civil court judgment records.

What tenant screening NEVER looks at (protected by law):
· OHRC Protected Grounds: Race, ethnic origin, nationality, religion, age, sexual orientation, gender identity, disability, or receipt of public assistance (such as ODSP or OW).
· Family Status: Marital status, pregnancy, or whether the applicant has children.
· Unlawful Restrictions: Blanket "no pet" rejections (under RTA s.14, no-pet clauses are legally void unless governed by condo declarations).
· Black-box or subjective impressions: Decisions must be grounded entirely in verifiable solvency, credit, and tenancy history.`

describe('D-03 · educational answers about protected grounds are not refusals', () => {
  it('the site example answer gets no OHRC warning (landlord and agent)', () => {
    for (const role of ['landlord', 'agent'] as const) {
      const r = run(role, EDUCATIONAL_EN)
      expect(r.flags).not.toContain('discriminatory_language_in_reply')
      expect(r.out.reply).toBe(EDUCATIONAL_EN)
    }
  })

  it('negated or unlawful-framed sentences are not refusals', () => {
    for (const s of [
      'Screening never rejects anyone because of family status.',
      'Family status cannot be a reason to reject an applicant.',
      'You must not decline an applicant because they have children.',
      'Rejecting someone for having children is illegal under the OHRC.',
      'Refusing an applicant because of their religion is against the Human Rights Code.',
      '按 OHRC，不能以家庭状况或宗教为由拒绝申请人。',
      '筛查不会因为申请人有孩子就拒绝。',
      '以家庭状况拒绝申请人属于违法行为。',
      // ground and refusal in different sentences
      '筛查从不看种族、宗教、家庭状况。如果申请人材料不全，可以拒绝。',
      'Screening never looks at race or family status.\nIf documents are incomplete, you may decline.',
    ]) {
      expect(hasDiscriminatoryRefusal(s), s).toBe(false)
    }
  })
})

describe('D-03 · drafted refusals on a protected ground are still caught', () => {
  it.each([
    '我建议拒绝，因为对方有小孩会吵。',
    '由于您有孩子且家庭状况不符合，我们决定拒绝您的申请。',
    '我们不会接受有孩子的家庭，所以拒绝您的申请。',
    '很抱歉，因为您有孩子，我们不能租给您，决定拒绝。',
    // 「区别」contains 别 — must not read as a negation
    '因为宗教信仰不同而区别对待并拒绝您的申请。',
    'We regret to decline your application because of your family status.',
    'We cannot accept your application and must decline it because you have children.',
    'Given your religion, we have decided to reject your application.',
    'We refuse to rent to you because you are pregnant.',
    // double negatives and affirmative idioms are refusals (review 2026-10-02)
    '因为您有孩子，我们不得不拒绝您的申请。',
    '考虑到您的宗教信仰，我们不能不婉拒。',
    'Because you have children, we have no choice but to decline your application.',
    'Given your religion, we have no other option but to reject this application.',
    'As you are pregnant, we cannot help but refuse.',
  ])('%s', (s) => {
    expect(hasDiscriminatoryRefusal(s)).toBe(true)
    const r = run('landlord', s)
    expect(r.flags).toContain('discriminatory_language_in_reply')
    expect(r.out.reply).toMatch(/Ontario Human Rights Code/)
  })

  it('a refusal sentence is caught even inside an otherwise educational reply', () => {
    const reply = `${EDUCATIONAL_EN}\n\nDraft: Dear applicant, we decline your application because you have children.`
    expect(run('agent', reply).flags).toContain('discriminatory_language_in_reply')
  })

  it('the tenant role is unaffected', () => {
    expect(run('tenant', 'We decline because you have children.').flags).not.toContain('discriminatory_language_in_reply')
  })
})
