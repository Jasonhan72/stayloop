// 2026-10-03 user on the homepage statement (second screen): 「这段还是要再改的通顺一点，要讲出平台的所有优点，
// 同时，把特定的安省去掉，因为可能马上会加上其他省份」. Drafted by four writers, judged for plain spoken
// Chinese, facts and fit. Guards: no province name, the strengths it now carries, plain words only, and
// explicit break points so the long runs never split mid-word on a phone.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const home = readFileSync('components/home/HomeNext.tsx', 'utf8')
// only the rendered copy (the code comment above it quotes the user's request, which names the province)
const start = home.indexOf('? <>不管你是租客')
const block = home.slice(start, home.indexOf('</p>', start))

describe('homepage statement', () => {
  it('names no province and no Ontario statute', () => {
    expect(block).not.toMatch(/安省|Ontario|RTA|LTB|OHRC/)
    expect(block).toContain('当地的')
    expect(block).toContain('local rental rules')
  })
  it('carries the strengths the hero line does not: one AI Agent per person, your approval, local rules, one thread, undeletable messages', () => {
    expect(block).toContain('不管你是租客、房东还是经纪，Stayloop&nbsp;都给你配一个 AI&nbsp;助理。')
    expect(block).toContain('>你点头才去办</em>')
    expect(block).toContain('租房规定查一遍')
    expect(block).toContain('在一个对话里商量，不用互留联系方式')
    expect(block).toContain('>一条也删不掉</em>')
    expect(block).toContain('>acts only once you say yes</em>')
    expect(block).toContain('>nothing said can be deleted</em>')
  })
  it('stays in plain spoken Chinese (the 2026-10-02 literary rewrite was rejected)', () => {
    expect(block).not.toMatch(/诸事|托付|归它|定夺|有法可依|皆可为凭|一站式|全方位|赋能|智能化/)
    expect(block).not.toMatch(/助手|管家|assistant/)
  })
  it('long unpunctuated runs break only at the marked phrase boundaries', () => {
    // narrow screens only: from md up the statement breaks at punctuation, never inside 当地的租房规定
    expect(home).toContain(`const ZW = <span className="md:hidden">{'\\u200b'}</span>`)
    expect(block).toContain('房源和租约{ZW}先按当地的{ZW}租房规定查一遍')
    expect(block).toContain('相关的人{ZW}在一个对话里商量')
  })
})
