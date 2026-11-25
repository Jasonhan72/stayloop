// 2026-11-25 — the assistant stops talking about 「护照盖章」 (用户「改掉」).
//
// The prompt taught a four-stamp ladder (身份章 / 收入章 / 银行章 / 信用+法庭章, trust_tier 1-4 = 已盖前 N 枚)
// and the assistant told people to 「完成护照盖章」. Nobody can earn a stamp today: a tenant cannot start a
// verification, the shared passport page claims no stamp, `tenants.tier` is a column default of 1, and no
// listing sets a threshold. What exists is the application pack (self-declared) and a verification link a
// landlord sends from a screening. The site's copy stopped saying 「四枚章」 on 2026-09-28; this pins the prompt.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSystemPrompt, PASSPORT_AND_VERIFICATION, VERIFICATION_LINK_WHERE } from '../lib/agent/prompts'
import { WORKFLOW_STAGES } from '../lib/agent/orchestrator'
import { PATH_RE } from '../lib/agent/replyPaths'

const read = (p: string) => readFileSync(p, 'utf8')
const wf = { workflow_type: 'x', workflow_id: null, current_stage: 'intake', completed_steps: [], status: 'active' } as never
const ROLES = ['tenant', 'landlord', 'agent'] as const
const prompt = (role: (typeof ROLES)[number]) => buildSystemPrompt(role, '', [], wf)
const STAMP_WORDS = /盖章|枚章|身份章|收入章|银行章|法庭章|Passport Stamps|trust_tier|Tier N/

describe('the assistant and 「护照盖章」', () => {
  it('every role’s prompt says what exists today: the pack is self-declared, verification comes from a landlord’s link', () => {
    for (const role of ROLES) {
      const p = prompt(role)
      expect(p, role).toContain('# 租客护照与核验(按现在的产品说)')
      expect(p, role).toContain('「租客护照」就是申请包(/tenant/passport)')
      expect(p, role).toContain('不等于已经核验')
      expect(p, role).toContain('核验只在一处发生:房东或持牌经纪在筛查里给申请人发一条核验链接')
      expect(p, role).toContain('每一项都可以跳过')
      // which providers are switched on is the deployment's business: the model does not promise a step
      expect(p, role).toContain('现在开通了哪几项你不知道,以核验页上显示的为准,不要替它保证')
      expect(p, role).toContain('租客现在【不能】自己发起核验,也【没有】「盖章」这一步可做')
      expect(p, role).toContain('申请任何一套房都不以核验为前提')
    }
  })

  it('the four-stamp ladder is no longer taught: outside the lines that say what NOT to say, no stamp word is left', () => {
    for (const role of ROLES) {
      const p = prompt(role)
      for (const gone of ['# 术语:护照盖章', '已盖前 N 枚', '对用户只说"章"', '盖章门槛', '解释护照盖章', '银行章永远有', '盖上银行章']) expect(p, `${role}: ${gone}`).not.toContain(gone)
      expect(p.split(PASSPORT_AND_VERIFICATION).length, role).toBe(2)
      expect(p.replace(PASSPORT_AND_VERIFICATION, ''), role).not.toMatch(STAMP_WORDS)
    }
    // the section names the words only to rule them out, and tells the assistant what to say when asked about them
    for (const line of PASSPORT_AND_VERIFICATION.split('\n').filter((l) => STAMP_WORDS.test(l))) expect(line, line).toMatch(/不要|【没有】|如实说/)
    expect(PASSPORT_AND_VERIFICATION).toContain('现在没有可以自己去盖的章')
  })

  it('the tenant’s rule 6 keeps its protections, now said about the verification link', () => {
    const t = prompt('tenant')
    expect(t).toContain('6. 核验(房东在筛查里发来核验链接时):每一步都由他本人决定做不做')
    expect(t).toContain('同时给等大的"这一步不做"选项')
    expect(t).toContain('银行那一步永远有 PDF 流水这个替代办法,两者完全等价')
    expect(t).toContain('不是 paywall')
    expect(t).toContain('核验不限制任何房源，不要说做了核验能解锁房源或加快审批')
    for (const role of ['landlord', 'agent'] as const) expect(prompt(role), role).not.toContain('6. 核验(')
  })

  it('what each assistant says it can do names things that exist', () => {
    expect(prompt('tenant')).toContain('讲清申请包(租客护照)怎么准备、房东发来核验链接时每一步是什么(每一步都可以不做)')
    // there is no threshold to set on a listing (the new-listing step says so), so the landlord's assistant does not advise one
    expect(prompt('landlord')).toContain('讲清筛查里可以请申请人本人授权核验什么(由申请人逐项决定做不做)')
  })

  it('asked for real, two answers went wrong — each has its line now', () => {
    // a landlord asked whether he may require verification before an application: the product's practice came back as a legal ban
    for (const role of ROLES) {
      expect(prompt(role), role).toContain('这是 Stayloop 的做法:没做核验,申请照样交得上')
      expect(prompt(role), role).toContain('【不要】由此引申出「法律不允许要求核验」「没做核验不能作为拒绝理由」这类法律结论')
    }
    // …and was sent to /landlord/applicants to send the link, which only the screening's report can make
    for (const role of ['landlord', 'agent'] as const) expect(prompt(role), role).toContain(VERIFICATION_LINK_WHERE)
    expect(prompt('tenant')).not.toContain('核验链接在哪里发')
    expect(VERIFICATION_LINK_WHERE).toContain('筛查页 /screening/app 上那份筛查的报告里「申请人本人核验」一栏生成(需要 Pro,或这份筛查已单次解锁)')
    expect(read('app/api/verify/create/route.ts')).toContain("code: 'locked'")
    expect(read('app/screening/app/page.tsx')).toContain("fetch('/api/verify/create'")
    // an anonymous landlord asking for the pack card is told it is the tenant's conversation that has it
    expect(read('app/api/agent/turn/route.ts')).toContain('申请包卡只在【租客身份】的对话里出现:当前是房东或经纪身份时,要说「登录后在租客身份的对话里说」')
  })

  it('nothing else hands the model a stamp: the preview’s addendum, the account line, the stage labels', () => {
    const route = read('app/api/agent/turn/route.ts')
    expect(route).not.toContain('盖护照章')
    expect(route).toContain('当用户想提交申请、准备申请包、发布房源')
    // `tenants.tier` is a column default (1) on every row; it reached the model as 「租客护照认证 1 级」
    const ctx = read('lib/agent/userContext.ts')
    expect(ctx).not.toMatch(/护照认证 \$\{|t\.tier/)
    expect(ctx).toContain("lines.push(`- 账号: ${[t.full_name, t.email].filter(Boolean).join(' · ')}`)")
    expect(ctx).toContain("sb.from('tenants').select('id,full_name,email').eq('auth_id', uid)")
    // the stage label is sent with every turn (「阶段:」) and shown on the progress page
    for (const s of WORKFLOW_STAGES.tenant) for (const label of [s.label.zh, s.label.en]) expect(label, label).not.toMatch(/章|stamp|Passport|身份验证/i)
    expect(WORKFLOW_STAGES.tenant.map((s) => s.key)).toEqual(['intake', 'preference_collection', 'passport_readiness', 'shortlist_and_apply', 'application_review', 'sign_and_move_in'])
  })

  it('the page the section points to becomes a link in the reply', () => {
    expect(new RegExp(PATH_RE.source).test('/tenant/passport')).toBe(true)
  })
})
