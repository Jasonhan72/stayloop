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
    // Signed in: no hat line above the card (user 2026-09-25, later the same day) — the hat is the
    // text label under the assistant's name inside the card and switches in place; visitors keep the pills
    expect(home).not.toContain('换身份在右上角菜单')
    expect(home).toMatch(/\{!signedIn && \(\s*<div className="mb-2 flex flex-wrap items-center justify-center gap-1\.5 sm:mb-2\.5 sm:gap-2">/)
    expect(home).not.toContain('headerNote')
  })
  it('the chat card runs to the fold on ≥640px screens and keeps its phone sizing', () => {
    expect(home).toContain('sm:h-[max(400px,calc(100vh-390px))]') // visitors: pills above the card
    expect(home).toContain('sm:h-[max(400px,calc(100vh-345px))]') // signed in: no hat line, the card gets the room
    expect(home).not.toContain('sm:h-[600px]')
    expect(home).toContain('h-[max(360px,calc(100vh-270px))]')
    expect(home).toContain('onListingsShown={markListingsShown} fill compactHeader hatChip={live} onHatSwitch={onHatSwitch} />')
    expect(home).toContain('onQueuedSent={() => setQueued(null)} onHatSwitch={setRole} />') // the label re-targets the hero in place
  })
  it('compactHeader keeps the centred avatar · name block, only smaller — hat label under the name, no status line (2026-09-25); the assistant pages keep the original metrics', () => {
    expect(chat).toContain('compactHeader?: boolean')
    expect(chat).toContain('{hatChip && compactHeader && <HatChip role={role} onSwitch={onHatSwitch} className="mt-1.5" />}')
    expect(chat).toMatch(/\{!compactHeader && \(\s*<button type="button" onClick=\{\(\) => canOpenSheet && setSheet\(true\)\}/)
    expect(read('components/agent/HatChip.tsx')).toContain('if (onSwitch) onSwitch(r); else router.push(`/${r}/agent`)')
    // one useAuth() instance's setRole reaches every other instance (Header menu, hero) — before this the hero and the menu disagreed
    const auth = read('lib/useAuth.ts')
    expect(auth).toContain("window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: r }))")
    expect(auth).toContain('window.addEventListener(ROLE_CHANGED_EVENT, onChanged)')
    expect(chat).not.toContain('headerNote')
    expect(chat).toContain("compactHeader ? 'flex flex-none flex-col items-center px-4 pb-1.5 pt-2.5 md:border-b md:border-line-divider md:px-5 md:pb-2 md:pt-3'")
    expect(chat).toContain("${compactHeader ? 'h-10 w-10 md:h-11 md:w-11' : 'h-11 w-11 md:h-14 md:w-14'}")
    expect(chat).toContain('flex flex-none flex-col items-center px-4 pb-2 pt-3 md:border-b') // the /x/agent header (2026-09-24)
    expect(chat).not.toMatch(/flex h-12 flex-none items-center gap-2\.5 border-b/) // the one-row variant was rejected
    expect(read('components/agent/AgentWorkspacePage.tsx')).not.toContain('compactHeader') // only the homepage uses it
  })
})
