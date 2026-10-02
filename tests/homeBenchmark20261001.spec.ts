// Homepage sizes after measuring muse.ai and america.gov at 1440 / 390 (2026-10-01, user「全部一起改」):
// a full-screen hero with a big, lighter headline, Muse-sized sign-in fields, 40px / 700 section
// headings with 18px muted leads, 64 / 96px section padding and alternating full-width bands.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'

const home = readFileSync('components/home/HomeNext.tsx', 'utf8')
const card = readFileSync('components/home/LoginCard.tsx', 'utf8')

describe('hero', () => {
  it('fills the first screen (minus header and phone bottom bar) and centers its content', () => {
    expect(home).toContain('min-h-[calc(100svh-120px)] flex-col md:min-h-[calc(100svh-66px)]')
    expect(home).toContain('flex-1 flex-col items-center justify-center')
  })
  it('a 60px / 700 headline and a 24px muted line (the 「了解更多 ↓」 pill gave way to the ask box’s controls)', () => {
    expect(home).toContain('lg:text-[60px]')
    expect(home).not.toMatch(/<h1[^>]*font-extrabold/)
    expect(home).toContain('lg:text-[24px]')
  })
})

describe('sign-in block (shared with /login, /register, onboarding)', () => {
  it('Muse-sized: 54px filled field with no border, 16px text; 48px buttons with 16px text', () => {
    expect(card).toContain("!h-[54px] !rounded-[20px] !border-transparent")
    expect(card).toContain('!text-[16px]')
    expect(card).toContain("sl-btn-primary w-full !h-[48px] !py-0 !text-[16px]")
    expect(card).toContain('flex h-[48px] w-full items-center justify-center')
  })
})

