// 2026-10-03 user on the homepage statement (second screen): 「把特定的安省去掉，因为可能马上会加上其他省份」,
// then 「话语太长了，要剪短一点，专业一点的术语」. Drafted and judged twice (plain-but-professional tone, facts,
// length). Guards: short, no province name, the four strengths, professional terms without 成语 / 文言 /
// marketing words, and break points so no clause splits mid-word on a phone.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const home = readFileSync('components/home/HomeNext.tsx', 'utf8')
// only the rendered copy (the code comment above it quotes the user's request, which names the province)
const start = home.indexOf('? <>每位用户')
const block = home.slice(start, home.indexOf('</p>', start))
const zh = block.slice(0, block.indexOf('\n'))
const visibleZh = zh.replace(/\{ZW\}/g, '').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').replace(/^\? <>/, '')

describe('homepage statement', () => {
  it('is short: about half its 95-character predecessor', () => {
    expect(visibleZh.length).toBeLessThanOrEqual(58)
  })
  it('names no province and no Ontario statute', () => {
    expect(block).not.toMatch(/安省|Ontario|RTA|LTB|OHRC/)
    expect(block).toContain('按当地法规校验')
    expect(block).toContain('local tenancy rules')
  })
  it('carries the four strengths in professional terms', () => {
    expect(visibleZh).toContain('每位用户配备专属 AI 助理。')
    expect(block).toContain('>须经你审批</em>')
    expect(visibleZh).toContain('房源与租约按当地法规校验')
    expect(visibleZh).toContain('沟通经平台中转')
    expect(block).toContain('>记录不可删改</em>')
    expect(block).toContain('>require your approval</em>')
    expect(block).toContain('>records can’t be edited or deleted</em>')
  })
  it('professional, not literary or salesy (the 2026-10-02 literary rewrite was rejected)', () => {
    expect(block).not.toMatch(/诸事|托付|归它|定夺|有法可依|皆可为凭|一站式|全方位|赋能|智能化|凡|均需|tamper-proof/)
    expect(block).not.toMatch(/助手|管家|assistant/)
  })
  it('clauses break only at the marked boundaries below md, and never inside "AI 助理"', () => {
    expect(home).toContain(`const ZW = <span className="md:hidden">{'\\u200b'}</span>`)
    expect(zh).toContain('专属&nbsp;AI&nbsp;助理')
    expect(block).toContain('dedicated AI&nbsp;Agent.')
    expect(zh).toContain('涉及他人的操作{ZW}')
    expect(zh).toContain('房源与租约{ZW}按当地法规校验')
  })
})
