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

describe('sections', () => {
  it('headings are 40px / 700, never extra-bold', () => {
    expect(home).not.toContain('font-extrabold')
    expect((home.match(/sm:text-\[40px\]/g) ?? []).length).toBeGreaterThanOrEqual(6)
  })
  it('64 / 96px padding and alternating full-width bands (roles + FAQ tinted, live numbers dark)', () => {
    expect((home.match(/py-16 sm:px-7 sm:py-24/g) ?? []).length).toBeGreaterThanOrEqual(6)
    expect(home).toContain('<section id="roles" style={{ background: \'#F3F8FC\' }}>')
    expect(home).toContain('<section id="faq" style={{ background: \'#F3F8FC\' }}>')
    expect(home).toContain('<section className="text-white" style={{ background: \'#1B1B3C\' }}>')
  })
})
