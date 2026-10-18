// Site test 2026-10-17 · S3 fixes, group A.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eyebrowFor } from '../lib/ui/eyebrow'
import { systemBodyFor } from '../lib/threads/shared'
import { ONTARIO_RULES } from '../lib/ontario/rules'

const read = (p: string) => readFileSync(p, 'utf8')

describe('B-D2 · English eyebrows carry no Chinese', () => {
  it('eyebrowFor drops the Chinese parts in English only', () => {
    expect(eyebrowFor('TENANT · 租客 · AI 助理', 'en')).toBe('TENANT')
    expect(eyebrowFor('LEASING · 租前', 'en')).toBe('LEASING')
    expect(eyebrowFor('TENANT · 租客 · AI 助理', 'zh')).toBe('TENANT · 租客 · AI 助理')
  })
  it('the role landing, platform and services pages render through it', () => {
    expect(read('components/RoleLanding.tsx')).toContain('eyebrowFor(cfg.eyebrow, lang)')
    expect(read('app/platform/page.tsx')).toContain('eyebrowFor(st.eyebrow, lang)')
    expect(read('app/services/page.tsx')).toContain('eyebrowFor(a.eyebrow, lang)')
  })
})

describe('C-S3-2 · listing card amenity chips follow the language', () => {
  it('the card resolves amenities per language instead of printing the stored pair', () => {
    const src = read('app/listings/page.tsx')
    expect(src).toContain("resolveList('amenities', l.amenities, zh ? 'zh' : 'en')")
    expect(src).not.toContain('l.amenities.slice(0, 3)')
  })
})

describe('B-D4 · the home film avatar button has a name', () => {
  it('a non-openable avatar button still carries the agent name', () => {
    expect(read('components/agent/AgentChat.tsx')).toContain('`Open your AI Agent ${agentName}`) : agentName}')
  })
})

describe('O-D1 / O-D2 · privacy contact and consumer-rights footer link', () => {
  it('privacy section 5 lists privacy@stayloop.ai in both languages', () => {
    const src = read('app/privacy/page.tsx')
    expect(src.split('privacy@stayloop.ai').length - 1).toBeGreaterThanOrEqual(4)
  })
  it('the footer links /consumer-rights with a Chinese and English label', () => {
    expect(read('components/Footer.tsx')).toContain("{ key: 'foot.consumerRights', href: '/consumer-rights' }")
    const line = read('lib/i18n.tsx').split('\n').find((l) => l.includes("'foot.consumerRights'"))!
    expect(line).toContain('Consumer rights')
    expect(line).toContain('消费者权利')
  })
})

describe('C-S3-3 / D-S3-1 · tab titles follow the language', () => {
  it('/listings, /tenant/* and /apply set the title in an effect', () => {
    expect(read('components/DocTitle.tsx')).toContain('mo.observe(document.head')
    expect(read('app/listings/page.tsx')).toContain('<DocTitle zh="房源 · Stayloop" en="Listings · Stayloop" />')
    expect(read('app/tenant/layout.tsx')).toContain('<DocTitle')
    const apply = read('app/apply/[slug]/page.tsx')
    expect(apply).toContain('useDocTitle(zh ?')
    expect(apply).toContain('Apply${titleWhere')
  })
})

describe('D-A3 · gates give plain reasons', () => {
  it('neither gate blames the listing-data providers', () => {
    const pw = read('components/legal/PasswordAgeGate.tsx')
    expect(pw).not.toContain('房源数据提供方')
    expect(pw).not.toContain('listing-data providers')
    expect(pw).toContain('为了账号安全')
    expect(pw).toContain('For account security')
    const terms = read('components/legal/TermsConsentGate.tsx')
    expect(terms).not.toContain('please confirm the listing-data rules')
    expect(terms).not.toContain('数据规则要求')
    expect(terms).toContain('更新后的服务条款')
  })
})

describe('D-A5 · anonymous /agent/verify asks to sign in', () => {
  it('signed-out visitors get a sign-in link back to the page instead of the form', () => {
    const src = read('app/agent/verify/page.tsx')
    expect(src).toContain('agent-verify-signin')
    expect(src).toContain("encodeURIComponent('/agent/verify')")
    expect(src.indexOf('agent-verify-signin')).toBeLessThan(src.indexOf('RECO_REGISTER_URL} target'))
  })
})

describe('J-D6 · the post-dated cheque rule has an anchor on /rules', () => {
  it('a rule with an id exists for RTA s.108 (offerCheck should link /rules#RTA-108-post-dated-cheques)', () => {
    const r = ONTARIO_RULES.find((x) => x.id === 'RTA-108-post-dated-cheques')
    expect(r?.statute).toBe('RTA s.108')
  })
})

describe('M-D1 · admin usage counts days in Toronto', () => {
  it('the stats function cuts today and the daily series on America/Toronto', () => {
    const sql = read('supabase/migrations/20261018m_ai_usage_stats_toronto.sql')
    expect(sql).toContain("date_trunc('day', now() at time zone 'America/Toronto')")
    expect(sql).not.toContain("created_at >= date_trunc('day', now())")
  })
  it('the model id and the unpriced badge have a gap', () => {
    expect(read('app/admin/usage/page.tsx')).toContain('ml-2 inline-block text-[10px]')
  })
})

describe('I-D4 · the install nudge stays off the assistant page', () => {
  it('InstallHint hides on /agent routes', () => {
    const src = read('components/workspace/rail.tsx')
    expect(src).toContain('const onAgentPage = /\\/agent(\\/|$)/.test(usePathname()')
    expect(src).toContain('if (!show || onAgentPage) return null')
  })
})

describe('PrivateMemorySnapshot · no native confirm', () => {
  it('forgetting a memory uses the in-page two-step confirm', () => {
    const src = read('components/agent/PrivateMemorySnapshot.tsx')
    expect(src).not.toMatch(/\bconfirm\(/)
    expect(src).toContain('memory-forget-confirm')
  })
})

describe('H-D1 · system rows show one language', () => {
  it('systemBodyFor splits the stored pair', () => {
    expect(systemBodyFor('租客确认问题已解决 / Tenant confirmed the fix', false)).toBe('Tenant confirmed the fix')
    expect(systemBodyFor('租客确认问题已解决 / Tenant confirmed the fix', true)).toBe('租客确认问题已解决')
    expect(systemBodyFor('plain text / with slash', false)).toBe('plain text / with slash')
  })
  it('the conversation list preview and the thread system row use it', () => {
    expect(read('components/messages/MessageCenter.tsx')).toContain("systemBodyFor(r.last_body, zh)")
    expect(read('components/threads/ThreadPanel.tsx')).toContain('systemBodyFor(m.body, zh)')
  })
})
