// Homepage V0.7 (2026-09-27): a marketing + login page. The user's decision
// after three weeks of "首页就是助手": the hero chat was too small to show the
// assistant's value and the page never explained the system. Now the hero
// carries the message and the login card, signed-in visitors are sent straight
// to the assistant of a hat they hold, the free demo lives on the assistant
// preview pages, and the system is explained (sample exchange + the approval
// card's real shape, the four-step loop, lifecycle, roles, Ontario rules with
// ids, live numbers, FAQ). Header, footer, logo and palette untouched.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { assistantPromptHref, homeAskRedirect } from '../lib/homeDeepLink'
import { ONTARIO_RULES, ruleById } from '../lib/ontario/rules'

const read = (p: string) => readFileSync(p, 'utf8')
const home = read('components/home/HomeNext.tsx')

describe('the homepage hosts no conversation of its own (the ask box sends it to the AI Agent page)', () => {
  it('no chat, no agent session, no ?ask= reader; the hero is message + login card', () => {
    for (const gone of ['AgentChat', 'useAgentSession', "sp.get('ask')", 'AssistantPanel', 'function Pain', 'useAIName', 'compactHeader']) expect(home, gone).not.toContain(gone)
    // 2026-10-01: the hero is America.gov's ask box now; the sign-in block lives on /login and /register
    expect(home).toContain("import HeroComposer from '@/components/home/HeroComposer'")
    expect(home).not.toContain('LoginCard')
    // 2026-09-29: one centered column, the sign-in block under the headline (Muse-style)
    expect(home).toContain('<HeroComposer zh={zh} className="mt-10 w-full sm:mt-12"')
    expect(home).toContain('href="#ask"') // the closing「先问一句试试 ↑」scrolls back up to the ask box
    expect(home).toContain('href="/register"')
    // 2026-10-01 user: one line, 「租房的事，交给AI助理」
    expect(home).toContain('<span className="whitespace-nowrap">租房的事，交给<em className="not-italic" style={{ color: \'#00ACE4\' }}>AI助理</em></span>')
    expect(home).not.toContain('租房路上的每一步')
    // 2026-10-01 (muse.ai / america.gov benchmark): 60px desktop, 48px tablet, one line on phones down to 320px
    expect(home).toContain('sl-type-head mx-auto max-w-[1000px] text-[clamp(22px,8.2vw,34px)] leading-[1.1] sm:text-[48px] lg:text-[60px]') // 600 via .sl-type-head (plan A, 2026-10-01)
    // 2026-10-01 user: the line under the headline is one short sentence too (reference: america.gov)
    expect(home).toContain('<span className="whitespace-nowrap">找房到续约，它去办，你来批准。</span>')
    expect(home).not.toContain('安省规则内置，全程留痕')
  })
  it('a signed-in visitor stays on the marketing page (2026-10-04); only a brand-new account goes on to onboarding; the first render never branches on auth', () => {
    expect(home).toMatch(/const signedIn = !auth\.loading && !!auth\.user && !\(auth\.user as \{ is_anonymous\?: boolean \}\)\.is_anonymous/)
    expect(home).toContain('landingForAccount(remembered, hats, named)') // homeForHats wrapped: a brand-new account goes to onboarding first (2026-09-27)
    expect(home).toContain("router.replace('/onboarding/name')")
    expect(home).not.toContain('data-testid="home-redirect"')
    expect(home).toContain('if (!onboarding || redirected.current) return') // onboarding needs signed in + hats loaded + name resolved (2026-09-27)
    // the marketing page renders while auth is still loading (matches the prerendered HTML); no useState reading window
    expect(home).not.toMatch(/useState\([^)]*window/)
  })
  it('every「试一试」opens the assistant preview; the landing tiles are gone — the role panels are the one place roles are told (2026-09-28, panels 2026-10-01)', () => {
    expect(home).toContain('assistantPromptHref(chatRole, pick(r.chips[0].prompt, lang))')
    expect(home).not.toContain('const TILES')
    expect(home).not.toContain('data-testid="home-tiles"')
    expect(home).not.toContain('登录后，你会直接进入')
  })
  it('the static sample exchange is gone — the film plays the real cards; the four-step loop sits under the film (user 2026-09-28: “动画和这个图片重复了”)', () => {
    for (const gone of ['const DEMO', 'data-testid="home-demo"', '示例对话 · 房东', 'RISK · HIGH', 'PROPOSE / DECIDE']) expect(home, gone).not.toContain(gone)
    const how = home.slice(home.indexOf('{/* ================= HOW IT WORKS'), home.indexOf('{/* ================= ROLES'))
    expect(how.indexOf('<ThreeRoleFilm />')).toBeLessThan(how.indexOf('data-testid="home-flow"'))
    expect(how).toContain("{zh ? '它提议，你决定。' : 'It proposes. You decide.'}")
    const flow = home.slice(home.indexOf('const FLOW:'), home.indexOf('// ── Ontario rules'))
    for (const s of ['你说一句', '它去办', '你来批准', '执行并留痕', '批准后 60 秒内可撤销', 'undone for 60 seconds']) expect(flow, s).toContain(s)
  })
  it('the rules section resolves real ids against the single source and counts them from it', () => {
    const ids = [...home.slice(home.indexOf('const RULE_IDS'), home.indexOf('] as const')).matchAll(/'([A-Za-z0-9-]+)'/g)].map((m) => m[1])
    expect(ids.length).toBe(10)
    for (const id of ids) expect(ruleById(id), id).toBeTruthy()
    expect(home).toContain('ONTARIO_RULES.length')
    expect(ONTARIO_RULES.length).toBeGreaterThanOrEqual(30)
    expect(home).toContain('data-testid="home-rules"')
    expect(home).toContain("r.id === 'RTA-120-guideline' ? `（${pick(GUIDELINE_TEXT, lang)}）` : ''") // the guideline numbers come from the table, never typed
    expect(home).not.toMatch(/2\.5%/) // the cap is not this year's figure
  })
  it('no pricing, no invented numbers, no real photos (pictures are the film’s 3D scenes)', () => {
    expect(home).not.toMatch(/\$19|\$29|每月 \$|per month/)
    expect(home).not.toMatch(/next\/image/)
    for (const src of [...home.matchAll(/img: '([^']+)'/g)].map((m) => m[1])) expect(src, src).toMatch(/^\/home\/film\/[a-z-]+\.webp$/)
    // the only numerals in prose are statutory (days, years, sections) or the live-stats placeholders
    expect(home).toContain("if (n == null) return '—'")
  })
})

describe('the login card and the shared sign-in hook', () => {
  const card = read('components/home/LoginCard.tsx')
  const hook = read('lib/auth/useLoginForm.ts')
  const page = read('app/login/page.tsx')
  it('the card offers the regular methods only — Google, email + password sign-in, registration — and no one-time link (user, 2026-09-27)', () => {
    expect(card).toContain("useLoginForm('signin', { next })")
    expect(card).toContain('id="login"')
    expect(card).toContain('data-testid="home-login"')
    for (const m of ['f.signInWithGoogle()', 'f.signUpWithPassword(e)', 'f.signInWithPassword(e)', 'f.forgotPassword()', 'f.resendConfirm()']) expect(card, m).toContain(m)
    expect(card).toContain("f.setTab('register')")
    expect(card).toContain('注册免费 · 不要信用卡 · 租客永远免费')
    expect(card).not.toMatch(/magic|一次性链接|sendMagicLink|signInWithOtp/)
    expect(card).not.toMatch(/\$\d/)
  })
  it('one hook owns the handlers; /login and /register render the same hook and define none of their own', () => {
    for (const s of ['signInWithOAuth', 'signInWithPassword', 'auth.signUp(', 'auth.resend(', 'resetPasswordForEmail', 'export function callbackUrl']) expect(hook, s).toContain(s)
    expect(hook).not.toContain('signInWithOtp')
    // /login and /register render the card itself since 2026-09-29 (tests/authPages20260929.spec.tsx)
    expect(page).toContain('<AuthPage mode="signin" />')
    expect(read('app/register/page.tsx')).toContain('<AuthPage mode="register" />')
    const shell = read('components/auth/AuthPage.tsx') + read('components/auth/SignInBlock.tsx')
    for (const s of ['signInWithOtp', 'signInWithOAuth', 'resetPasswordForEmail', 'function callbackUrl', 'magic-link', 'auth.signUp(']) expect(shell, s).not.toContain(s)
    expect(shell).toContain('homeForHats(remembered, data as HatsLite)') // the signed-in bounce is unchanged
    expect(shell).toContain('<LoginCard next={next} intent={intent}')
    expect(card).toContain("import GoogleIcon from '@/components/auth/GoogleIcon'")
  })
})

describe('legacy /?role=&ask= deep links', () => {
  it('one pure helper spells the assistant URL; the middleware 308s the old homepage link to it', () => {
    expect(assistantPromptHref('tenant', ' 多大附近两房 ')).toBe('/tenant/agent?prompt=%E5%A4%9A%E5%A4%A7%E9%99%84%E8%BF%91%E4%B8%A4%E6%88%BF&send=1')
    expect(assistantPromptHref('agent', 'x y', false)).toBe('/agent/agent?prompt=x+y')
    const t = homeAskRedirect(new URL('https://www.stayloop.ai/?role=landlord&ask=%E6%88%91%E7%9A%84%E6%88%BF%E6%BA%90'))
    expect(t?.pathname).toBe('/landlord/agent')
    expect(t?.searchParams.get('prompt')).toBe('我的房源')
    expect(t?.searchParams.get('send')).toBe('1')
    expect(t?.searchParams.has('ask')).toBe(false)
    // unknown or missing role → tenant; no ask → not a deep link; other paths untouched; long asks clipped
    expect(homeAskRedirect(new URL('https://www.stayloop.ai/?role=provider&ask=hi'))?.pathname).toBe('/tenant/agent')
    expect(homeAskRedirect(new URL('https://www.stayloop.ai/?ask=hi'))?.pathname).toBe('/tenant/agent')
    expect(homeAskRedirect(new URL('https://www.stayloop.ai/?role=landlord'))).toBeNull()
    expect(homeAskRedirect(new URL('https://www.stayloop.ai/?ask=%20%20'))).toBeNull()
    expect(homeAskRedirect(new URL('https://www.stayloop.ai/pricing?ask=hi'))).toBeNull()
    expect(homeAskRedirect(new URL(`https://www.stayloop.ai/?ask=${'a'.repeat(400)}`))?.searchParams.get('prompt')?.length).toBe(300)
    const mw = read('middleware.ts')
    expect(mw).toContain("import { homeAskRedirect } from '@/lib/homeDeepLink'")
    expect(mw).toContain('const ask = homeAskRedirect(url)')
    expect(mw).toContain('if (ask) return withSecurityHeaders(NextResponse.redirect(ask, 308))')
    // the role pages still emit the legacy link (eliseai spec); usePromptDeepLink sends on `send=1` and never an unfilled template
    expect(read('lib/agent/usePromptDeepLink.ts')).toContain("params.get('send') === '1' && !/【[^】]*】/.test(text)")
  })
})

describe('what did not change, and the version label', () => {
  it('header, footer and logo untouched except the version; the chat header lost only its homepage-only variant', () => {
    expect(read('components/Footer.tsx')).toContain('>V0.7<')
    expect(read('components/Footer.tsx')).not.toContain('>V0.6<')
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).not.toContain('compactHeader')
    expect(chat).toContain("flex flex-none flex-col items-center px-4 pb-2 pt-3 ${device ? '' : 'md:border-b") // the /x/agent header (2026-09-24) is the only header now; `device` only drops its md: sizes
    expect(chat).not.toMatch(/flex h-12 flex-none items-center gap-2\.5 border-b/) // the one-row variant stays rejected
    expect(read('components/agent/AgentWorkspacePage.tsx')).not.toContain('compactHeader')
    expect(home).toContain('<Header variant="transparent" />')
    expect(home).toContain('<Footer />')
  })
  it('kept from 2026-09-25: one useAuth() instance’s setRole reaches every other instance', () => {
    const auth = read('lib/useAuth.ts')
    expect(auth).toContain("window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: r }))")
    expect(auth).toContain('window.addEventListener(ROLE_CHANGED_EVENT, onChanged)')
    expect(auth).toMatch(/const setRole = \(r: Role\) => \{[\s\S]*?if \(typeof window !== 'undefined' && state\.user\) \{[\s\S]*?\}\s*setState\(\(prev\) => \(prev\.role === r \? prev : \{ \.\.\.prev, role: r \}\)\)/)
  })
})
