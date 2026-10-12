// Four-role audit 2026-10-12 · group E (design/4role-audit-fix-plan-2026-10-12.md
// P2-1, P2-2 and the「文案 minor」items).
//
// P2-1  outside the frozen screening module, copy says「四项计分，报告另列不计分的
//       『申请完整度与沟通』」(four scored items plus an unscored completeness note),
//       never「四项评分 / 四项打分 / four scored areas / four scores」.
// P2-2  every intake card's outline count comes from `steps.length`; the pricing
//       card walked step by step never skips「卖点」; a stale auto-advance timer
//       can never move the card after the user has already moved on.
// minor auditActionLabel covers every action the routes / triggers write;
//       the composer's aria-label follows the UI language.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { INTAKES, withStepCount, type IntakeSpec } from '../lib/agent/intake'
import { auditActionLabel } from '../lib/agent/ideas'
import IntakeCard from '../components/agent/IntakeCard'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('P2-1 · four scored items + one unscored note (copy outside the screening module)', () => {
  const FILES = [
    'components/landlord/ApplicantReport.tsx',
    'components/landlord/LandlordThreeSteps.tsx',
    'app/landlord/page.tsx',
    'app/agent/clients/page.tsx',
    'app/admin/models/page.tsx',
  ]
  it('no file still says 四项评分 / 四项打分 / four scored areas / four scores', () => {
    for (const f of FILES) {
      const s = code(f)
      expect(s, f).not.toMatch(/四项评分|四项打分|four scored areas|four scores\b/)
    }
  })
  it('each file names the unscored「申请完整度与沟通」note next to the four scored items', () => {
    for (const f of FILES) {
      const s = code(f)
      expect(s, f).toMatch(/四项计分/)
      expect(s, f).toMatch(/不计分的『申请完整度与沟通』|一项提示/)
      expect(s, f).toMatch(/[Ff]our scored items/)
    }
    // the sample report header and the marketing chip carry the exact phrase
    expect(read('components/landlord/ApplicantReport.tsx')).toContain('四项计分，报告另列不计分的『申请完整度与沟通』')
    expect(read('components/landlord/ApplicantReport.tsx')).toContain('Four scored items, plus an unscored application-completeness note')
    expect(read('app/landlord/page.tsx')).toContain("{ zh: '四项计分 + 一项提示 · 每条结论标出处', en: 'Four scored items + one note · every conclusion sourced' }")
  })
})

