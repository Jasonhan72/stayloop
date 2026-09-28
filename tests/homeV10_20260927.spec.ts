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

describe('the homepage no longer hosts the conversation', () => {
  it('no chat, no agent session, no ?ask= reader; the hero is message + login card', () => {
    for (const gone of ['AgentChat', 'useAgentSession', "sp.get('ask')", 'AssistantPanel', 'function Pain', 'useAIName', 'compactHeader']) expect(home, gone).not.toContain(gone)
    expect(home).toContain("import LoginCard from '@/components/home/LoginCard'")
    expect(home).toContain('<LoginCard className="min-w-0" />')
    expect(home).toContain('href="#login"') // both CTAs scroll to the card
    expect(home).toContain("const TRY_HREF = '/tenant/agent'") // the free, no-account demo lives on the preview page
    expect(home).toContain('租房路上的每一步，')
    expect(home).toContain('你自己的 AI 助理')
    expect(home).not.toContain('sm:text-[52px]') // 44px h1 stays (2026-09-25)
  })
  it('a signed-in visitor is redirected with the login page’s predicate; the first render never branches on auth', () => {
    expect(home).toMatch(/const signedIn = !auth\.loading && !!auth\.user && !\(auth\.user as \{ is_anonymous\?: boolean \}\)\.is_anonymous/)
    expect(home).toContain('landingForAccount(remembered, hats, named)') // homeForHats wrapped: a brand-new account goes to onboarding first (2026-09-27)
    expect(home).toContain('router.replace(target)')
    expect(home).toContain('data-testid="home-redirect"')
    expect(home).toContain('if (!ready || redirected.current) return') // ready = signed in + hats loaded + name resolved (2026-09-27)
    // the marketing page renders while auth is still loading (matches the prerendered HTML); no useState reading window
    expect(home).not.toMatch(/useState\([^)]*window/)
  })
  it('the four landing tiles and every「试一试」open real pages', () => {
    const tiles = home.slice(home.indexOf('const TILES:'), home.indexOf('const ROLES:'))
    const hrefs = [...tiles.matchAll(/href: '([^']+)'/g)].map((m) => m[1])
    expect(hrefs).toEqual(['/tenant/agent', '/landlord/agent', '/agent/agent', '/services'])
    for (const h of hrefs) expect(existsSync(`app${h}/page.tsx`), h).toBe(true)
    expect(home).toContain('data-testid="home-tiles"')
    expect(home).toContain('assistantPromptHref(chatRole, pick(c.prompt, lang))')
  })
  it('the sample exchange is labelled as one, uses the data canon, and its buttons are not controls', () => {
    expect(home).toContain("label: { zh: '示例对话 · 房东', en: 'Sample conversation · landlord' }")
    expect(home).toContain("note: { zh: '内容为示范', en: 'Illustrative' }")
    expect(home).toContain('Mia Chen')
    const demo = home.slice(home.indexOf('data-testid="home-demo"'), home.indexOf('data-testid="home-flow"'))
    expect(demo).not.toContain('<button')
    expect(demo).toContain('RISK · HIGH')
    for (const s of ['将分享', '不会分享', '预览正文', '批准', '拒绝']) expect(demo).toContain(s)
    // the assistant's line follows the 09-27 intake rule: applications by completeness and time, scores only in the report
    expect(home).toContain('分数只在报告里看')
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
  it('no pricing, no invented numbers, no photos', () => {
    expect(home).not.toMatch(/\$19|\$29|每月 \$|per month/)
    expect(home).not.toMatch(/<img|next\/image/)
    // the only numerals in prose are statutory (days, years, sections) or the live-stats placeholders
    expect(home).toContain("if (n == null) return '—'")
  })
})

describe('the login card and the shared sign-in hook', () => {
  const card = read('components/home/LoginCard.tsx')
  const hook = read('lib/auth/useLoginForm.ts')
  const page = read('app/login/page.tsx')
  it('the card offers the same three methods as /login, defaults to the email link, and registers on first sign-in', () => {
    expect(card).toContain("useLoginForm('magic-link')")
    expect(card).toContain('id="login"')
    expect(card).toContain('data-testid="home-login"')
    for (const m of ['f.signInWithGoogle()', 'f.sendMagicLink(e)', 'f.signInWithPassword(e)', 'f.forgotPassword()', 'f.resendConfirm()']) expect(card, m).toContain(m)
    expect(card).toContain('首次登录即完成注册 · 租客永远免费')
    expect(card).toContain('已有密码？密码登录')
    expect(card).not.toMatch(/\$\d/)
  })
  it('one hook owns the handlers; /login renders the same hook and defines none of its own', () => {
    for (const s of ['signInWithOtp', 'signInWithOAuth', 'signInWithPassword', 'auth.resend(', 'resetPasswordForEmail', 'export function callbackUrl']) expect(hook, s).toContain(s)
    expect(page).toContain("useLoginForm('password')")
    for (const s of ['signInWithOtp', 'signInWithOAuth', 'resetPasswordForEmail', 'function callbackUrl']) expect(page, s).not.toContain(s)
    expect(page).toContain('homeForHats(remembered, data as HatsLite)') // the signed-in bounce is unchanged
    expect(page).toContain("import GoogleIcon from '@/components/auth/GoogleIcon'")
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
    expect(chat).toContain('flex flex-none flex-col items-center px-4 pb-2 pt-3 md:border-b') // the /x/agent header (2026-09-24) is the only header now
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
