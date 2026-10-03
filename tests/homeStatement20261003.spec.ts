// 2026-10-03 user on the homepage statement (second screen): 「把特定的安省去掉，因为可能马上会加上其他省份」,
// then 「话语太长了，要剪短一点，专业一点的术语」, then 「这个话要的，Stayloop 用 AI 把租房的每一步办完：找房、筛查、
// 租约、维修、续约。」, then 「还要加帮助管理物业，租金催收，法律协助，等等租房方方面面。这个话也要再重新整理一下的。」
// Guards: the user's opening clause, the whole-rental list by stage, the safeguards in professional terms (and
// no overclaiming: rent reminders, not collection; rules, not legal services), no province name, no 成语 /
// 文言 / marketing words, and break points so no clause splits mid-word on a phone.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const home = readFileSync('components/home/HomeNext.tsx', 'utf8')
// only the rendered copy (the code comment above it quotes the user's request, which names the province)
const start = home.indexOf('? <><Seg>Stayloop 用 AI')
const block = home.slice(start, home.indexOf('</p>', start))
const zh = block.slice(0, block.indexOf('\n'))
const visibleZh = zh.replace(/<\/?Seg>/g, '').replace(/\{ZW\}/g, '').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').replace(/^\? <>/, '')

describe('homepage statement', () => {
  it('opens with the clause the user kept, then the whole rental by stage', () => {
    expect(visibleZh.startsWith('Stayloop 用 AI 把租房的每一步办完：找房、筛查、签约，入住后的物业管理、维修、催租，到期续约，全程按当地法规把关。')).toBe(true)
    expect(block).toContain('>每一步办完</em>')
    expect(block).toContain('>get every step of renting done</em>: search, screening and signing; property management, repairs and rent reminders')
  })
  it('does not overclaim: reminders not collection, rules not a legal service', () => {
    expect(block).not.toMatch(/催收|法律协助|法律服务|代收|收租|legal (?:services|advice|aid)|collect/i)
  })
  it('stays compact (the 95-character conversational version was too long)', () => {
    // counted in JS characters: every Latin letter and space counts, so "Stayloop 用 AI " alone is 14
    expect(visibleZh.length).toBeLessThanOrEqual(96)
  })
  it('names no province and no Ontario statute', () => {
    expect(block).not.toMatch(/安省|Ontario|RTA|LTB|OHRC/)
    expect(block).toContain('全程按当地法规把关')
    expect(block).toContain('checked against local tenancy rules')
  })
  it('the safeguards in professional terms', () => {
    expect(block).toContain('>须经你审批</em>')
    expect(visibleZh).toContain('涉及他人的操作须经你审批，沟通经平台中转，记录不可删改。')
    expect(block).toContain('>require your approval</em>')
    expect(block).toContain('records can’t be edited or deleted')
  })
  it('professional, not literary or salesy (the 2026-10-02 literary rewrite was rejected)', () => {
    expect(block).not.toMatch(/诸事|托付|归它|定夺|有法可依|皆可为凭|一站式|全方位|赋能|智能化|凡|均需|tamper-proof/)
    expect(block).not.toMatch(/助手|管家|assistant/)
  })
  it('clauses break only at the marked boundaries below md', () => {
    expect(home).toContain(`const ZW = <span className="md:hidden">{'\\u200b'}</span>`)
    expect(zh).toContain('把租房的{ZW}')
    expect(zh).toContain('涉及他人的操作{ZW}')
    expect(zh).toContain('入住后的{ZW}物业管理')
    // from md up each group stays on one line, so the list never wraps mid-stage on a desktop
    expect(home).toContain('<span className="md:whitespace-nowrap">{children}</span>')
    expect(zh).toContain('<Seg>找房、筛查、签约，</Seg><Seg>入住后的{ZW}物业管理、维修、催租，</Seg><Seg>到期续约，全程按当地法规把关。</Seg>')
  })
})
