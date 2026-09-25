// Homepage hero after the user's 2026-09-25 note: "avatar 这里的头像和名字以及上面的
// 文字占用了太多空间，挤压了下面的对话框" — the conversation is the hero, so the
// text block above it is tighter, the chat's identity is one 48px row, and the
// chat runs to the fold on ≥640px screens.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('homepage hero: the conversation gets the first screen', () => {
  const home = read('components/home/HomeNext.tsx')
  const chat = read('components/agent/AgentChat.tsx')
  it('the text block above the chat is tighter (40px h1, 16px lead, less top padding)', () => {
    expect(home).toContain('sm:mt-3 sm:text-[40px]')
    expect(home).not.toContain('sm:text-[52px]')
    expect(home).toContain('sm:px-7 sm:pt-8 lg:pt-10')
    expect(home).toContain('mt-3 hidden max-w-[640px] text-[16px] leading-relaxed text-body-2 sm:block')
  })
  it('signed in, the hat line moves into the chat header; visitors keep the three role pills', () => {
    expect(home).not.toContain("{signedIn ? (\n              <div className=\"mb-2 flex flex-wrap")
    expect(home).toContain('{!signedIn && (')
    expect(home).toContain("headerNote={signedIn ? `${pick(ROLE_LABEL[role], lang)} · ${zh ? '换身份在右上角菜单' : 'Switch hats in the top-right menu'}` : null}")
    expect(home).toContain('fill compactHeader headerNote={headerNote}')
  })
  it('the chat card runs to the fold on ≥640px screens and keeps its phone sizing', () => {
    expect(home).toContain("${signedIn ? 'sm:h-[max(420px,calc(100vh-330px))]' : 'sm:h-[max(420px,calc(100vh-378px))]'}")
    expect(home).not.toContain('sm:h-[600px]')
    expect(home).toContain('h-[max(360px,calc(100vh-270px))]')
  })
  it('AgentChat has a one-row compact header; the centred variant is untouched for the assistant pages', () => {
    expect(chat).toContain('compactHeader?: boolean')
    expect(chat).toContain('data-testid="chat-header-compact"')
    expect(chat).toContain('<div className="flex h-12 flex-none items-center gap-2.5 border-b border-line-divider px-4 md:px-5"')
    expect(chat).toContain('<AssistantAvatar avatar={avatar} role={role} className="h-8 w-8 flex-none" />')
    expect(chat).toContain('flex flex-none flex-col items-center px-4 pb-2 pt-3 md:border-b') // the /x/agent header (2026-09-24)
    expect(read('components/agent/AgentWorkspacePage.tsx')).not.toContain('compactHeader') // only the homepage uses it
  })
})
