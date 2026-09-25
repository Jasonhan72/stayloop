// Homepage hero after the user's 2026-09-25 notes: "头像和名字以及上面的文字占用了
// 太多空间，挤压了下面的对话框" → then "还是原来的布置比较好，空间稍微压缩一点就可以".
// So: the same arrangement (eyebrow · h1 · lead · hat line · card with the centred
// avatar / name / status), every gap a notch tighter, and the chat box runs to
// the fold instead of a fixed 600px.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('homepage hero: same layout, tighter, the chat runs to the fold', () => {
  const home = read('components/home/HomeNext.tsx')
  const chat = read('components/agent/AgentChat.tsx')
  it('the text block is a notch tighter (44px h1, 16px lead, less top padding) — not restructured', () => {
    expect(home).toContain('sm:mt-3 sm:text-[44px]')
    expect(home).not.toContain('sm:text-[52px]')
    expect(home).toContain('sm:px-7 sm:pt-9 lg:pt-11')
    expect(home).toContain('mt-3 hidden max-w-[640px] text-[16px] leading-relaxed text-body-2 sm:block')
    // the hat line stays above the card for signed-in users; visitors keep the three pills
    expect(home).toMatch(/\{signedIn \? \(\s*<div className="mb-2 flex flex-wrap items-center justify-center gap-2 text-\[12\.5px\] text-body-3 sm:mb-2\.5">/)
    expect(home).toContain("{zh ? '换身份在右上角菜单' : 'Switch hats in the top-right menu'}")
    expect(home).not.toContain('headerNote')
  })
  it('the chat card runs to the fold on ≥640px screens and keeps its phone sizing', () => {
    expect(home).toContain('sm:h-[max(400px,calc(100vh-390px))]')
    expect(home).not.toContain('sm:h-[600px]')
    expect(home).toContain('h-[max(360px,calc(100vh-270px))]')
    expect(home).toContain('onListingsShown={markListingsShown} fill compactHeader />')
  })
  it('compactHeader keeps the centred avatar · name · status block, only smaller; the assistant pages keep the original metrics', () => {
    expect(chat).toContain('compactHeader?: boolean')
    expect(chat).not.toContain('headerNote')
    expect(chat).toContain("compactHeader ? 'flex flex-none flex-col items-center px-4 pb-1.5 pt-2.5 md:border-b md:border-line-divider md:px-5 md:pb-2 md:pt-3'")
    expect(chat).toContain("${compactHeader ? 'h-10 w-10 md:h-11 md:w-11' : 'h-11 w-11 md:h-14 md:w-14'}")
    expect(chat).toContain('flex flex-none flex-col items-center px-4 pb-2 pt-3 md:border-b') // the /x/agent header (2026-09-24)
    expect(chat).not.toMatch(/flex h-12 flex-none items-center gap-2\.5 border-b/) // the one-row variant was rejected
    expect(read('components/agent/AgentWorkspacePage.tsx')).not.toContain('compactHeader') // only the homepage uses it
  })
})
