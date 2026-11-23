// 2026-11-22 (user: 「改掉」): the tenant passport page said 「我们正在接入信用局，把你的按时租金记录上报
// Equifax」 under a 「即将上线」 badge with a waitlist, and /platform listed 「租金记录上报信用局」 as coming
// soon. No bureau reporting agreement is being worked on (and the 2026-11-22 review put bureau
// reporting on the not-now list), so the site must not say or imply that one is. Nobody had joined
// the waitlist. What the page does offer — a read-only link with the on-time rent record both sides
// confirmed — stays.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(p, 'utf8')
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// Reporting rent TO a bureau. (Reading a credit report an applicant supplied, or a bureau's own
// label on it, is a different thing and lives in the screening module.)
const CLAIM = /上报[^。\n]{0,12}(信用局|征信|Equifax|TransUnion)|(信用局|征信)[^。\n]{0,6}上报|rent reporting|report(ing)? (your |their )?(on-time )?rent( payments| records?)? to|reported to (Equifax|TransUnion|the credit bureau)/i

describe('the site does not say rent is, or will be, reported to a credit bureau', () => {
  it('the passport page has no bureau card and no waitlist; the share link is still there', () => {
    const page = read('app/tenant/passport/page.tsx')
    expect(page).not.toMatch(CLAIM)
    for (const gone of ['waitlistJoined', 'handleJoinWaitlist', 'waitlist_rent_reporting', '即将上线', 'COMING SOON', '等候名单']) expect(page, gone).not.toContain(gone)
    expect(page).toContain('按时付租记录')
  })

  it('/platform does not list it as coming soon', () => {
    const page = read('app/platform/page.tsx')
    expect(page).not.toMatch(CLAIM)
    expect(page).toContain("{ t: { zh: '租客护照 · 已确认租史，只读分享'")
  })

  it('nothing else in the app, the components or the libraries says it either', () => {
    const hits: string[] = []
    for (const f of [...walk('app'), ...walk('components'), ...walk('lib')]) {
      const src = read(f)
      const m = src.match(CLAIM)
      if (m) hits.push(`${f}: ${m[0]}`)
    }
    expect(hits).toEqual([])
  })
})
