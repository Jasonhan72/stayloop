// 2026-10-03, user on /listings: 「把系统里的这些示范数据的警告条都去掉吧，这样就能多出来空间了」, then
// 「同时也把这些内容压缩到一行的空间里，有些可以合并或者取消的」. The page had four rows above the cards
// (demo bar · search + button · filter toolbar · results bar). Now one line: search (filters as you type) ·
// Filters (panel unfolds on demand, incl. the AI-preferences preset) · Saved · count · sort.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/listings/page.tsx', 'utf8')
const notice = readFileSync('components/SampleNotice.tsx', 'utf8')

describe('/listings toolbar is one line', () => {
  it('no demo bar on a page whose listings are all real', () => {
    expect(page).not.toMatch(/<SampleBanner\b|SampleNotice'/)
    expect(page).not.toContain('TRREB 房源数据库尚未接入')
  })
  it('one toolbar section: search, filters, saved, count and sort', () => {
    expect((page.match(/data-testid="listings-toolbar"/g) || []).length).toBe(1)
    expect(page).toContain('data-testid="listings-search"')
    expect(page).toContain('data-testid="listings-sort"')
    expect(page).toContain('lg:flex-nowrap')
    // the old separate search button and results bar are gone
    expect(page).not.toContain("'搜索 →'")
    expect(page).not.toContain('{/* Results bar */}')
  })
  it('search applies as you type (debounced) and on Enter', () => {
    expect(page).toMatch(/setTimeout\(\(\) => setAppliedQuery\(queryInput\.trim\(\)\), 300\)/)
    expect(page).toContain("if (e.key === 'Enter') setAppliedQuery(queryInput.trim())")
  })
  it('dropped: the For-rent chip, the fake "AI picks" sort and the mixed-language Profile button', () => {
    expect(page).not.toContain("'出售 · 即将上线'")
    expect(page).not.toContain('<option value="ai">')
    expect(page).toContain("type SortKey = 'price_asc' | 'price_desc' | 'newest'")
    expect(page).toContain("useState<SortKey>('newest')")
    expect(page).not.toMatch(/Profile\)/)
  })
  it('the AI-preferences preset lives in the filter panel', () => {
    const panel = page.slice(page.indexOf('data-testid="listings-filter-panel"'))
    expect(panel.slice(0, 1500)).toContain('onClick={applyProfileFilters}')
    expect(page).toContain("'◐ 套用我的偏好'")
  })
})

describe('sample-data marker is a slim chip, not a bar', () => {
  it('SampleBanner renders a small chip with the sentence as tooltip + screen-reader text', () => {
    expect(notice).toContain('data-testid="sample-chip"')
    expect(notice).toContain('title={sentence}')
    expect(notice).toContain('<span className="sr-only">{sentence}</span>')
    expect(notice).not.toContain('#FEF3C7')
  })
})

// Locally (localhost is not an allowed referrer for the Maps key) 4 of 6 reloads showed "地图范围内 0 套" with an
// empty card list: Google rejected the key, the map froze, and its empty "view" still filtered the list.
describe('a failed map never empties the list', () => {
  const map = readFileSync('components/ListingsMap.tsx', 'utf8')
  it('auth failure / SDK failure reset the viewport filter and stop reporting', () => {
    expect(map).toContain('w.gm_authFailure = onAuthFailure')
    expect((map.match(/onViewportRef\.current\?\.\(null\)/g) || []).length).toBe(2)
    expect(map).toContain('if (vb && onViewportRef.current && !failedRef.current)')
    expect(page).toContain('setViewportIds(ids ? new Set(ids) : null)')
  })
  it('says so in plain words instead of the raw SDK error', () => {
    expect(map).toContain('地图暂时无法加载，房源列表不受影响。')
    expect(map).not.toContain("'地图加载失败 — '")
  })
})
