// Phones can change the assistant's avatar and name (2026-09-27). The web
// panel's pencil is lg-only, so the activity sheet (tap the avatar in the chat
// header) and /settings carry the same picker; one grid component serves all
// three places and every path saves to assistant_profiles the same way.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('one avatar picker, three places', () => {
  it('AvatarPicker is the only grid; the panel, the sheet and settings render it', () => {
    const picker = read('components/agent/AvatarPicker.tsx')
    expect(picker).toContain('data-testid="avatar-picker"')
    expect(picker).toContain('{AVATAR_GROUPS.map((g) => (')
    expect(picker).toContain("{AVATAR_PRESETS.filter((p) => p.group === g.key).map((p) => (")
    expect(picker).toContain('grid grid-cols-5 gap-1.5')
    for (const f of ['components/agent/AssistantPanel.tsx', 'app/settings/page.tsx']) {
      const s = read(f)
      expect(s, f).toContain('<AvatarPicker ')
      expect(s, f).not.toContain('AVATAR_GROUPS.map')
    }
  })
  it('the phone sheet: the same AI Agent panel (pencil menu 换头像 / 改名, same saves); the page owns the avatar state (2026-10-04)', () => {
    const panel = read('components/agent/AssistantPanel.tsx')
    expect(panel).toContain("data-testid={sheet ? 'sheet-pencil' : undefined}")
    expect(panel).toContain("{zh ? '换头像' : 'Change avatar'}")
    expect(panel).toContain("{zh ? '改名' : 'Edit name'}")
    expect(panel).toContain('await saveAssistantAvatar(supabase, auth.user.id, key)')
    expect(panel).toContain('await saveAssistantName(supabase, auth.user.id, next)')
    expect(panel).toContain('setAIName(next, live && auth.user ? auth.user.id : null)')
    expect(panel).toContain('disabled={!live}') // preview mode: look, do not edit
    expect(panel).toContain("if (e.key === 'Escape') { e.preventDefault(); setMenu(false) }")
    expect(read('components/mobile/AssistantSheet.tsx')).toContain('variant="sheet"')
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain('onAvatarChange?: (key: string | null) => void')
    expect(chat).toContain('onClick={() => onOpenAssistant?.()}')
    const page = read('components/agent/AgentWorkspacePage.tsx')
    expect(page).toContain('onAvatarChange={setAvatar}')
    expect(page).toMatch(/<AssistantSheet [^\n]*avatar=\{avatar\} onAvatarChange=\{setAvatar\}/)
  })
  it('/settings has a「修改 AI 助理头像」quick action that reads assistant_profiles and saves the same way', () => {
    const s = read('app/settings/page.tsx')
    expect(s).toContain("label={zh ? '修改 AI 助理头像' : 'Change AI Agent avatar'}")
    expect(s).toContain('function AssistantAvatarEditor(')
    expect(s).toContain('await saveAssistantAvatar(getSupabaseBrowser(), user.id, key)')
    expect(s).toContain('readAssistantProfile(getSupabaseBrowser())')
    expect(s).toContain('setStoredAvatar(key ?? \'default\')')
  })
})
