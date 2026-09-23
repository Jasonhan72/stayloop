import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildCheckpointProposal,
  buildIntentAskProposal,
  buildRenewalProposal,
  marketFromRows,
  marketLineText,
  planRenewalActions,
  stageForDays,
  type RenewalLease,
} from '../lib/agent/renewalStages'

// EliseAI benchmark 2026-09-22 — user approved A–L except K. These guards pin
// the pieces that have logic (renewal touchpoints, showing-intent wiring) and
// the honesty rules on the marketing template (facts only, one real number).

const today = new Date('2026-09-22T00:00:00Z')
function lease(endDate: string, over: Partial<RenewalLease> = {}): RenewalLease {
  return { id: 'l1', tenant_name: 'Mia', tenant_email: 'mia@example.com', unit_label: 'Unit 1207', monthly_rent: 2800, end_date: endDate, ...over }
}
const plusDays = (n: number) => new Date(today.getTime() + n * 86_400_000).toISOString().slice(0, 10)

describe('renewal touchpoints 90 / 60 / 30 (item F)', () => {
  it('maps days-to-end onto stages and nothing outside the 120-day window', () => {
    expect(stageForDays(119)).toBe('90d')
    expect(stageForDays(60)).toBe('60d')
    expect(stageForDays(30)).toBe('30d')
    expect(stageForDays(121)).toBeNull()
    expect(stageForDays(-1)).toBeNull()
  })

  it('first touchpoint is always the A/B letter, with the TRREB line and stage=90d', () => {
    const market = marketFromRows([
      { period: '2026 Q1', bed_type: 1, avg_rent: 2300 },
      { period: '2026 Q2', bed_type: 1, avg_rent: 2350 },
      { period: '2026 Q2', bed_type: 2, avg_rent: 3010 },
    ])
    expect(market?.period).toBe('2026 Q2')
    expect(marketLineText(market)).toContain('2 房 $3,010')
    const out = planRenewalActions('u', [lease(plusDays(100))], [], today, market)
    expect(out).toHaveLength(1)
    expect(out[0].action_type).toBe('send_renewal_letter')
    expect(out[0].metadata.stage).toBe('90d')
    expect(out[0].summary).toContain('TRREB 2026 Q2')
    expect(out[0].summary).toContain('$2,859') // 2026 guideline 2.1% (was 2.5% before the 2026 figure was published)
  })

  it('a lease entering the window late still gets the letter first, and only one card per run', () => {
    const out = planRenewalActions('u', [lease(plusDays(25))], [], today)
    expect(out.map((o) => o.action_type)).toEqual(['send_renewal_letter'])
  })

  it('60d: checkpoint only when the letter was never approved; idempotent per stage', () => {
    const existingPending = [{ action_type: 'send_renewal_letter', status: 'pending', metadata: { lease_id: 'l1', stage: '90d' } }]
    const out = planRenewalActions('u', [lease(plusDays(55))], existingPending, today)
    expect(out.map((o) => o.action_type)).toEqual(['renewal_checkpoint'])
    expect(out[0].metadata.stage).toBe('60d')
    expect(out[0].summary).toContain('N1')
    const approved = [{ action_type: 'send_renewal_letter', status: 'approved', metadata: { lease_id: 'l1', stage: '90d' } }]
    expect(planRenewalActions('u', [lease(plusDays(55))], approved, today)).toHaveLength(0)
    const seen = [...existingPending, { action_type: 'renewal_checkpoint', status: 'pending', metadata: { lease_id: 'l1', stage: '60d' } }]
    expect(planRenewalActions('u', [lease(plusDays(55))], seen, today)).toHaveLength(0)
  })

  it('30d: intent-ask email when the letter was sent, otherwise a "call them" checkpoint', () => {
    const sent = [{ action_type: 'send_renewal_letter', status: 'approved', metadata: { lease_id: 'l1', stage: '90d' } }]
    const ask = planRenewalActions('u', [lease(plusDays(20))], sent, today)
    expect(ask[0].action_type).toBe('send_message')
    expect(ask[0].metadata.to_email).toBe('mia@example.com')
    expect(String(ask[0].metadata.body)).toContain('N9')
    const notSent = [{ action_type: 'send_renewal_letter', status: 'rejected', metadata: { lease_id: 'l1', stage: '90d' } }]
    const cp = planRenewalActions('u', [lease(plusDays(20))], notSent, today)
    expect(cp[0].action_type).toBe('renewal_checkpoint')
    expect(cp[0].metadata.stage).toBe('30d')
    // no tenant email → checkpoint even when the letter went out
    const noMail = planRenewalActions('u', [lease(plusDays(20), { tenant_email: null })], sent, today)
    expect(noMail[0].action_type).toBe('renewal_checkpoint')
  })

  it('legacy letters without a stage count as the 90d touchpoint', () => {
    const legacy = [{ action_type: 'send_renewal_letter', status: 'approved', metadata: { lease_id: 'l1' } }]
    const out = planRenewalActions('u', [lease(plusDays(100))], legacy, today)
    expect(out).toHaveLength(0)
  })

  it('builders never claim a send happened and keep OHRC-neutral wording', () => {
    const l = lease(plusDays(90))
    for (const p of [buildRenewalProposal('u', l, today), buildCheckpointProposal('u', l, today, '60d'), buildCheckpointProposal('u', l, today, '30d'), buildIntentAskProposal('u', l, today)]) {
      expect(p.requires_approval).toBe(true)
      expect(p.status).toBe('pending')
      expect(p.summary).not.toMatch(/已发送|has been sent/)
    }
  })
})

