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
    for (const f of ['components/agent/AssistantPanel.tsx', 'components/mobile/ActivitySheet.tsx', 'app/settings/page.tsx']) {
      const s = read(f)
      expect(s, f).toContain('<AvatarPicker ')
      expect(s, f).not.toContain('AVATAR_GROUPS.map')
    }
  })
  it('the phone sheet: a pencil menu (换头像 / 改名) beside the avatar, saving like the panel; the chat passes the state through from the workspace page', () => {
    const sheet = read('components/mobile/ActivitySheet.tsx')
    expect(sheet).toContain('data-testid="sheet-pencil"')
    expect(sheet).toContain("{zh ? '换头像' : 'Change avatar'}")
    expect(sheet).toContain("{zh ? '改名' : 'Edit name'}")
    expect(sheet).toContain('await saveAssistantAvatar(supabase, auth.user.id, key)')
    expect(sheet).toContain('await saveAssistantName(supabase, auth.user.id, next)')
    expect(sheet).toContain('setAIName(next, live && auth.user ? auth.user.id : null)')
    expect(sheet).toContain('const canEdit = live && !!onAvatarChange') // preview mode: look, do not edit
    expect(sheet).toContain("if (e.key === 'Escape') setMenu(false)")
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain('onAvatarChange?: (key: string | null) => void')
    expect(chat).toMatch(/<ActivitySheet [^\n]*avatar=\{avatar\} avatarFallback=\{avatarFallback\} onAvatarChange=\{onAvatarChange\}/)
    expect(read('components/agent/AgentWorkspacePage.tsx')).toContain('onAvatarChange={setAvatar}')
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