describe('sections (plan A, 2026-10-01 — supersedes the 40px / 700 pass)', () => {
  it('two weights only: 600 headings via .sl-type-head, never bold or extra-bold on the page', () => {
    expect(home).not.toMatch(/font-extrabold|font-bold leading/)
    expect(home).toContain("const H2 = 'sl-type-head text-[28px] leading-[1.18] text-ink sm:text-[44px] sm:leading-[1.12]'")
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toContain(".sl-type-head {\n  font-weight: 600;")
    expect(css).toContain(":lang(zh) .sl-type-head { letter-spacing: 0.01em; word-break: keep-all; overflow-wrap: anywhere; }") // no negative tracking on Chinese; break at punctuation, never inside a word
    expect(css).toContain("font-feature-settings: 'palt';") // proportional CJK punctuation
  })
  it('48 / 112px padding (phones / 1024px+; tablets 80px, see below), alternating full-width bands, one idea per panel', () => {
    expect((home.match(/py-12 sm:px-7 sm:py-28/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(home).not.toContain('py-20 sm:px-7')
    expect(home).toContain("<section id={testId} tabIndex={card ? -1 : undefined} style={{ background: tint ? '#F3F8FC' : '#FFFFFF' }} data-testid={testId} className={card ? `${CARD_ON_PHONE} ${CARD_ON_TABLET} focus:outline-none` : phoneWhite ? 'max-sm:!bg-white sm:max-lg:!bg-white' : undefined}>")
    expect(home).toContain('<section className="text-white" style={{ background: \'#1B1B3C\' }}>')
  })
  it('scroll-in is CSS-only and honours reduced motion (nothing waits for JavaScript to appear)', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*@supports \(animation-timeline: view\(\)\)/)
  })
  it('long Chinese runs without punctuation carry an explicit break point, never an emergency mid-word break (production check 2026-10-01: 「…维修工单 / ？先把…」「…申请 / 人？」)', () => {
    expect(home).toContain("'想接多伦多\\u200b租房市场的\\u200b维修工单？先把资质核了。'")
    expect(home).toContain("'行政事务交给 AI，时间留给\\u200b专业工作。'") // the phone card column is narrower (2026-10-01)
    expect(home).toContain("'筛查报告会不会\\u200b一票否决申请人？'")
    // highlighted words never split across lines either
    expect(home).toContain('whitespace-nowrap" style={{ color: \'#00ACE4\' }}>每一步办完</em>')
    // the break point is layout-only: the FAQ structured data carries the plain question
    expect(home).toContain("name: pick(f.q, lang).replace(/\\u200b/g, '')")
  })
})

// 2026-10-01 user: 「手机端的首页确实有点长」 — 13,590px at 390 → about 8,200. Every change is phone-only
// (base / max-sm: classes with sm: restores); 640px and up was measured element-for-element identical.
describe('phones (2026-10-01 「手机端的首页确实有点长」)', () => {
  it('phone values are paired with their 640px+ restores', () => {
    expect(home).toContain('py-16 text-center sm:px-7 sm:py-36 lg:py-44') // statement
    expect(home).toContain('py-16 text-center sm:px-7 sm:py-32') // closing band
    expect(home).toContain('mt-8 rounded-[28px] bg-white p-3 shadow-[0_30px_80px_-40px_rgba(27,27,60,0.35)] sm:mt-16') // film card
    expect(home).toContain('aspect-[3/2] w-full rounded-[16px] object-cover sm:aspect-square sm:rounded-[36px]') // whole 3:2 scenes on phones
    expect(home).toContain('mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:mt-14 sm:gap-10 lg:grid-cols-4') // numbers 2 × 2
    expect(home).toContain('text-[clamp(26px,8.5vw,44px)] font-semibold leading-none sm:text-[56px]')
    expect(home).toContain('[&::-webkit-details-marker]:hidden max-sm:py-4') // the FAQ tap target is the summary
  })
  it('the four roles are one swipe row on phones: heading, four anchor chips, cards with every word kept', () => {
    const row = home.slice(home.indexOf('data-testid="home-roles"'), home.indexOf('{/* ================= RULES'))
    expect(row).toContain('<div className="px-5 text-center lg:hidden">') // phones and tablets (2026-10-02)
    expect(row).toContain("'四种身份，各自的入口' : 'Four roles, each with its own entry'")
    expect(row).toContain('href={`#home-role-${k}`} onClick={() => focusCardSoon(`home-role-${k}`)} className="inline-flex min-h-[44px]')
    expect(row).toContain('<p aria-hidden className="mt-2 text-[13px] text-body-3 sm:max-lg:hidden">') // the swipe hint is phone-only (at 1024px+ its block is hidden)
    // every layout class of the row is phone-only, and the scroll reveal is off inside it
    expect(row).toContain('<RoleRow>')
    const scroller = home.match(/const ROW_CLASS = '([^']+)'/)?.[1] ?? ''
    expect(scroller.split(' ').every((c) => c.startsWith('max-sm:'))).toBe(true)
    expect(scroller).toContain('max-sm:snap-x max-sm:snap-mandatory')
    expect(scroller).toContain('max-sm:[&_.sl-reveal]:[animation:none]')
    // review 2026-10-01: the last card snaps flush (24px spacer) and the card shadow is not clipped
    expect(scroller).toContain('max-sm:after:w-6')
    expect(scroller).toContain('max-sm:pb-8')
    expect(home).toMatch(/const CARD_ON_PHONE = '(max-sm:\S+ ?)+'/)
    // the provider lead stays on phones: 「只派给已核验的服务商，或自己的联系人」 is said nowhere else
    expect(home).not.toContain('hideLeadOnPhone={role')
    expect((home.match(/^\s+hideLeadOnPhone$/gm) ?? []).length).toBe(1) // the approval panel only
    // behaviour on phones: keyboard focus brings a peeking card into the row; a swipe shows the next card's top;
    // a chip moves focus to its card (sections are focusable only when they are cards)
    expect(home).toContain("row.addEventListener('focusin', onFocus)")
    expect(home).toContain('if (top < 64) window.scrollBy({ top: top - 72, behavior: smooth() })')
    expect(home).toContain('onClick={() => focusCardSoon(`home-role-${k}`)}')
    expect(home).toContain('loading="eager" decoding="async"')
    expect(home).toMatch(/<Panel\n\s+tint=\{tint\}\n\s+flip=\{flip\}\n\s+card\n/)
  })
  it('only repeats are left out on phones, never with sr-only, and all of it is one tap away', () => {
    const hidden = home.match(/const PHONE_HIDDEN_RULES = new Set<string>\(\[([^\]]+)\]\)/)?.[1] ?? ''
    const ids = [...hidden.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(ids).toHaveLength(4)
    // each hidden rule is said again on the page (outside the rules list itself)
    const said: Record<string, string> = { 'RTA-27-entry-notice': 'RTA s.27', 'OHRC-no-income-cutoff': 'OHRC 租房政策', 'OREG9-18-standard-lease': '安省标准租约起草与电子签', 'CRA-10-7-notice': '《消费者报告法》s.10(7)' }
    for (const id of ids) expect(home, id).toContain(said[id])
    // TRESA s.32 is said nowhere else, so it stays visible on phones
    expect(ids).not.toContain('TRESA-32-registrant-disclosure')
    const all = [...(home.match(/const RULE_IDS = \[([\s\S]*?)\] as const/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    for (const id of ids) expect(all).toContain(id)
    // N1 and N4 are said nowhere else on the page, so they stay on phones
    expect(ids).not.toContain('RTA-116-n1-90-days')
    expect(ids).not.toContain('RTA-59-n4-7-days')
    expect(home).toContain("className={PHONE_HIDDEN_RULES.has(r.id) ? 'max-sm:hidden' : undefined}")
    expect(home).toContain("${hideLeadOnPhone ? ' max-sm:hidden' : ''}")
    expect(home).not.toMatch(/sr-only/)
  })
})

// 2026-10-01 user: 「手机端的首页的英文页面的 sign 和 create a free account 被挤到了边上，还分成了二行」 — a link never breaks
// inside itself on phones; buttons that must wrap at 320px wrap evenly and centred.
describe('links do not split across lines on phones (2026-10-01)', () => {
  const composer = readFileSync('components/home/HeroComposer.tsx', 'utf8')
  it('the hero account links are one unbreakable group, on their own line below 640px', () => {
    expect(composer).toContain('<span className="whitespace-nowrap max-sm:mt-1 max-sm:block" data-testid="home-ask-account-links">')
    const group = composer.slice(composer.indexOf('data-testid="home-ask-account-links"'), composer.indexOf('</p>', composer.indexOf('data-testid="home-ask-account-links"')))
    for (const s of ["'Sign in'", "'Create a free account'", "'登录'", "'免费注册'"]) expect(group, s).toContain(s)
  })
  it('the FAQ “more” link stays whole; wrapped buttons are balanced and centred', () => {
    expect(home).toContain('<Link href={f.href} className="whitespace-nowrap font-semibold text-brand hover:underline">')
    expect(home).toContain('className="sl-btn-secondary mt-6 inline-flex text-center [text-wrap:balance] sm:mt-8"')
    expect(readFileSync('components/agent/ApprovalActionCard.tsx', 'utf8')).toContain('!text-[13.5px] text-center [text-wrap:balance] disabled:opacity-60')
  })
})


// 2026-10-02 user: 「平板端的首页也一起缩短吧」 — 640–1023px was the longest of all (14,577px at 768 vs 10,749 at 1024).
// Every change is a range class (sm:max-lg: = 640–1023, md:max-lg: = 768–1023) appended after the existing ones, so
// below 640 and from 1024 the page was measured element-for-element identical (geometry + 49 computed properties).
describe('tablets (2026-10-02 「平板端的首页也一起缩短吧」)', () => {
  it('only range classes: every max-lg: class is sm:max-lg: or md:max-lg:, nothing is hidden on tablets but the swipe hint', () => {
    const ranged = home.match(/\S*max-lg:\S*/g) ?? []
    expect(ranged.length).toBeGreaterThan(20)
    for (const c of ranged) expect(c, c).toMatch(/^[`'"]?\$?\{?(?:sm|md):max-lg:/)
    expect((home.match(/max-lg:hidden/g) ?? []).length).toBe(1) // the aria-hidden swipe hint
    expect(home).not.toMatch(/(?<![a-z]:)max-lg:/) // never a bare max-lg: (it would reach phones)
  })
  it('the four roles are a 2 × 2 grid of equal-height cards under the phone heading and chips', () => {
    const row = home.match(/const ROW_ON_TABLET = '([^']+)'/)?.[1] ?? ''
    expect(row.split(' ').every((c) => c.startsWith('sm:max-lg:'))).toBe(true)
    expect(row).toContain('sm:max-lg:grid sm:max-lg:grid-cols-2')
    expect(row).not.toContain('items-start') // equal-height cards (grid stretch)
    expect(home).toContain('className={`${ROW_CLASS} ${ROW_ON_TABLET}`}')
    expect(home).toMatch(/const CARD_ON_TABLET = '(sm:max-lg:\S+ ?)+'/)
    expect(home).toContain("max-sm:p-3 max-sm:pb-6 sm:max-lg:gap-5 sm:max-lg:p-3 sm:max-lg:pb-6' : ' sm:max-lg:py-20'}")
    expect(home).toContain("${card ? ' sm:max-lg:text-[26px]' : ''}")
    expect(home).toContain("${card ? ' sm:max-lg:text-[17px]' : ''}")
    expect(home).toContain('sm:aspect-square sm:rounded-[36px] sm:max-lg:aspect-[3/2] sm:max-lg:rounded-[16px]')
    expect(home).toContain('<div className="max-sm:bg-[#F3F8FC] max-sm:py-12 sm:max-lg:bg-[#F3F8FC] sm:max-lg:py-20" data-testid="home-roles">')
  })
  it('from 768px the approval card and its words sit side by side (the real card gets the wider column)', () => {
    expect((home.match(/^\s+splitFromMd$/gm) ?? []).length).toBe(1)
    expect(home).toContain("${splitFromMd ? ' md:max-lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]' : ''}")
    expect(home).toContain("${splitFromMd ? ' md:max-lg:text-[30px]' : ''}")
    expect(home).toContain("${splitFromMd ? ' md:max-lg:text-[18px]' : ''}")
    expect(home).toContain('sm:grid-cols-2 sm:gap-5 md:max-lg:grid-cols-1" data-testid="home-flow"')
    expect(home).toContain('sm:rounded-[36px] sm:p-10 sm:max-lg:rounded-[28px] sm:max-lg:p-6')
  })
  it('rules, numbers, FAQ and the bands: two-column index, 80px bands, the FAQ side by side from 768', () => {
    expect(home).toContain('divide-y divide-line-divider sm:max-lg:grid sm:max-lg:grid-cols-2 sm:max-lg:gap-x-8 sm:max-lg:[&>li:nth-child(2)]:!border-t-0')
    expect(home).toContain("phoneWhite ? 'max-sm:!bg-white sm:max-lg:!bg-white'") // after the pale roles band
    expect(home).toContain('sm:py-36 lg:py-44 sm:max-lg:py-24') // statement
    expect(home).toContain('px-4 py-12 sm:px-7 sm:py-28 sm:max-lg:py-20') // how it works
    expect(home).toContain('sm:p-8 sm:max-lg:mt-10" data-testid="home-film"')
    expect(home).toContain('px-5 py-12 sm:px-7 sm:py-28 sm:max-lg:py-20">') // numbers
    expect(home).toContain('sm:gap-10 lg:grid-cols-4 sm:max-lg:mt-10') // numbers stay 2 × 2 (big numbers need the width)
    expect(home).toContain('lg:gap-16 sm:max-lg:py-20 md:max-lg:grid-cols-[5fr_7fr]') // FAQ
    expect(home).toContain('sm:px-7 sm:py-32 sm:max-lg:py-20') // closing band
  })
})
