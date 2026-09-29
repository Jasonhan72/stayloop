// 2026-09-28 · One name for the assistant across the whole site.
//
// The user settled it in three steps the same evening: the homepage's「三步开始」
// briefly said「个人 AI Agent」, then「还是改回 AI 助理吧，不叫个人 AI Agent，英文就叫
// AI Agent 吧」, then「全站都统一成 AI 助理 / AI Agent」. Until then the product
// called it 助手 / AI 助手 / AI 管家 / AI 租房助手 in Chinese and assistant / AI
// assistant / AI agent in English, and an unnamed assistant introduced itself
// as "AI Agent" in Chinese conversations.
//
// Code names stay as they are (the chat message role 'assistant', the
// assistant_profiles table, /api/assistant/*, AssistantPanel …); only what a
// person reads changed.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { displayAiName, genericAiName, isGenericAiName, GENERIC_AI_NAME } from '../lib/agent/assistantName'
import { buildSystemPrompt } from '../lib/agent/prompts'

const read = (p: string) => readFileSync(p, 'utf8')
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
const FILES = ['app', 'components', 'lib'].flatMap((d) => sources(d))
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line)
const SEG = /(['"`])((?:\\.|(?!\1).)*)\1/g
const CJK = /[㐀-鿿]/

function offending(test: (line: string, file: string) => boolean) {
  const hits: string[] = []
  for (const f of FILES) {
    read(f).split('\n').forEach((line, i) => {
      if (!isComment(line) && test(line, f)) hits.push(`${f}:${i + 1}`)
    })
  }
  return hits
}

describe('one name for the assistant — 中文「AI 助理」, English "AI Agent"', () => {
  it('no page, component or library still says 助手 / 管家 or「个人 AI Agent」', () => {
    expect(offending((l) => /助手|管家|个人 AI Agent/.test(l))).toEqual([])
  })

  it('Chinese copy never calls it "AI Agent"', () => {
    // the one allowed mention: the prompt telling the model its English self-name
    const allowed = (seg: string) => seg.includes('英文对话里自称「AI Agent」')
    // "AI Agent" inside Chinese text (next to a CJK character) — a bilingual string like the site
    // description may still carry it in its English half
    const inChinese = /[\u3400-\u9fff][^A-Za-z]{0,3}AI (?:Agent|AGENT)|AI (?:Agent|AGENT)[^A-Za-z]{0,3}[\u3400-\u9fff]/
    expect(offending((l) => [...l.matchAll(SEG)].some((m) => inChinese.test(m[2]) && !allowed(m[2])))).toEqual([])
  })

  it('English copy never calls it "assistant" or "AI agent"', () => {
    const hits = offending((l, f) => {
      if (f.endsWith('lib/agent/assistantProfile.ts')) return false // console log tags, not copy
      return [...l.matchAll(SEG)].some((m) => !CJK.test(m[2]) && m[2].includes(' ') && /\b[Aa]ssistants?\b|\bAI agents?\b|\bagent inbox\b/.test(m[2]))
    })
    expect(hits).toEqual([])
  })

  it('an unnamed assistant shows the label of the interface language; a real name is left alone', () => {
    expect(genericAiName('zh')).toBe('AI 助理')
    expect(genericAiName('en')).toBe('AI Agent')
    expect(displayAiName(null, 'zh')).toBe('AI 助理')
    expect(displayAiName(GENERIC_AI_NAME, 'zh')).toBe('AI 助理')
    expect(displayAiName('AI 助理', 'en')).toBe('AI Agent')
    expect(displayAiName(' Momo ', 'zh')).toBe('Momo')
    // both labels still mean "not named yet" to the code that decides whether to save a name
    for (const n of ['', '  ', 'AI Agent', 'AI 助理', null, undefined]) expect(isGenericAiName(n)).toBe(true)
    expect(isGenericAiName('Atlas')).toBe(false)
  })

  it('the prompt tells an unnamed assistant how to call itself, and keeps a real name', () => {
    const wf = { workflow_type: 'general', workflow_id: null, current_stage: 'idle', completed_steps: [], status: 'active' as const }
    const unnamed = buildSystemPrompt('tenant', GENERIC_AI_NAME, [], wf)
    expect(unnamed).toContain('中文对话里自称「AI 助理」，英文对话里自称「AI Agent」')
    expect(unnamed).not.toContain('你的名字是 AI Agent')
    expect(buildSystemPrompt('tenant', 'Momo', [], wf)).toContain('你的名字是 Momo')
  })

  it('the name hook, the workspace, the role pages and onboarding all go through displayAiName', () => {
    expect(read('lib/aiName.ts')).toMatch(/return displayAiName\(name, lang\)/)
    expect(read('components/agent/AgentWorkspacePage.tsx')).toMatch(/const shownName = displayAiName\(agent\.agent_name, lang\)/)
    expect(read('components/RoleLanding.tsx')).toMatch(/const agentName = displayAiName\(cfg\.agentName, lang\)/)
    expect(read('components/mobile/RolePages.tsx')).not.toMatch(/\$\{data\.agent\.agent_name\}/)
    expect(read('app/onboarding/name/page.tsx')).toMatch(/placeholder=\{genericAiName\(lang\)\}/)
    // both greeting paths (a fresh thread, and the preview/demo session) — the preview greeted Chinese visitors with「我是 AI Agent」
    expect(read('lib/agent/useAgentSession.ts').match(/greeting\(role, displayAiName\(/g)?.length).toBe(2)
  })
})
