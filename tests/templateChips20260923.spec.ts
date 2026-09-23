import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { hasUnfilledTemplate } from '../lib/agent/guardrail'

// Quick-action chips and workspace deep links used to SEND their example
// sentence verbatim ("厨房水槽漏水…") and the assistant treated it as the
// user's real problem (user report 2026-09-23). Now: templates prefill the
// composer with 【…】 placeholders, deep links prefill by default, and the
// server never proposes an action from an unfilled template.
describe('quick-action templates are edited by the user, not sent as facts', () => {
  it('hasUnfilledTemplate detects placeholders', () => {
    expect(hasUnfilledTemplate('我要报修：【哪里】【什么问题】')).toBe(true)
    expect(hasUnfilledTemplate('我要报修：厨房水槽漏水，昨天开始，不紧急')).toBe(false)
  })
  it('tenant chips with specifics carry a template and live sessions prefill instead of sending', () => {
    const src = readFileSync('components/agent/AgentChat.tsx', 'utf8')
    expect(src).toMatch(/label: \{ zh: '发起报修'[^\n]*template: \{ zh: '我要报修：【/)
    expect(src).toMatch(/label: \{ zh: '帮我找房'[^\n]*template: \{ zh: '帮我找【区域】/)
    expect(src).toMatch(/if \(live && s\.template\) setChipDraft\(/)
  })
  it('deep links prefill by default; only real-row links opt into send=1; no fabricated names in demo links', () => {
    const hook = readFileSync('lib/agent/usePromptDeepLink.ts', 'utf8')
    expect(hook).toMatch(/params\.get\('send'\) === '1'/)
    expect(hook).toMatch(/if \(wantsSend \|\| !prefill\) void sendMessage\(text\)\s*else prefill\(text\)/)
    for (const f of ['app/tenant/agent/page.tsx', 'app/landlord/agent/page.tsx', 'app/agent/agent/page.tsx']) {
      expect(readFileSync(f, 'utf8'), f).toMatch(/usePromptDeepLink\(loading, sendMessage, prefill\)/)
    }
    for (const f of ['app/tenant/payments/page.tsx', 'app/tenant/move-in/page.tsx', 'app/landlord/applicants/[id]/page.tsx', 'app/landlord/leases/page.tsx', 'app/disputes/page.tsx', 'app/tenant/applications/page.tsx']) {
      const links = readFileSync(f, 'utf8').match(/prompt=\$\{encodeURIComponent\([\s\S]*?\)\}/g) ?? []
      for (const l of links) expect(l, f).not.toMatch(/Mia Chen|David Park|Thompson|Sarah|\$2,800|\$4,300|DSP-2K8X|Unit 1207/)
    }
  })
  it('the turn route drops a proposed action when the message is an unfilled template', () => {
    const src = readFileSync('app/api/agent/turn/route.ts', 'utf8')
    expect(src).toMatch(/if \(hasUnfilledTemplate\(message\) && out\.proposedAction\) \{\s*out\.proposedAction = null/)
    expect(readFileSync('lib/agent/prompts.ts', 'utf8')).toMatch(/0\. 【模板占位符】/)
  })
  it('tenant sends resolve the landlord from tenancy rows; repair requests create a real ticket', () => {
    const src = readFileSync('app/api/agent/execute/route.ts', 'utf8')
    expect(src).toMatch(/async function resolveTenantLandlord\(/)
    expect(src).toMatch(/case 'maintenance_request':\s*return executeMaintenanceRequest\(/)
    expect(src).toMatch(/from\('maintenance_tickets'\)\.insert\(\{ household_id: ll\.household_id, opened_by: userId/)
    expect(src).toMatch(/reason: action\.role === 'tenant' \? 'no_landlord_on_file' : 'no valid recipient email'/)
    expect(readFileSync('lib/agent/prompts.ts', 'utf8')).toMatch(/maintenance_request（提交报修工单给房东/)
    expect(readFileSync('lib/agent/useAgentSession.ts', 'utf8')).toMatch(/no_landlord_on_file/)
  })
})