describe('proactive + execute wiring', () => {
  const proactive = readFileSync('app/api/agent/proactive/route.ts', 'utf8')
  const execute = readFileSync('app/api/agent/execute/route.ts', 'utf8')
  it('both proactive paths plan through lib/agent/renewalStages', () => {
    expect(proactive).toMatch(/planRenewalActions\(/g)
    expect(proactive.match(/planRenewalActions\(/g)!.length).toBeGreaterThanOrEqual(2)
    expect(proactive).not.toMatch(/function buildRenewalProposal/)
  })
  it('execute has executors for the new action types and rate-limits the mail ones', () => {
    expect(execute).toMatch(/case 'renewal_checkpoint':/)
    expect(execute).toMatch(/case 'showing_request':/)
    expect(execute).toMatch(/case 'listing_inquiry':/)
    expect(execute).toMatch(/!preview && \['send_renewal_letter', 'send_message', 'rent_reminder', 'showing_request', 'listing_inquiry', 'send_lease', 'send_decision', 'maintenance_request'\]/)
    // recipient comes from the tenants row, never from caller-written metadata
    expect(execute).toMatch(/from\('tenants'\)\.select\('email, full_name'\)/)
    expect(execute).not.toMatch(/m\.tenant_email\s*\)\s*\)\s*\n\s*const \{ html, text \} = renderAgentMessageEmail\(\{ subject, body \}\)/)
  })
})

describe('showing intent route + listing page (items G/H)', () => {
  const route = readFileSync('app/api/showing-intent/route.ts', 'utf8')
  const listing = readFileSync('app/listings/[slug]/page.tsx', 'utf8')
  const modal = readFileSync('components/ShowingRequestModal.tsx', 'utf8')
  it('requires a signed-in user, writes the intent under the caller RLS client and rate-limits', () => {
    expect(route).toMatch(/sign_in_required/)
    expect(route).toMatch(/sb\.rpc\('claim_tenant'\)/)
    expect(route).toMatch(/sb\.from\('showing_intents'\)\.insert/)
    expect(route).toMatch(/underHourlyLimit\(`intent:\$\{user\.id\}`, 10, false\)/)
    expect(route).toMatch(/own_listing/)
  })
  it('one open card per (tenant, listing): merges instead of stacking', () => {
    expect(route).toMatch(/\.contains\('metadata', \{ listing_id: listingId, tenant_auth_id: user\.id \}\)/)
    expect(route).toMatch(/merged: true/)
  })
  it('listing page offers the modal only for Stayloop-landlord listings; Realtor imports keep the agent picker', () => {
    expect(listing).toMatch(/listing\.source !== 'realtor' \? \(\s*<button\s+onClick=\{\(\) => setIntentKind\('showing'\)\}/)
    expect(listing).toMatch(/setIntentKind\('question'\)/)
    expect(listing).toMatch(/<ShowingRequestModal/)
    expect(modal).toMatch(/OHRC/)
    expect(modal).toMatch(/fetch\('\/api\/showing-intent'/)
  })
})

describe('role landing template (items A B C D I J)', () => {
  const tpl = readFileSync('components/RoleLanding.tsx', 'utf8')
  const pages = ['app/landlord/page.tsx', 'app/tenant/page.tsx', 'app/agent/page.tsx'].map((p) => [p, readFileSync(p, 'utf8')] as const)
  it('template: chips, three benefit cards with try-it deep links, one number from /api/public/stats, FAQ + JSON-LD', () => {
    expect(tpl).toMatch(/cfg\.chips\.map/)
    expect(tpl).toMatch(/href=\{`\/\?role=\$\{cfg\.role\}&ask=\$\{encodeURIComponent\(b\.ask\[lang\]\)\}`\}/)
    expect(tpl).toMatch(/fetch\('\/api\/public\/stats'\)/)
    expect(tpl).toMatch(/'@type': 'FAQPage'/)
    expect(tpl).not.toMatch(/cfg\.stats/)
    // type scale: large, light headline
    expect(tpl).toMatch(/text-\[clamp\(28px,3.4vw,42px\)\] font-semibold/)
  })
  it('each role page: 5 chips, 3 benefits, 6–8 FAQs, and a stats key that exists', () => {
    for (const [p, s] of pages) {
      expect(s, p).toMatch(/proof: \{\s*key: '(screenings|ltbOrders|listings|trrebQuarters)'/)
      expect((s.match(/\n    \{ label: \{ zh: /g) || []).length, `${p} chips`).toBe(5)
      expect((s.match(/\n      ask: \{ zh: /g) || []).length, `${p} benefits`).toBe(3)
      const faqs = (s.match(/\n    \{ q: \{ zh: /g) || []).length
      expect(faqs, `${p} faq`).toBeGreaterThanOrEqual(6)
      expect(faqs, `${p} faq`).toBeLessThanOrEqual(8)
      // no invented proof: no percentages, ratings or customer counts in chips/proof
      const chipsAndProof = s.slice(s.indexOf('chips: ['), s.indexOf('faq: ['))
      expect(chipsAndProof, p).not.toMatch(/\d+%|★|SOC ?2|\d+ 家客户|customers/)
    }
  })
})

describe('partners → data sources (item L)', () => {
  const s = readFileSync('app/partners/page.tsx', 'utf8')
  it('lists sources with a real status and no partnership claims', () => {
    for (const name of ['Ontario LTB order catalogue', 'TRREB Rental Market Report', 'Veriff', 'Flinks', 'Equifax Canada', 'Alibaba DashScope'])
      expect(s).toContain(name)
    expect(s).toMatch(/status: 'sandbox'/)
    expect(s).toMatch(/status: 'preparing'/)
    expect(s).not.toMatch(/RBC|Aviva|成为合作伙伴|Become a partner/)
  })
})
