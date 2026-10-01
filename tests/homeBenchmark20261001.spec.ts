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
  it('80 / 112px padding, alternating full-width bands, one idea per panel', () => {
    expect((home.match(/py-20 sm:px-7 sm:py-28/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(home).toContain("<section style={{ background: tint ? '#F3F8FC' : '#FFFFFF' }} data-testid={testId}>")
    expect(home).toContain('<section className="text-white" style={{ background: \'#1B1B3C\' }}>')
  })
  it('scroll-in is CSS-only and honours reduced motion (nothing waits for JavaScript to appear)', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*@supports \(animation-timeline: view\(\)\)/)
  })
  it('long Chinese runs without punctuation carry an explicit break point, never an emergency mid-word break (production check 2026-10-01: 「…维修工单 / ？先把…」「…申请 / 人？」)', () => {
    expect(home).toContain("'想接多伦多租房市场的\\u200b维修工单？先把资质核了。'")
    expect(home).toContain("'筛查报告会不会\\u200b一票否决申请人？'")
    // highlighted words never split across lines either
    expect(home).toContain('whitespace-nowrap" style={{ color: \'#00ACE4\' }}>每一步办完</em>')
    // the break point is layout-only: the FAQ structured data carries the plain question
    expect(home).toContain("name: pick(f.q, lang).replace(/\\u200b/g, '')")
  })
})
