// Guided intake for the quick-start cards (2026-09-27; design/guided-intake-2026-09.md).
// A card opens a step-by-step dialogue in the thread instead of dropping a
// 【…】 template into the composer. Guards: every card has an intake; every
// composed sentence is complete (no placeholder) and readable by the
// deterministic layers downstream (budget / bedrooms / pets parsers, the
// emergency detector); the card component behaves (auto-advance rules, the
// emergency note, the review + send).
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { INTAKES, composeIntake, fmtDate, fmtMoney, isAnswered, queryFor, type IntakeAnswers, type IntakeSpec } from '../lib/agent/intake'
import { hasUnfilledTemplate } from '../lib/agent/guardrail'
import { applyHardConstraints, bedsFromText, budgetFromText, petsFromText } from '../lib/agent/hardConstraints'
import { isEmergencyMaintenance } from '../lib/agent/maintenanceTriage'
import IntakeCard from '../components/agent/IntakeCard'

const read = (p: string) => readFileSync(p, 'utf8')
const LANGS = ['zh', 'en'] as const

/** first chip of every step + a typed value where the step has an input */
function fullAnswers(spec: IntakeSpec): IntakeAnswers {
  const a: IntakeAnswers = {}
  for (const s of spec.steps) {
    const picks = s.options?.length ? (s.multi ? s.options.slice(0, 2).map((o) => o.value) : [s.options[0].value]) : []
    const text = s.input === 'money' ? '2450' : s.input === 'date' ? '2026-11-01' : s.input === 'number' ? '650' : s.input ? 'typed detail' : ''
    a[s.key] = { picks, text }
  }
  return a
}
function requiredOnly(spec: IntakeSpec): IntakeAnswers {
  const a: IntakeAnswers = {}
  for (const s of spec.steps) {
    if (s.optional) continue
    a[s.key] = s.options?.length ? { picks: [s.options[0].value], text: '' } : { picks: [], text: s.input === 'money' ? '2000' : s.input === 'date' ? '2026-12-01' : 'x' }
  }
  return a
}

