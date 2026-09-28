// Sign-in methods are the regular ones (user, 2026-09-27:「这个发送登录链接的功能
// 早就不要了，改为常规的几个登录方式了」): Google, email + password sign-in,
// email + password registration, forgot password, resend verification. The
// one-time email link is gone from every entrance, the invite landing sends
// people to the regular sign-in, and no copy promises a link any more.
import { describe, it, expect } from 'vitest'
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

describe('no one-time sign-in link anywhere in the UI', () => {
  it('signInWithOtp is not called from app / components / lib', () => {
    const offenders = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) => read(f).includes('signInWithOtp'))
    expect(offenders).toEqual([])
  })
  it('the hook exposes the regular methods and only those', () => {
    const hook = read('lib/auth/useLoginForm.ts')
    expect(hook).toContain("export type LoginTab = 'signin' | 'register'")
    for (const s of ['signInWithPassword', 'signUpWithPassword', 'signInWithGoogle', 'resendConfirm', 'forgotPassword']) expect(hook).toContain(`const ${s} = async`)
    expect(hook).not.toMatch(/sendMagicLink|magic-link/)
    // registration mirrors the retired /register logic: length, match, anti-enumeration, autoconfirm
    expect(hook).toContain("password.length < 8")
    expect(hook).toContain("password !== password2")
    expect(hook).toContain("data.user.identities?.length === 0")
    expect(hook).toContain("setSent('verify')")
    expect(hook).toContain("setSent('reset')")
  })
  it('the invite landing sends people to the regular sign-in, not a link', () => {
    const s = read('app/join/[token]/page.tsx')
    expect(s).toContain('/login?next=')
    expect(s).toContain('href="/register"')
    expect(s).not.toMatch(/magicSent|sendMagicLink|免密码|passwordless|登录链接/)
  })
  it('no copy promises a sign-in link', () => {
    const checks: [string, RegExp][] = [
      ['components/home/HomeNext.tsx', /一次性链接|one-time link|登录链接/],
      ['components/home/LoginCard.tsx', /链接登录|sign-in link|magic/i],
      ['app/login/page.tsx', /一次性链接|one-time link|Magic link|邮箱链接/],
      ['app/login/layout.tsx', /魔法链接/],
      ['components/ShowingRequestModal.tsx', /魔法链接|magic link/],
      ['app/settings/page.tsx', /登录链接）|sign-in link\)/],
      ['lib/i18n.tsx', /magic link/i],
    ]
    for (const [f, bad] of checks) expect(read(f), f).not.toMatch(bad)
  })
})
