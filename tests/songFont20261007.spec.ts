// 2026-10-07 user: 「中文字体改成宋体」 — Chinese text renders in a Song (serif) face site-wide: the
// self-hosted Noto Serif SC (variable weight, 101 unicode-range chunks under public/fonts/noto-serif-sc/)
// first, then the system Song faces. Latin stays Inter Tight. No Google Fonts request at runtime.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const SONG = ['Noto Serif SC', 'Songti SC', 'STSong', 'SimSun']

describe('Chinese in 宋体', () => {
  it('the Tailwind and global font stacks put the Song faces right after Inter Tight and end in serif', () => {
    const tw = read('tailwind.config.ts').match(/sans: \[(.*)\]/)![1]
    const css = read('app/globals.css').match(/^\s*font-family: 'Inter Tight',.*$/m)![0]
    for (const s of [tw, css]) {
      expect(s).toMatch(/Inter Tight/)
      for (const f of SONG) expect(s).toContain(f)
      expect(s.indexOf('Noto Serif SC')).toBeGreaterThan(s.indexOf('Inter Tight'))
      expect(s).not.toMatch(/PingFang|YaHei|sans-serif/)
      expect(s.trim()).toMatch(/serif'?\]?,?;?$/)
    }
  })
  it('Noto Serif SC is self-hosted: the stylesheet is linked from the layout, every chunk exists, nothing points at Google', () => {
    expect(read('app/layout.tsx')).toContain('<link rel="stylesheet" href="/fonts/noto-serif-sc.css" />')
    const css = read('public/fonts/noto-serif-sc.css')
    expect(css).not.toMatch(/gstatic|googleapis/)
    expect(css).toContain("font-family: 'Noto Serif SC'")
    expect(css).toContain('font-weight: 200 900')
    expect(css).toContain('font-display: swap')
    const urls = Array.from(css.matchAll(/url\((\/fonts\/noto-serif-sc\/[^)]+)\)/g)).map((m) => m[1])
    expect(urls.length).toBeGreaterThanOrEqual(90)
    for (const u of urls) { const p = `public${u}`; expect(existsSync(p), p).toBe(true); expect(statSync(p).size).toBeGreaterThan(500) }
    expect(readdirSync('public/fonts/noto-serif-sc').length).toBe(urls.length)
  })
  it('e-mails name the system Song faces for Chinese (mail clients load no web fonts)', () => {
    for (const p of ['lib/email.ts', 'lib/contact.ts']) {
      const src = read(p)
      expect(src).not.toMatch(/PingFang/)
      expect(src.match(/font-family:[^;"]*sans-serif/g) ?? []).toEqual([])
      expect(src).toContain("'Songti SC','STSong','SimSun',serif")
    }
  })
})
