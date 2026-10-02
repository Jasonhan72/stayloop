// 2026-09-28 · 「验证一次，处处通行」不再出现在任何地方。
//
// The tenant pages promised that a tenant verifies once and the result travels
// to every landlord ("verify once, go anywhere"). Nothing does that: the four
// passport stamps on /tenant/passport are sample data, verification only
// happens when a landlord sends a /verify link for one screening, and the one
// real thing a tenant can carry is the read-only share link /p/<token> —
// initials plus an on-time rent record taken only from leases both sides
// confirmed. The pages now say exactly that.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(p, 'utf8')

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe('no "verify once, go anywhere" promise', () => {
  it('the phrase is gone from every page, component and library', () => {
    const bad = /验证一次|验一次|一次验证|处处通行|全城通用|[Vv]erify once|reuse (them )?everywhere|go anywhere|travel everywhere/
    const hits = ['app', 'components', 'lib'].flatMap((d) => sources(d)).filter((p) => bad.test(read(p)))
    expect(hits).toEqual([])
  })

  it('the tenant role page promises only what ships', () => {
    const s = read('app/tenant/page.tsx')
    for (const gone of ['Score 60', '即出 Stayloop Score', 'Stayloop Score', '2 小时响应', 'answered in 2 hours', '替她谈判', 'negotiates for her', '缴租', '四枚章', 'Four stamps', '直接复用', 'Passport directly'])
      expect(s, gone).not.toContain(gone)
    // what the share link really shows
    expect(s).toMatch(/没有金额/)
    expect(s).toMatch(/no amounts/)
    expect(s).toMatch(/双方都确认过的在管租约/)
  })

  it('the share page still counts only confirmed leases (the copy depends on it)', () => {
    const p = read('app/p/[token]/page.tsx')
    expect(p).toMatch(/\.from\('households'\)[\s\S]{0,80}\.eq\('verified', true\)/)
    expect(p).toMatch(/l\.status === 'signed_both' && !!l\.signed_at && !!l\.landlord_signature && !!l\.tenant_signature/)
    // statuses only: never amounts on the public card
    expect(p).toMatch(/\.select\('due_date,status'\)/)
  })

  it('the passport page, /about and the old welcome page say the same thing', () => {
    expect(read('app/tenant/passport/page.tsx')).toMatch(/姓名缩写和按时付租记录，只取自双方都确认过的租约/)
    const about = read('app/about/page.tsx')
    expect(about).toMatch(/在双方都确认过的租约里按时付租,记录就能带走/)
    // Stayloop never moves money, so "paying" is not one of the confirmed steps
    expect(about).not.toMatch(/签约、付款|signing and paying/)
    expect(read('app/onboarding/welcome/page.tsx')).not.toMatch(/每天为你筛新房|daily/)
  })
})

// Same day, second pass (用户：「这两处也一起改掉」): the pricing page promised
// tenants "all four stamps free to earn", and the agent client page's sample
// block said screening yields a "6-dimension report", a report link goes
// straight to the landlord (sharing is not live) and the client's passport
// "travels with the application". Screening scores four dimensions. Since 2026-09-29 a
// RECO-registered agent screens directly; a delegation the landlord confirms only
// files the screening under the client as well (card corrected 2026-10-01).
describe('pricing and the agent screening card say what ships', () => {
  it('pricing no longer offers stamps to earn', () => {
    const s = read('app/pricing/page.tsx')
    for (const gone of ['四枚章', 'four stamps', '全部免费盖', 'free to earn']) expect(s, gone).not.toContain(gone)
    expect(s).toMatch(/筛查与核验不向你收一分钱 · RTA s\.134/)
    expect(s).toMatch(/房东的筛查与核验费用也不能转给你（安省 RTA s\.134）/)
  })

  it('the agent client page describes screening (direct for registered agents; a delegation adds the client’s copy)', () => {
    const s = read('app/agent/clients/page.tsx')
    for (const gone of ['6 维', '6-dimension', '四枚章', 'four stamps', 'travels with the application', '直接转发房东', 'auto-CRM', '自动 CRM', '补齐', '盖上收入章'])
      expect(s, gone).not.toContain(gone)
    // 2026-10-01: since 2026-09-29 a RECO-registered agent screens directly; the delegation only adds the client's copy
    expect(s).toMatch(/替房东客户筛查/)
    expect(s).not.toMatch(/先有委托|starts with a delegation/)
    expect(s).toMatch(/RECO 注册核验有效就能直接筛查/)
    expect(s).toMatch(/发起委托/)
    expect(s).toMatch(/付款能力、信用、租务与司法历史、核验四项打分/)
    expect(s).toMatch(/href="#client-book"/)
    // the anchor the card points at
    expect(read('components/agent/ClientBook.tsx')).toMatch(/data-testid="client-book" id="client-book"/)
    // the assistant's reply mentions /agent/clients — it must render as a link
    expect(read('components/agent/AgentChat.tsx')).toMatch(/const PATH_RE = \/\([^\n]*\\\/agent\\\/clients/)
  })

  it('no assistant prompt claims six scoring dimensions', () => {
    expect(read('lib/agent/prompts.ts')).not.toMatch(/六个维度|six dimensions/)
  })
})
