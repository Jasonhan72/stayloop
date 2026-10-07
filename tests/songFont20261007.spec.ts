// 2026-10-07 user: 「中文字体改成宋体」→「标题用宋体，正文和工作台改回黑体」 — marketing-page headings
// (h1 / h2 on the public pages, .sl-type-head on the homepage) render Chinese in a Song face: the
// self-hosted Noto Serif SC (variable weight, 101 unicode-range chunks under public/fonts/noto-serif-sc/)
// first, then the system Song faces. Body text, the workspace and e-mails stay sans (PingFang / YaHei).
// Latin stays Inter Tight everywhere. No Google Fonts request at runtime.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const SONG = ['Noto Serif SC', 'Songti SC', 'STSong', 'SimSun']
const MARKETING = ['components/home/HomeNext.tsx', 'components/RoleLanding.tsx', 'app/pricing/page.tsx', 'app/about/page.tsx', 'app/services/page.tsx', 'app/platform/page.tsx', 'app/stayloop-api/page.tsx', 'app/stayloop-api/docs/page.tsx', 'app/rules/page.tsx', 'app/partners/page.tsx', 'app/contact/page.tsx', 'app/privacy/page.tsx', 'app/terms/page.tsx', 'app/screening/LandingBody.tsx', 'app/disputes/page.tsx', 'app/listings/page.tsx']

describe('宋体 for headings, 黑体 for everything else', () => {
  it('the body stack is sans; the serif stack and .sl-type-head carry the Song faces after Inter Tight', () => {
    const tw = read('tailwind.config.ts')
    const sans = tw.match(/sans: \[(.*)\]/)![1]
    const serif = tw.match(/serif: \[(.*)\]/)![1]
    expect(sans).toMatch(/Inter Tight.*PingFang SC.*Microsoft YaHei.*sans-serif/)
    expect(sans).not.toMatch(/Noto Serif|Songti/)
    const head = read('app/globals.css').match(/\.sl-type-head \{[^}]*?font-family: (.*);/)![1]
    for (const s of [serif, head]) {
      expect(s).toMatch(/^'?"?Inter Tight/)
      for (const f of SONG) expect(s).toContain(f)
      expect(s).not.toMatch(/PingFang|YaHei|sans-serif/)
      expect(s.trim()).toMatch(/serif'?$/)
    }
    const body = read('app/globals.css').match(/^\s*font-family: 'Inter Tight',.*$/m)![0]
    expect(body).toMatch(/PingFang SC.*sans-serif;$/)
  })
  it('every h1 / h2 on the public marketing pages is serif (font-serif or .sl-type-head); the workspace shell is not', () => {
    for (const p of MARKETING) {
      const src = read(p)
      const heads = Array.from(src.matchAll(/<h[12]\b([^>]*)>/g)).map((m) => m[1])
      expect(heads.length, p).toBeGreaterThan(0)
      for (const attrs of heads) {
        const viaConst = /className=\{/.test(attrs) && /sl-type-head/.test(src)
        expect(/font-serif|sl-type-head/.test(attrs) || viaConst, `${p}: <h?${attrs.slice(0, 80)}>`).toBe(true)
      }
    }
    for (const p of ['components/WorkspaceShell.tsx', 'components/agent/AgentChat.tsx', 'components/agent/AssistantPanel.tsx', 'app/h/[id]/page.tsx', 'components/messages/MessageCenter.tsx']) {
      expect(read(p), p).not.toMatch(/font-serif|sl-type-head/)
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
  it('e-mails stay sans (body text; mail clients load no web fonts)', () => {
    for (const p of ['lib/email.ts', 'lib/contact.ts']) expect(read(p)).not.toMatch(/Songti|Noto Serif|STSong|SimSun/)
  })
})
