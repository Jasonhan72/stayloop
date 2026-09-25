// Guards for the phone assistant layout (2026-09-24, user: "手机端页面中间
// 对话框不够大，上部被菜单和说明占了太多空间"). Measured before: header 67 +
// 今日 179 + rail 161 + centred hero 123 = 530px of an 812px screen before
// the first bubble. Now the three assistant pages are a fixed column
// [context strip 44px] + [chat] between the 56px header and the 64px tabs.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')
// The three assistant routes are thin wrappers around one shared component (user 2026-09-25).
const pages = ['components/agent/AgentWorkspacePage.tsx']

describe('phone assistant screen', () => {
  it('each assistant page is a viewport-high column on phones with the context strip', () => {
    for (const p of pages) {
      const s = read(p)
      expect(s).toContain('hideAside phoneApp>')
      expect(s).toContain('sl-phone-col flex flex-col md:h-[calc(100vh-66px)] md:flex-row')
      expect(s).toContain('<div className="md:hidden"><ContextStrip')
      expect(s).toContain('phoneFill')
      // 今日 and the rail are carried by the strip on phones and by /x/todo and
      // /x/progress on the web — never above the conversation (user 2026-09-24)
      expect(s).not.toContain('<TodayCard')
      expect(s).not.toContain('<LifecycleRail')
      expect(s).not.toContain('-mx-5 min-w-0 sm:mx-0')
    }
  })
  it('context strip is one 44px line that expands to today + the compact rail', () => {
    const s = read('components/mobile/ContextStrip.tsx')
    expect(s).toContain('className="flex h-11 w-full items-center gap-2 px-4 text-left"')
    expect(s).toContain('aria-expanded={open}')
    expect(s).toContain('<TodayCard')
    expect(s).toContain('<LifecycleRail lifecycle={lifecycle} lang={lang} compact')
  })
  it('shell drops the content padding for phoneApp pages and the header is 56px on phones', () => {
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).toContain("phoneApp ? 'sl-phone-pb min-w-0 flex-1 p-0 md:p-0'")
    expect(read('components/Header.tsx')).toContain('flex h-14 max-w-[1240px] items-center justify-between px-5 sm:px-8 md:h-[66px]')
  })
  it('chat header: centred avatar with the name below on every breakpoint (user 2026-09-24, phone and web); phoneFill fills the parent', () => {
    const s = read('components/agent/AgentChat.tsx')
    expect(s).not.toContain("'flex-col text-center sm:flex-row sm:text-left'")
    expect(s).toContain('flex flex-none flex-col items-center px-4 pb-2 pt-3 md:border-b')
    expect(s).not.toContain('md:flex-row md:gap-3')
    expect(s).toContain('h-11 w-11 md:h-14 md:w-14')
    expect(s).not.toContain('-mt-2 rounded-full border border-line-divider bg-white') // 名字不得压住头像（用户 2026-09-24）
    expect(s).toContain("phoneFill ? 'h-full md:h-[70vh] md:rounded-2xl md:border md:border-line-divider md:shadow-sm lg:h-full'")
    expect(s).toContain('border-t border-line-divider p-2 md:p-3')
  })
  it('input bar is one row on phones with the model picker hidden below md', () => {
    const s = read('components/agent/AgentInputBar.tsx')
    expect(s).toContain('flex flex-wrap items-end gap-1 px-2 py-1.5 md:gap-0 md:px-0 md:py-0')
    expect(s).toContain('order-2 block max-h-60 min-h-[40px] min-w-0 flex-1 basis-0')
    expect(s).toContain("relative cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] text-body-2 transition hover:bg-surface-chip ${pill ? 'hidden' : 'hidden md:flex'}")
  })
})
