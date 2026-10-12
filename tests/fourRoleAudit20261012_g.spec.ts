import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Four-role audit 2026-10-12, follow-up G: the audit's automated browser froze on every native
// `window.confirm` in the signed-in UI. ClientBook.tsx was converted first (spec _f); these are
// the five remaining dialogs, each now an inline two-step confirm — the trigger button becomes
// the question sentence plus 「确认…」/「取消」, and the action runs only on the second click.
const read = (p: string) => readFileSync(p, 'utf8')
// `window.confirm(` and a bare `confirm(` (not `setConfirm…(`, `confirmRevoke`, …).
const NATIVE_CONFIRM = /(^|[^A-Za-z0-9_.$])confirm\(/m

const CASES: { file: string; testid: string; question: string; handler: RegExp }[] = [
  {
    file: 'components/delegations/MyDelegations.tsx',
    testid: 'delegation-revoke-confirm',
    question: '撤销这份委托？立即生效，对方会收到通知。',
    handler: /async function revoke\(d: DelegationRow\) \{\n\s+setConfirmRevoke\(null\)/,
  },
  {
    file: 'components/threads/ThreadPanel.tsx',
    testid: 'thread-retract-confirm',
    question: '撤回这条消息？原文会保留在记录中，对方会看到「已撤回」。',
    handler: /async function retract\(m: ThreadMessage\) \{\n\s+if \(!tid \|\| !me\) return\n\s+setConfirmRetract\(null\)/,
  },
  {
    file: 'app/provider/onboard/page.tsx',
    testid: 'credential-remove-confirm',
    question: '删除这条资质？已核验的记录也会一起删除；如果它是该工种唯一有效的一条，派单会立刻跳过你。续期请用「续期」。',
    handler: /async function delCred\(id: string\) \{ setConfirmDel\(null\); await supabase\.from\('provider_credentials'\)\.delete\(\)/,
  },
  {
    file: 'components/agent/AssistantSettings.tsx',
    testid: 'assistant-forget-profile-confirm',
    question: '忘掉它对你的画像（包括你自己写的项）？下一轮对话后它会重新学习。',
    handler: /async function forgetProfile\(\) \{\n\s+if \(!uid \|\| !profile\) return\n\s+setConfirmForget\(false\)/,
  },
  {
    file: 'app/landlord/leases/[id]/page.tsx',
    testid: 'lease-delete-confirm',
    question: '撤回并删除这份已发送、尚未签署的租约？租客手上的签署链接会失效。',
    handler: /const ok = typeof window === 'undefined' \|\| confirmDelete\n\s+if \(!ok\) \{ setConfirmDelete\(true\); return \}/,
  },
]

describe('no native confirm dialogs remain in the signed-in UI (four-role audit G)', () => {
  for (const c of CASES) {
    it(`${c.file}: inline two-step confirm, no window.confirm`, () => {
      const s = read(c.file)
      expect(s).not.toMatch(/window\.confirm\(/)
      expect(s).not.toMatch(NATIVE_CONFIRM)
      expect(s).toContain(`data-testid="${c.testid}"`)
      // The question is still the one the dialog asked, now rendered inline …
      expect(s).toContain(c.question)
      // … and the action itself clears the pending state instead of asking.
      expect(s).toMatch(c.handler)
      // Both ways out of the row exist.
      expect(s).toMatch(/['"]取消['"]/)
      expect(s).toMatch(/['"]确认/)
    })
  }
})

describe('existing testids survived the conversion', () => {
  it('lease-delete trigger and credential-edit/renew are still there', () => {
    expect(read('app/landlord/leases/[id]/page.tsx')).toContain('data-testid="lease-delete"')
    const o = read('app/provider/onboard/page.tsx')
    expect(o).toContain('data-testid="credential-edit"')
    expect(o).toContain('data-testid="credential-renew"')
    expect(read('components/threads/ThreadPanel.tsx')).toContain('data-testid="thread-retracted"')
  })
  it('the lease page keeps its non-browser behaviour: without a window the deletion proceeds as before', () => {
    const s = read('app/landlord/leases/[id]/page.tsx')
    expect(s).toMatch(/typeof window === 'undefined' \|\| confirmDelete/)
  })
})
