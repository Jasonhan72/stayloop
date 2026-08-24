import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// /disputes 是一个没有后端的纯示范页(全库无 dispute 表)——案件、当事人、
// 律师、执照号、评分/胜率、统计数字全部是编造的样例,而这一页是公开的、
// 从页脚直链的。它曾经不带任何示范标注地展示 `LSO #L88421` 这样的真格式
// 执照号:LSO 号是安省法律协会的真实监管标识,编造的号可能撞上真实执业者,
// 而读者没有任何线索知道整页是虚构的。
//
// 这里守两条:① 页顶不可移除的示范横幅还在;② 页面里不出现真格式 LSO 号。
const SRC = readFileSync('app/disputes/page.tsx', 'utf8')

describe('/disputes 示范标注', () => {
  it('页顶示范横幅仍在渲染树里', () => {
    expect(SRC).toContain('function SampleBanner')
    expect(SRC).toMatch(/<SampleBanner\s+zh=\{zh\}\s*\/>/)
  })

  it('每一块虚构数据都挂着示范角标', () => {
    expect(SRC).toContain('function SampleTag')
    // 案件列表 · 案件详情 · 已结案 · LTB 表格 · 律师目录段 · 每张律师卡 · Hero · 指标
    expect(SRC.match(/<SampleTag\b/g)?.length ?? 0).toBeGreaterThanOrEqual(8)
  })

  it('不出现真格式的 LSO 执照号', () => {
    const real = SRC.match(/LSO\s*#\s*[LP]?\d{4,}/gi) ?? []
    expect(real, `真格式 LSO 号必须改成 SAMPLE-NN:${real.join(', ')}`).toEqual([])
    expect(SRC).toContain('LSO #SAMPLE-')
  })

  it('律师目录明说档案是虚构的', () => {
    expect(SRC).toContain('不是真实执业者')
    expect(SRC).toContain('not real licensees')
  })
})
