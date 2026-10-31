import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Site test 2026-10-28 — the four items the Go decision (2026-10-29) carried over, pinned here.
const read = (p: string) => readFileSync(p, 'utf8')

describe('C-D4 · 不存在的房源页是真 404', () => {
  const layout = read('app/listings/[slug]/layout.tsx')
  it('布局在服务端查 slug，查不到就 notFound()（客户端壳设不了状态码）', () => {
    expect(layout).toContain("import { notFound } from 'next/navigation'")
    expect(layout).toMatch(/export default async function ListingDetailLayout\(\{ children, params \}/)
    expect(layout).toContain("if ((await activeSlugExists(slug)) === false) notFound()")
  })
  it('查询失败 / 没有环境变量时不 404（返回 null，交给客户端）', () => {
    expect(layout).toContain('if (!url || !key || !slug || slug.length > 200) return null')
    expect(layout).toContain('if (error) return null')
  })
  it('路由审计把未知 slug 钉成 404', () => {
    expect(read('scripts/route-audit.mjs')).toContain("`${BASE}/listings/no-such-slug-xyz?${bust()}`, {}, { status: 404 })")
  })
})

describe('B-D2 · 触屏宽度（含 iPad 竖屏）文本控件 ≥16px', () => {
  it('globals.css 的 16px 规则覆盖到 1023px', () => {
    const css = read('app/globals.css')
    const block = css.match(/@media\s*\(max-width:\s*1023px\)\s*\{[\s\S]*?\n\}/)
    expect(block).not.toBeNull()
    expect(block![0]).toMatch(/font-size:\s*16px\s*!important/)
    expect(css).not.toMatch(/@media\s*\(max-width:\s*767px\)\s*\{\s*\n\s*input:not/)
  })
})

describe('D-X1 · 跳过起名也算走过起名页', () => {
  it('起名页「跳过」写一行空名字的 assistant_profiles，并让缓存失效', () => {
    const page = read('app/onboarding/name/page.tsx')
    expect(page).toContain("import { markAssistantOnboarded, saveAssistantName } from '@/lib/agent/assistantProfile'")
    expect(page).toContain('isGenericAiName(chosen) ? markAssistantOnboarded(supabase, user.id) : saveAssistantName(supabase, user.id, chosen)).then(() => invalidateAiName())')
  })
  it('markAssistantOnboarded 只补行不覆盖（ignoreDuplicates）', () => {
    expect(read('lib/agent/assistantProfile.ts')).toContain("upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })")
  })
  it('resolveAccountName 带回 onboarded（有行即算），首页与 useOnboarded 都认', () => {
    const ai = read('lib/aiName.ts')
    expect(ai).toContain('onboarded: !!profile')
    expect(read('components/home/HomeNext.tsx')).toContain('setNamed(u === uid && (!!name || onboarded))')
    expect(read('lib/useOnboarding.ts')).toContain('(name || onboarded)) setNamed(true)')
  })
  it('回填迁移只插不改', () => {
    const sql = read('supabase/migrations/20261029_assistant_profiles_onboarded_backfill.sql')
    expect(sql).toContain('on conflict (user_id) do nothing')
    expect(sql).not.toMatch(/\b(update|delete)\b/i)
  })
})

describe('T6-D14 · 构建期依赖的 npm audit 高危已消化', () => {
  const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, { version: string }> }
  const ge = (v: string, min: string) => { const a = v.split('.').map(Number), b = min.split('.').map(Number); for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i] } return true }
  it('nanoid ≥ 3.3.18（GHSA-2v37-7h3g-55p8）', () => {
    expect(ge(lock.packages['node_modules/nanoid'].version, '3.3.18')).toBe(true)
  })
  it('source-map-js ≥ 1.2.2（GHSA-68fv-2mgg-jv7q）', () => {
    expect(ge(lock.packages['node_modules/source-map-js'].version, '1.2.2')).toBe(true)
  })
})