describe('P2-2 · intake outline counts come from steps.length', () => {
  it('every intake outline starts with its real step count in both languages', () => {
    for (const spec of Object.values(INTAKES)) {
      const n = spec.steps.length
      expect(spec.outline.zh, spec.id).toMatch(new RegExp(`^${n} 步 · `))
      expect(spec.outline.en, spec.id).toMatch(new RegExp(`^${n} steps · `))
      expect(Number(/^(\d+)/.exec(spec.outline.zh)?.[1]), `${spec.id} zh`).toBe(n)
      expect(Number(/^(\d+)/.exec(spec.outline.en)?.[1]), `${spec.id} en`).toBe(n)
    }
  })
  it('withStepCount is the only place the number is written — a hand-written count is replaced, not doubled', () => {
    const src = read('lib/agent/intake.ts')
    expect(src).not.toMatch(/outline: \{ zh: '\d+ 步 · /)
    expect(src).not.toMatch(/en: '\d+ steps · /)
    const fake: IntakeSpec = { ...INTAKES.pricing, outline: { zh: '9 步 · 区域', en: '9 steps · area' } }
    const fixed = withStepCount(fake)
    expect(fixed.outline.zh).toBe(`${fake.steps.length} 步 · 区域`)
    expect(fixed.outline.en).toBe(`${fake.steps.length} steps · area`)
    expect(fake.steps.length).toBe(5)
  })
})

describe('P2-2 · the pricing card never skips「卖点」(react-test-renderer)', () => {
  type Inst = ReturnType<TestRenderer.ReactTestRenderer['root']['findAllByProps']>[number]
  const byId = (root: TestRenderer.ReactTestInstance, id: string) => root.findAllByProps({ 'data-testid': id }).filter((n) => typeof n.type === 'string')
  const chip = (root: TestRenderer.ReactTestInstance, label: string) => byId(root, 'intake-chip').find((n) => String(n.props.children).includes(label))!
  const click = (n: Inst) => act(() => { n.props.onClick() })
  const mount = () => {
    const onSend = vi.fn(async () => {}); const onDraft = vi.fn(); const onClose = vi.fn()
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(React.createElement(IntakeCard, { spec: INTAKES.pricing, lang: 'zh', accent: '#2563EB', icon: '📈', onSend, onDraft, onClose })) })
    const root = r.root
    const progress = () => String(byId(root, 'intake-progress')[0].props.children)
    const page = () => JSON.stringify(r.toJSON())
    return { r, root, progress, page, onSend }
  }
  /** what a browser does on Enter over a focused <button>: keydown bubbles to the card, then the default click */
  const enterOnChip = (root: TestRenderer.ReactTestInstance, n: Inst) => {
    act(() => { byId(root, 'intake-card')[0].props.onKeyDown({ key: 'Enter', stopPropagation() {}, preventDefault() {} }) })
    click(n)
  }

  it('area (typed + Enter) → type (chip) → beds (chip) lands on 卖点, not 目标入住日', () => {
    vi.useFakeTimers()
    const { root, progress, page } = mount()
    expect(progress()).toContain('第 1 步'); expect(progress()).toContain('共 5 步')
    // 1 area: chips + a text input → typing and Enter moves on (chips never auto-advance here)
    act(() => { byId(root, 'intake-input')[0].props.onChange({ target: { value: 'Yonge & Eglinton' } }) })
    act(() => { byId(root, 'intake-input')[0].props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} }) })
    expect(progress()).toContain('第 2 步')
    // 2 type: single choice, nothing else asked → auto-advance after 140 ms, exactly one step
    click(chip(root, '公寓'))
    expect(progress()).toContain('第 2 步')
    act(() => { vi.advanceTimersByTime(200) })
    expect(progress()).toContain('第 3 步')
    // 3 beds: same
    click(chip(root, '1 房'))
    act(() => { vi.advanceTimersByTime(200) })
    expect(progress()).toContain('第 4 步')
    expect(page()).toContain('卖点？（可多选）')
    expect(page()).not.toContain('目标入住日')
    // 4 features is multi + optional → chips never auto-advance; a long wait changes nothing
    click(chip(root, '阳台'))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(progress()).toContain('第 4 步')
    click(byId(root, 'intake-next')[0])
    expect(progress()).toContain('第 5 步')
    expect(page()).toContain('目标入住日')
    vi.useRealTimers()
  })

  it('keyboard Enter on a focused chip advances exactly once (keydown + default click, then the timer)', () => {
    vi.useFakeTimers()
    const { root, progress, page } = mount()
    act(() => { byId(root, 'intake-input')[0].props.onChange({ target: { value: 'Liberty Village' } }) })
    click(byId(root, 'intake-next')[0])
    expect(progress()).toContain('第 2 步')
    enterOnChip(root, chip(root, '联排'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(progress()).toContain('第 3 步')
    enterOnChip(root, chip(root, '2 房'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(progress()).toContain('第 4 步')
    expect(page()).toContain('卖点？（可多选）')
    vi.useRealTimers()
  })

  it('a chip tap followed by Next / Enter inside the 140 ms window still moves one step, and Back inside the window is not overridden by the stale timer', () => {
    vi.useFakeTimers()
    const { root, progress } = mount()
    act(() => { byId(root, 'intake-input')[0].props.onChange({ target: { value: 'Liberty Village' } }) })
    click(byId(root, 'intake-next')[0])
    expect(progress()).toContain('第 2 步')
    // tap the chip, then hit Next before the auto-advance fires → one step, not two
    click(chip(root, '独立屋'))
    click(byId(root, 'intake-next')[0])
    expect(progress()).toContain('第 3 步')
    act(() => { vi.advanceTimersByTime(500) })
    expect(progress()).toContain('第 3 步')
    // tap a chip, then Back before the timer fires → the user stays where they went (step 2),
    // the stale timer must not throw them to step 4
    click(chip(root, '3 房及以上'))
    click(byId(root, 'intake-back')[0])
    expect(progress()).toContain('第 2 步')
    act(() => { vi.advanceTimersByTime(500) })
    expect(progress()).toContain('第 2 步')
    vi.useRealTimers()
  })
})

describe('minor · audit labels and the composer aria-label', () => {
  it('every audit action written by routes, pages and triggers has a zh/en label (no raw snake_case shown)', () => {
    const written = [
      'terms_confirmation_emailed', 'terms_accepted', 'password_renewed', 'listing_viewed', 'listings_searched',
      'application_file_viewed', 'application_file_downloaded', 'thread_attachment_viewed', 'thread_attachment_downloaded',
      'marketplace_config_changed', 'trust_api_key_created', 'trust_api_key_updated',
      'provider_verified', 'provider_rejected', 'provider_suspended', 'provider_expired',
      'hat_activated', 'delegation_expired', 'delegation_proposed', 'delegation_confirmed', 'delegation_revoked', 'delegation_link_resent',
      'lease_signed_tenant', 'lease_signed_landlord', 'tenant_agent_turn', 'landlord_agent_turn', 'agent_agent_turn',
    ]
    for (const a of written) {
      for (const lang of ['zh', 'en'] as const) {
        const label = auditActionLabel(a, lang)
        expect(label, `${a} ${lang}`).not.toBe(a.replace(/_/g, ' '))
        if (lang === 'zh') expect(label, a).toMatch(/[一-鿿]/)
      }
    }
    expect(auditActionLabel('terms_confirmation_emailed', 'zh')).toBe('已给你发了服务条款确认邮件')
    expect(auditActionLabel('hat_activated', 'zh', { hat: 'landlord' })).toBe('开通了房东身份')
    expect(auditActionLabel('hat_activated', 'en', { hat: 'provider' })).toBe('Activated the provider role')
    // the route really writes the action the label covers
    expect(read('app/api/legal/terms-confirmation/route.ts')).toContain("action: 'terms_confirmation_emailed'")
  })
  it('the composer aria-label follows the UI language', () => {
    const bar = read('components/agent/AgentInputBar.tsx')
    expect(bar).toContain("aria-label={lang === 'zh' ? `给 ${agentName} 发消息` : `Message ${agentName}`}")
    expect(bar).not.toContain('aria-label={`Message ${agentName}`}')
  })
})
