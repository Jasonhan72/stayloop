// 2026-10-21 · signed-in walkthrough after the Next 16 release (user: 「你自己决定」 + 「筛查模块这个问题可以改」).
// 1. Message-centre avatars showed "[" for names starting with "[TEST]".
// 2. The two screening inputs sat at the browser's default width (≈200px) — the global .input
//    rule they relied on is gone — so the placeholders were cut off.
// 3. The landlord applicants sample still taught hard cut-offs (credit ≥ 720 / DTI ≤ 35%), a
//    "below threshold" group, an "8 axes" claim, an LTB "closed" outcome the directory cannot know,
//    and an "RTA notice" listing Human Rights Code grounds.
// 4. The "Add to Home Screen" nudge covered the bottom of workspace pages (a thread's composer)
//    until dismissed.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { initialOf } from '@/lib/threads/shared'
import {
  INSTALL_HINT_MAX_SHOWS, INSTALL_HINT_VISIBLE_MS, installHintBlockedOn, installHintMayShow, isTypingTarget,
} from '@/lib/ui/installHint'

const read = (p: string) => readFileSync(p, 'utf8')
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line)
const code = (p: string) => read(p).split('\n').filter((l) => !isComment(l)).join('\n')
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe('1 · avatar initials skip a [TEST] tag and punctuation', () => {
  it('first letter or digit, Han kept whole, role word when nameless', () => {
    expect(initialOf('[TEST] Agent Person', 'agent', true)).toBe('A')
    expect(initialOf('[TEST]', 'tenant', true)).toBe('T')
    expect(initialOf('🙂 lily', 'tenant', false)).toBe('L')
    expect(initialOf('sarah', 'landlord', true)).toBe('S')
    expect(initialOf('王小明', 'tenant', true)).toBe('王')
    expect(initialOf('', 'landlord', true)).toBe('房')
    expect(initialOf(null, 'admin', true)).toBe('S')
  })
})

describe('2 · the screening inputs fill their grid cell', () => {
  it('both "input sl-field" boxes carry width 100% in their inline style', () => {
    const page = read('app/screening/app/page.tsx')
    const blocks = page.split('className="input sl-field"').slice(1).map((b) => b.slice(0, 900))
    expect(blocks).toHaveLength(2)
    for (const b of blocks) expect(b).toMatch(/style=\{\{[\s\S]*?width: '100%'/)
  })
})

describe('3 · no hard cut-offs in landlord copy (OHRC)', () => {
  it('nothing outside comments sets a credit-score or debt-ratio line', () => {
    const hits: string[] = []
    for (const f of ['app', 'components', 'lib'].flatMap((d) => sources(d))) {
      read(f).split('\n').forEach((l, i) => {
        if (!isComment(l) && /信用\s*≥\s*\d{3}|[Cc]redit\s*≥\s*\d{3}|DTI\s*≤/.test(l)) hits.push(`${f}:${i + 1}`)
      })
    }
    expect(hits).toEqual([])
  })
  it('the applicants sample: preferences without cut-offs, no "below threshold", the right law named', () => {
    const p = code('app/landlord/applicants/page.tsx')
    expect(p).not.toMatch(/不达标|Below threshold|below threshold|Meet threshold|meet threshold|门槛|8 维|8 axes|已结案/)
    expect(p).toContain('不设收入倍数线')
    expect(p).toContain('不设分数线')
    expect(p).toContain('《人权法》提示')
    expect(p).not.toContain("'RTA 提示：'")
    expect(p).toContain('领取公共援助')
    expect(p).toContain('近 1 年有 1 份 LTB 判令')
    const steps = code('components/landlord/LandlordThreeSteps.tsx')
    expect(steps).not.toMatch(/不达标|Below threshold/)
  })
})

describe('4 · the install nudge stays off composers and leaves on its own', () => {
  it('blocked on message threads and the tenancy hub, not elsewhere', () => {
    expect(installHintBlockedOn('/messages')).toBe(true)
    expect(installHintBlockedOn('/h/2b1f')).toBe(true)
    expect(installHintBlockedOn('/landlord/todo')).toBe(false)
    expect(installHintBlockedOn('/hello')).toBe(false)
  })
  it('a few appearances at most', () => {
    expect(installHintMayShow(null)).toBe(true)
    expect(installHintMayShow(String(INSTALL_HINT_MAX_SHOWS - 1))).toBe(true)
    expect(installHintMayShow(String(INSTALL_HINT_MAX_SHOWS))).toBe(false)
    expect(INSTALL_HINT_VISIBLE_MS).toBeGreaterThan(0)
  })
  it('typing targets: text fields yes, buttons and checkboxes no', () => {
    const el = (o: Record<string, unknown>) => o as unknown as Element
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(el({ tagName: 'TEXTAREA' }))).toBe(true)
    expect(isTypingTarget(el({ tagName: 'INPUT', type: 'email' }))).toBe(true)
    expect(isTypingTarget(el({ tagName: 'INPUT', type: 'checkbox' }))).toBe(false)
    expect(isTypingTarget(el({ tagName: 'BUTTON' }))).toBe(false)
    expect(isTypingTarget(el({ tagName: 'DIV', isContentEditable: true }))).toBe(true)
  })
  it('the rail wires it: composer pages, typing, auto-hide, the show count (the I-D4 agent-page rule unchanged)', () => {
    const r = read('components/workspace/rail.tsx')
    expect(r).toContain("const onComposerPage = installHintBlockedOn(usePathname() || '')")
    expect(r).toContain('if (onComposerPage || typing) return null')
    expect(r).toContain('setTimeout(() => setShow(false), INSTALL_HINT_VISIBLE_MS)')
    expect(r).toContain('installHintMayShow(stored)')
    expect(r).toContain('if (!show || onAgentPage) return null')
  })
})