describe('every quick-start card has a guided intake and every intake is well-formed', () => {
  const chat = read('components/agent/AgentChat.tsx')
  const keys = [...chat.matchAll(/key: '(\w+)', icon:/g)].map((m) => m[1])
  it('14 cards → 14 intakes, no template left in the table', () => {
    expect(keys.length).toBe(14)
    for (const k of keys) expect(INTAKES[k], k).toBeTruthy()
    expect(new Set(keys).size).toBe(14)
    expect(chat.split('export default function AgentChat')[0]).not.toMatch(/template: \{ zh:/)
  })
  it('steps: ≥2 per intake, the first is required, bilingual strings, unique chip values, ≥2 chips where there are chips', () => {
    for (const spec of Object.values(INTAKES)) {
      expect(spec.steps.length, spec.id).toBeGreaterThanOrEqual(2)
      expect(spec.steps[0].optional, spec.id).toBeFalsy()
      expect(new Set(spec.steps.map((s) => s.key)).size).toBe(spec.steps.length)
      for (const l of LANGS) { expect(spec.title[l]).toBeTruthy(); expect(spec.outline[l]).toMatch(/\d/) }
      for (const s of spec.steps) {
        for (const l of LANGS) expect(s.ask[l], `${spec.id}.${s.key}`).toBeTruthy()
        if (s.options) {
          expect(s.options.length, `${spec.id}.${s.key}`).toBeGreaterThanOrEqual(2)
          expect(new Set(s.options.map((o) => o.value)).size).toBe(s.options.length)
          for (const o of s.options) for (const l of LANGS) expect(o.label[l]).toBeTruthy()
        }
        // a step must be answerable somehow
        expect(!!s.options?.length || !!s.input || !!s.attach, `${spec.id}.${s.key}`).toBe(true)
      }
      const outlineSteps = Number(/(\d+)/.exec(spec.outline.zh)?.[1])
      expect(outlineSteps, `${spec.id} outline count`).toBe(spec.steps.length)
    }
  })
  it('composed sentences are complete — never a placeholder, never empty — with all answers and with the required ones only, in both languages', () => {
    for (const spec of Object.values(INTAKES)) {
      for (const l of LANGS) {
        for (const a of [fullAnswers(spec), requiredOnly(spec)]) {
          const msg = composeIntake(spec, a, l, 0)
          expect(msg.length, `${spec.id}/${l}`).toBeGreaterThan(12)
          expect(hasUnfilledTemplate(msg), `${spec.id}/${l}: ${msg}`).toBe(false)
          expect(msg).not.toMatch(/undefined|null|\[object/)
        }
      }
    }
  })
  it('isAnswered: chips, text or (on an attach step) files; fmt helpers', () => {
    const s = INTAKES.repair.steps.find((x) => x.key === 'photos')!
    expect(isAnswered(s, undefined, 0)).toBe(false)
    expect(isAnswered(s, undefined, 1)).toBe(true)
    expect(isAnswered(INTAKES.repair.steps[0], { picks: [], text: '  ' })).toBe(false)
    expect(isAnswered(INTAKES.repair.steps[0], { picks: ['kitchen'], text: '' })).toBe(true)
    expect(fmtMoney('2450')).toBe('$2,450'); expect(fmtMoney('$2,450')).toBe('$2,450')
    expect(fmtDate('2026-11-01', 'zh', new Date('2026-09-27'))).toBe('11 月 1 日')
    expect(fmtDate('2027-03-31', 'en', new Date('2026-09-27'))).toBe('Mar 31, 2027')
  })
})

describe('the sentences feed the deterministic layers downstream', () => {
  it('find_home → budget / bedrooms / pets parsers read the sentence (zh + en); 不限 → no budget cap', () => {
    const spec = INTAKES.find_home
    const a: IntakeAnswers = { area: { picks: ['north_york'], text: '' }, budget: { picks: ['2500'], text: '' }, beds: { picks: ['b1d'], text: '' }, needs: { picks: ['pets', 'transit'], text: '' }, movein: { picks: [], text: '2026-11-01' } }
    for (const l of LANGS) {
      const msg = composeIntake(spec, a, l, 0)
      expect(budgetFromText(msg), msg).toBe(2500)
      expect(bedsFromText(msg), msg).toBe(1)
      expect(petsFromText(msg), msg).toBe(true)
      expect(msg).toContain(l === 'zh' ? '11 月 1 日' : 'Nov 1')
    }
    expect(bedsFromText(composeIntake(spec, { ...a, beds: { picks: ['studio'], text: '' } }, 'zh', 0))).toBe(0)
    expect(bedsFromText(composeIntake(spec, { ...a, beds: { picks: ['b3'], text: '' } }, 'en', 0))).toBe(3)
    expect(bedsFromText(composeIntake(spec, { ...a, beds: { picks: ['b3'], text: '' } }, 'zh', 0))).toBe(3)
    const typed = composeIntake(spec, { ...a, budget: { picks: [], text: '3100' } }, 'zh', 0)
    expect(budgetFromText(typed)).toBe(3100)
    const noCap = composeIntake(spec, { ...a, budget: { picks: ['nolimit'], text: '' } }, 'zh', 0)
    expect(applyHardConstraints(noCap, [], {}).constraints.no_budget_limit).toBe(true)
  })
  it('repair → an emergency choice yields the phrase the executor’s emergency detector reads, for every emergency kind', () => {
    const spec = INTAKES.repair
    for (const what of ['heat', 'leak', 'electrical', 'lock', 'gas']) {
      for (const l of LANGS) {
        const msg = composeIntake(spec, { where: { picks: ['kitchen'], text: '' }, what: { picks: [what], text: '' }, since: { picks: ['today'], text: '' }, urgency: { picks: ['emergency'], text: '' }, entry: { picks: ['anytime'], text: '' } }, l, 0)
        expect(isEmergencyMaintenance({ title: msg, description: '' }), `${what}/${l}: ${msg}`).toBe(true)
      }
    }
    // a non-emergency clog is not flagged
    const calm = composeIntake(spec, { where: { picks: ['bathroom'], text: '' }, what: { picks: ['clog'], text: '' }, since: { picks: ['this_week'], text: '' }, urgency: { picks: ['can_wait'], text: '' }, entry: { picks: ['call_first'], text: '' } }, 'zh', 0)
    expect(isEmergencyMaintenance({ title: calm, description: '' })).toBe(false)
    expect(calm).toContain('不急，可以等几天')
  })
  it('explain_lease keeps pasted clauses verbatim; the standard-lease choice changes the opening; attachments are mentioned', () => {
    const spec = INTAKES.explain_lease
    const pasted = composeIntake(spec, { source: { picks: ['paste'], text: '5. Tenant shall pay $500 pet deposit.' }, focus: { picks: ['deposit'], text: '' } }, 'zh', 0)
    expect(pasted).toContain('5. Tenant shall pay $500 pet deposit.')
    expect(pasted).toContain('押金与钥匙押金')
    expect(composeIntake(spec, { source: { picks: ['standard'], text: '' } }, 'zh', 0)).toMatch(/^我要签的是安省标准租约（2229E）/)
    expect(composeIntake(spec, { source: { picks: ['upload'], text: '' } }, 'en', 2)).toContain('(lease attached)')
  })
  it('landlord and agent intakes stay inside the rules: rent is context not a cut-off; the agent screening asks for the representation agreement and Form 410; no ranking "by quality"', () => {
    expect(INTAKES.screen.steps.find((s) => s.key === 'rent')!.hint!.zh).toContain('不是门槛')
    expect(INTAKES.agent_screen.steps.map((s) => s.key)).toEqual(['rep', 'consent', 'count'])
    expect(composeIntake(INTAKES.agent_screen, { rep: { picks: ['no'], text: '' }, consent: { picks: ['no'], text: '' } }, 'zh', 0)).toContain('还没签代表协议')
    const apps = composeIntake(INTAKES.applications, { scope: { picks: ['all'], text: '' }, order: { picks: ['complete'], text: '' } }, 'zh', 0)
    expect(apps).toContain('材料是否齐全'); expect(apps).not.toMatch(/质量|排名|rank/)
    expect(INTAKES.showing.steps.map((s) => s.key)).not.toContain('party') // never asks who the prospects are (OHRC)
    expect(composeIntake(INTAKES.renewal, { which: { picks: ['all'], text: '' }, intent: { picks: ['end'], text: '' } }, 'zh', 0)).toContain('N 表')
  })
  it('queryFor formats money and dates typed into inputs', () => {
    const q = queryFor(INTAKES.list, { rent: { picks: [], text: '2450' }, available: { picks: [], text: '2026-11-01' } }, 'zh', 0)
    expect(q.said('rent')).toBe('$2,450'); expect(q.said('available')).toBe('11 月 1 日')
  })
})

describe('IntakeCard behaviour (react-test-renderer)', () => {
  type Inst = ReturnType<TestRenderer.ReactTestRenderer['root']['findAllByProps']>[number]
  const byId = (root: TestRenderer.ReactTestInstance, id: string) => root.findAllByProps({ 'data-testid': id }).filter((n) => typeof n.type === 'string')
  const chip = (root: TestRenderer.ReactTestInstance, label: string) => byId(root, 'intake-chip').find((n) => String(n.props.children).includes(label))!
  const click = (n: Inst) => act(() => { n.props.onClick() })

  it('walks the repair intake: chips advance where nothing else is asked, the emergency note holds the step, the review shows the composed sentence and sends it', async () => {
    vi.useFakeTimers()
    const onSend = vi.fn(async (_m: string, _a?: unknown) => {})
    const onDraft = vi.fn(); const onClose = vi.fn()
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(React.createElement(IntakeCard, { spec: INTAKES.repair, lang: 'zh', accent: '#00ACE4', icon: '🔧', onSend, onDraft, onClose })) })
    const root = r.root
    const progress = () => String(byId(root, 'intake-progress')[0].props.children)
    expect(progress()).toContain('第 1 步')
    expect(progress()).toContain('共 7 步')
    // 1 where: has a text input → the chip does not auto-advance; Next does
    click(chip(root, '厨房')); expect(progress()).toContain('第 1 步')
    click(byId(root, 'intake-next')[0]); expect(progress()).toContain('第 2 步')
    // 2 what: chip + detail
    click(chip(root, '漏水'))
    act(() => { byId(root, 'intake-input')[0].props.onChange({ target: { value: '水槽下方滴水' } }) })
    click(byId(root, 'intake-next')[0]); expect(progress()).toContain('第 3 步')
    // 3 since
    click(chip(root, '昨天')); click(byId(root, 'intake-next')[0]); expect(progress()).toContain('第 4 步')
    // 4 urgency: the emergency chip shows its note and stays; a plain chip auto-advances
    click(chip(root, '紧急'))
    expect(byId(root, 'intake-danger-note').length).toBe(1)
    expect(String(byId(root, 'intake-danger-note')[0].props.children)).toContain('关总阀')
    expect(progress()).toContain('第 4 步')
    click(chip(root, '尽快'))
    act(() => { vi.advanceTimersByTime(200) })
    expect(progress()).toContain('第 5 步')
    // 5 entry: chips only → auto-advance
    click(chip(root, '先打电话约时间')); act(() => { vi.advanceTimersByTime(200) }); expect(progress()).toContain('第 6 步')
    // 6 pets (optional, has input) → pick + Next
    click(chip(root, '有猫')); click(byId(root, 'intake-next')[0]); expect(progress()).toContain('第 7 步')
    // 7 photos: optional attach → skip
    expect(byId(root, 'intake-attach').length).toBe(1)
    click(byId(root, 'intake-skip')[0])
    expect(progress()).toContain('最后一步')
    // summary chips of every answered step, clickable
    expect(byId(root, 'intake-summary').length).toBe(1)
    const review = byId(root, 'intake-review')[0]
    const ta = review.findByType('textarea')
    const sentence = String(ta.props.value)
    for (const s of ['厨房', '漏水 · 渗水', '水槽下方滴水', '从昨天开始', '希望尽快处理', '先打电话约时间', '家里有猫', '请整理成报修工单发给房东']) expect(sentence).toContain(s)
    expect(hasUnfilledTemplate(sentence)).toBe(false)
    await act(async () => { await byId(root, 'intake-send')[0].props.onClick() })
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend.mock.calls[0][0]).toBe(sentence)
    expect(onSend.mock.calls[0][1]).toBeUndefined()
    vi.useRealTimers()
  })
  it('a required step disables Next until answered; Back returns; "edit in the composer" hands the sentence to onDraft; Escape closes', () => {
    vi.useFakeTimers()
    const onSend = vi.fn(); const onDraft = vi.fn(); const onClose = vi.fn()
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(React.createElement(IntakeCard, { spec: INTAKES.stamps, lang: 'en', accent: '#00ACE4', onSend, onDraft, onClose })) })
    const root = r.root
    const progress = () => String(byId(root, 'intake-progress')[0].props.children)
    expect(byId(root, 'intake-next')[0].props.disabled).toBe(true)
    expect(byId(root, 'intake-skip').length).toBe(0) // required step: no skip
    click(chip(root, 'Income stamp'))
    act(() => { vi.advanceTimersByTime(200) }) // chips-only step auto-advances
    expect(progress()).toContain('Step 2 of 2')
    click(byId(root, 'intake-back')[0])
    expect(progress()).toContain('Step 1 of 2')
    click(byId(root, 'intake-next')[0]) // already answered → forward again
    expect(progress()).toContain('Step 2 of 2')
    click(byId(root, 'intake-skip')[0]) // optional "why" step
    expect(byId(root, 'intake-review').length).toBe(1)
    click(byId(root, 'intake-draft')[0])
    expect(onDraft).toHaveBeenCalledTimes(1)
    expect(onDraft.mock.calls[0][0]).toContain('Income stamp')
    act(() => { byId(root, 'intake-card')[0].props.onKeyDown({ key: 'Escape', stopPropagation() {} }) })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('wiring', () => {
  const chat = read('components/agent/AgentChat.tsx')
  it('the workspace page and the signed-in chat open the intake; the anonymous homepage demo still sends the example; the grid hides while a card is open; a new thread resets it', () => {
    expect(chat).toContain('const guided = live || hero')
    expect(chat).toMatch(/const spec = guided \? intakeFor\(s\.key\) : null; if \(spec\) setIntake\(\{ spec, icon: s\.icon \}\); else void onSend\(s\.prompt\[lang\]\)/)
    expect(chat).toContain('{messages.length <= 1 && !thinking && !threadLoading && !intake && (')
    expect(chat).toMatch(/setIntake\(null\)\s+setDecided\(\[\]\)/)
    expect(chat).toMatch(/if \(messages\.length > 1\) setIntake\(null\)/)
    expect(chat).toContain('<IntakeCard')
    expect(chat).toContain("onDraft={(text) => { setIntake(null); setChipDraft({ text, nonce: Date.now() }) }}")
    expect(chat).toMatch(/intakeFor\(s\.key\)!\.outline\[lang\]/) // the card subtitle is the step outline, not a placeholder string
    // V0.7 (2026-09-27): the homepage no longer hosts the conversation at all —
    // its example sentences open the assistant preview page, where the live
    // session decides between the guided card and the demo sentence.
    expect(read('components/home/HomeNext.tsx')).not.toContain('<AgentChat')
  })
  it('the card and the composer share one file reader and limits; inputs use .sl-input (≥16px on phones); a noted choice never auto-advances', () => {
    const card = read('components/agent/IntakeCard.tsx')
    const bar = read('components/agent/AgentInputBar.tsx')
    expect(card).toContain("from '@/lib/agent/attachments'"); expect(bar).toContain("from '@/lib/agent/attachments'")
    expect(bar).not.toMatch(/const MAX_BYTES|readAsDataURL/)
    expect(card).toMatch(/className=\{`sl-input w-full/)
    expect(card).toContain('if (picks.length && !step.input && !step.attach && !opt?.note) setTimeout(() => advance(a), 140)')
    for (const id of ['intake-card', 'intake-chip', 'intake-next', 'intake-back', 'intake-skip', 'intake-send', 'intake-draft', 'intake-close', 'intake-summary', 'intake-review', 'intake-danger-note']) expect(card).toContain(`data-testid="${id}"`)
  })
})
