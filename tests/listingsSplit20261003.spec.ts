// 2026-10-03, user on /listings: "现在看不到下面的了。地图里的小房源卡片，需要滚动才能看到了".
// The map was sticky at viewport height but started ~330px down the page (banner, search, filters,
// results bar above it), so its bottom — where the peek card / cluster strip sits — was off screen.
// On lg+ the page is now an app-style split view: the body fills the viewport, the card list scrolls in
// its own pane and the map fills its pane. Phones and tablets keep the normal page scroll.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/listings/page.tsx', 'utf8')
const map = readFileSync('components/ListingsMap.tsx', 'utf8')

describe('/listings desktop split view fits the viewport', () => {
  it('the page is a viewport-high flex column on lg+ and the toolbar rows keep their height', () => {
    expect(page).toContain('className="bg-white lg:flex lg:h-[100dvh] lg:flex-col lg:overflow-hidden"')
    expect((page.match(/className="bg-white px-5 sm:px-8 lg:shrink-0"/g) || []).length).toBe(3)
  })
  it('the body fills the rest; the cards scroll in their own pane with content-sized rows', () => {
    expect(page).toMatch(/lg:min-h-0 lg:flex-1 lg:grid-cols-\[minmax\(540px,1fr\)_minmax\(420px,1fr\)\] lg:grid-rows-\[minmax\(0,1fr\)\]/)
    // auto-rows-max: the cards clip their overflow, so without it a fixed-height grid squeezes every row to ~10px
    expect(page).toContain('grid auto-rows-max grid-cols-1 px-5 py-[18px] sm:grid-cols-2 sm:px-6 lg:h-full lg:overflow-y-auto')
    expect(page).toContain('<div className="hidden lg:block lg:h-full lg:min-h-0">')
  })
  it('the split map fills its pane instead of a sticky 100vh box', () => {
    expect(map).toContain("? { position: 'relative', height: '100%', borderLeft: '1px solid #E4EEF6'")
    expect(map).not.toContain("height: 'calc(100vh - 66px)'")
  })
})
