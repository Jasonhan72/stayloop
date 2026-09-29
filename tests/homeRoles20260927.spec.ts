// Homepage structure pass (2026-09-27): Muse's structural advice adopted, its
// HTML rejected. Four roles (the provider network is live, in pilot), a
// role → module map of real pages, a sliding selected-tab pill without spring,
// and a FAQ whose answers name only what ships (also emitted as FAQPage JSON-LD).
// No pricing block, no palette change, no scripted-chat-as-if-live, no floating
// notices. Updated the same day for V0.7 (marketing + login homepage): the
// example sentences open the assistant preview instead of a hero conversation,
// and the FAQ opens with「不登录能试吗？」.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

const home = readFileSync('components/home/HomeNext.tsx', 'utf8')

describe('four roles on the homepage', () => {
  it('provider is the fourth tab: pilot tag, facts instead of chips, real entry points; the heading says four', () => {
    expect(home).toMatch(/key: 'provider',\s*pilot: true,\s*tag: \{ zh: '服务商', en: 'Provider' \}/)
    expect(home).toContain("href: '/provider/onboard'")
    expect(home).toMatch(/chips: \[\],\s*facts: \[/)
    expect(home).toContain("{zh ? '试点' : 'PILOT'}")
    expect(home).toContain("{zh ? '四种身份，各自的入口' : 'Four roles, each with its own entry'}")
    expect(home).not.toContain('三种角色')
    // the four landing tiles under the hero name the provider's real destination (a work-order desk, not an assistant)
    expect(home).toMatch(/key: 'provider', pilot: true, who: \{ zh: '服务商'[^\n]*to: \{ zh: '工单工作台'/)
  })
  it('every role maps to exactly three modules and every module opens a real page', () => {
    const blocks = [...home.matchAll(/modules: \[([\s\S]*?)\n    \],/g)].map((m) => m[1])
    expect(blocks.length).toBe(4)
    for (const b of blocks) {
      const hrefs = [...b.matchAll(/href: '([^']+)'/g)].map((m) => m[1])
      expect(hrefs.length).toBe(3)
      for (const h of hrefs) {
        expect(h.startsWith('/')).toBe(true)
        expect(existsSync(`app${h}/page.tsx`), h).toBe(true)
      }
    }
    expect(home).toContain('data-testid="role-modules"')
  })
  it('the example sentences open the role’s assistant preview (V0.7) — one helper spells the URL', () => {
    expect(home).toContain('assistantPromptHref(chatRole, pick(c.prompt, lang))')
    expect(home).not.toContain('点一下就发到上面的对话里')
    expect(home).toContain("'试一试 · 打开助手预览，不用登录'")
  })
  it('the copy names only what ships: no invented features, no "coming soon" for a live pilot, no vendor-only model claim', () => {
    for (const bad of ['在线收租', '自动对账', '佣金对账', '短信', '路线规划', '工单大厅', '在线结算', '即将上线', '内测邀约', '14 天', '$39', '82/100', 'Anthropic Claude']) expect(home, bad).not.toContain(bad)
    expect(home).toContain('Claude · GPT · Gemini')
    for (const fact of ['试点阶段 · 多伦多及周边', '付款线下 · Stayloop 不经手资金', '没有公开目录']) expect(home).toContain(fact)
  })
  it('the selected tab is one pill that slides — eased, no spring — and the first frame paints the active button itself', () => {
    expect(home).toContain("transition: 'left .25s ease, top .25s ease, width .25s ease'")
    expect(home).not.toMatch(/cubic-bezier\([^)]*1\.[2-9]\)/)
    expect(home).toContain("background: ind ? 'transparent' : '#1B1B3C'")
    expect(home).toContain('data-testid="role-tab-indicator"')
    expect(home).toContain('role="tablist"')
  })
})

describe('homepage FAQ', () => {
  it('six bilingual questions, each linking to the page that backs the answer, emitted as FAQPage JSON-LD; the first says where to try without an account', () => {
    const block = home.slice(home.indexOf('const FAQ:'), home.indexOf('export default function HomeNext'))
    const qs = [...block.matchAll(/q: \{ zh: '([^']+)', en: '([^']+)' \}/g)]
    expect(qs.length).toBe(6)
    expect(qs[0][1]).toBe('不登录能试吗？')
    const hrefs = [...block.matchAll(/href: '([^']+)', more:/g)].map((m) => m[1])
    expect(hrefs).toEqual(['/tenant/agent', '/listings', '/screening', '/platform', '/privacy', '/services'])
    for (const h of hrefs) expect(existsSync(`app${h}/page.tsx`), h).toBe(true)
    expect(home).toContain("'@type': 'FAQPage'")
    expect(home).toContain('<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />')
    expect(home).toContain('data-testid="home-faq"')
    // the facts the answers rest on — each one is a shipped, checkable behaviour
    for (const s of ['60 秒可撤销', 'OHRC 租房政策', 's.10(7)', 'AWS 蒙特利尔', '不抽成、不经手资金', 'TRREB 数据库尚未接入', '每小时有次数上限']) expect(block, s).toContain(s)
    // never a pricing claim in the FAQ (pricing has one source: /pricing)
    expect(block).not.toMatch(/\$\d|每月|per month/)
  })
  it('the section order is hero → landing map → how it works → propose/decide → flow → roles → rules → steps → numbers → FAQ → final', () => {
    const order = ['HERO: message + login card', 'LANDING MAP', 'HOW IT WORKS', 'PROPOSE / DECIDE', 'PRODUCTS: one flow', 'ROLES', 'RULES', 'STEPS', 'VERIFY: live numbers', 'FAQ', 'FINAL'].map((k) => home.indexOf(`{/* ================= ${k}`))
    for (const i of order) expect(i).toBeGreaterThan(-1)
    for (let i = 1; i < order.length; i++) expect(order[i], String(i)).toBeGreaterThan(order[i - 1])
  })
})
