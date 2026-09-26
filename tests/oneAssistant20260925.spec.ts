// One AI assistant per account (user 2026-09-25: "一用户就只有一个 AI 助理，他能处理
// 所有三个角色的事情，角色还是分开的"). Identity (name + avatar) is the
// account's; memories, threads, pending cards and workflows stay per hat but the
// assistant reads every hat's memories (tagged) and one reflection profile.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSystemPrompt } from '@/lib/agent/prompts'

const read = (p: string) => readFileSync(p, 'utf8')
const PERSONA_NAMES = /\b(Luna|Logic|Brief)\b/

describe('one assistant per account', () => {
  it('DB: assistant_profiles (self RLS, anon revoked), backfilled from the most recently used hat; the reflection profile lives under role self', () => {
    const sql = read('supabase/migrations/20260925_one_assistant.sql')
    expect(sql).toContain('create table if not exists public.assistant_profiles')
    expect(sql).toContain('user_id uuid primary key references auth.users(id) on delete cascade')
    expect(sql).toContain('for all using (user_id = auth.uid()) with check (user_id = auth.uid())')
    expect(sql).toContain('revoke all on public.assistant_profiles from anon, public')
    expect(sql).toContain("case when c.agent_name in ('Luna', 'Logic', 'Brief', 'AI Agent')") // persona defaults never become the person's name
    expect(sql).toContain("check (role = any (array['tenant'::text, 'landlord'::text, 'agent'::text, 'self'::text]))")
    expect(sql).toContain("delete from public.user_memories where memory_type = 'system' and key = 'user_model' and role <> 'self'")
  })
  it('identity is account-level: one name key, one avatar key, writes go to assistant_profiles', () => {
    const name = read('lib/aiName.ts')
    expect(name).toContain("const KEY = 'sl-ai-name'")
    expect(name).toContain('export function useAIName(): string')
    expect(name).toContain('const profile = await readAssistantProfile(supabase)')
    expect(name).not.toContain("from('agent_configs')")
    const av = read('lib/agent/avatars.tsx')
    expect(av).toContain("const STORE_KEY = 'sl-avatar'")
    expect(av).toContain("export const DEFAULT_ASSISTANT_AVATAR = 'bunny'")
    expect(av).toContain("resolveAvatarKey(avatar) ?? (fallback === 'brand' ? DEFAULT_ASSISTANT_AVATAR : null)")
    const profile = read('lib/agent/assistantProfile.ts')
    expect(profile).toContain("from('assistant_profiles').upsert({ user_id: userId, name: trimmed }, { onConflict: 'user_id' })")
    expect(profile).toContain("from('assistant_profiles').upsert({ user_id: userId, avatar }, { onConflict: 'user_id' })")
    // nothing writes a per-hat name or avatar any more
    for (const f of ['components/agent/AssistantPanel.tsx', 'app/settings/page.tsx', 'lib/agent/useAgentSession.ts', 'app/onboarding/name/page.tsx']) {
      const s = read(f)
      expect(s, f).not.toMatch(/agent_configs'\)\.(update|upsert)\(/)
      expect(s, f).not.toMatch(/useAIName\('|getAIName\(role|setAIName\([^)]*, *role\)|getStoredAvatar\(role|setStoredAvatar\(role/)
    }
    expect(read('components/agent/AssistantPanel.tsx')).toContain('await saveAssistantName(supabase, auth.user.id, next)')
    expect(read('app/onboarding/name/page.tsx')).toContain('if (user && chosen !== GENERIC_AI_NAME) void saveAssistantName(supabase, user.id, chosen)')
    expect(read('lib/useOnboarding.ts')).toContain('setNamed(!!getStoredAIName(user?.id ?? null))')
  })
  it('the session loads the account profile and every hat’s memories; the prompt tags facts from other hats', () => {
    const loader = read('lib/agent/session-loader.ts')
    expect(loader).toContain('readAssistantProfile(client)')
    expect(loader).toContain('getUserMemories(client),')
    expect(loader).toContain("agent_name: profile?.name || ROLE_META[role].name, avatar: profile?.avatar ?? null")
    expect(read('lib/agent/memory.ts')).toContain("select('key,label,value,confidence,memory_type,role,source')") // + source since 2026-09-26 (user-written facts outrank inferred ones)
    const wf = { workflow_type: 'tenant_search', workflow_id: null, current_stage: 'intake', completed_steps: [], status: 'active' as const }
    const prompt = buildSystemPrompt('landlord', 'Atlas', [
      { key: 'budget', label: '预算', value: { max: 2400 }, confidence: 0.9, memory_type: 'preference', role: 'tenant' },
      { key: 'policy', label: '筛查政策', value: 'no smoking', confidence: 0.9, memory_type: 'preference', role: 'landlord' },
    ], wf, undefined, 'zh')
    expect(prompt).toContain('你的名字是 Atlas，你是这位用户在 Stayloop 上唯一的 AI 助理')
    expect(prompt).toContain('此刻 TA 以【房东】身份和你对话')
    expect(prompt).toContain('- [budget]（租客身份下记住的） 预算')
    expect(prompt).toContain('- [policy] 筛查政策')
    expect(prompt).toContain('不要当成当前身份的需求')
  })
  it('one reflection profile per person (role self), built from every hat’s trail', () => {
    const r = read('lib/agent/reflection.ts')
    expect(r).toContain('export async function reflectUser(admin: SupabaseClient, userId: string): Promise<boolean>')
    expect(r).toContain(".in('action', TURN_ACTIONS)")
    expect((r.match(/role: 'self'/g) || []).length).toBe(2)
    expect(r).not.toContain("`${role}_agent_turn`")
    const turn = read('app/api/agent/turn/route.ts')
    expect(turn).toContain(".eq('role', 'self') // one profile per account (2026-09-25)")
    expect(turn).toContain('reflectUser(sbAuth, turnUserId)')
    expect(read('app/api/agent/reflect/route.ts')).toContain('reflectUser(sb, ud.user.id)')
  })
  it('the activity log lists every hat’s conversations, tagged, and reopens a conversation on its own hat’s page', () => {
    expect(read('lib/agent/threads.ts')).toContain("select('id, role, title, summary, turn_count, message_count, created_at, updated_at, last_message_at')")
    expect(read('lib/agent/activityLog.ts')).toContain("kind: 'thread', id: `t:${t.id}`, threadId: t.id, role: t.role,")
    for (const f of ['components/agent/AssistantPanel.tsx', 'components/mobile/ActivitySheet.tsx']) {
      const s = read(f)
      expect(s, f).toContain("if (it.kind === 'thread' && it.role && it.role !== role) { router.push(`/${it.role}/agent?thread=${it.threadId}`); return }")
      expect(s, f).toContain("it.kind === 'thread' && it.role !== role && HAT[it.role]")
    }
    // ideas stay per hat; the memory snapshot edits the row's own hat
    expect(read('components/mobile/RolePages.tsx')).toContain("memories: data.memories.filter((m) => !m.role || m.role === role || m.role === 'self')")
    expect(read('components/agent/PrivateMemorySnapshot.tsx')).toContain(".eq('role', m.role ?? role)")
  })
  it('the live assistant wears one face under every hat; demo personas keep their orbs', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain("avatarFallback?: 'role' | 'brand'")
    expect((chat.match(/fallback=\{avatarFallback\}/g) || []).length).toBe(3)
    expect(read('components/agent/AgentWorkspacePage.tsx')).toContain("avatarFallback={live ? 'brand' : 'role'}")
    expect(read('components/home/HomeNext.tsx')).toContain("avatar={data.agent.avatar ?? null} avatarFallback={live ? 'brand' : 'role'}")
  })
  it('no persona name in live copy: menus, workspace gates, rail, layouts, settings, platform, homepage', () => {
    for (const f of ['components/Header.tsx', 'components/WorkspaceShell.tsx', 'components/workspace/rail.tsx', 'app/tenant/layout.tsx', 'app/landlord/layout.tsx', 'app/agent/layout.tsx', 'app/settings/models/page.tsx', 'app/admin/models/page.tsx', 'app/platform/page.tsx', 'components/agent/ClientBook.tsx', 'components/agent/ClientTasks.tsx']) {
      expect(read(f), f).not.toMatch(PERSONA_NAMES)
    }
    const home = read('components/home/HomeNext.tsx')
    expect(home).toContain('Stayloop 给你一个<b className="text-body">独立的 AI 助理</b>：租客、房东、经纪的事它都会办')
    expect(home).not.toContain('各提供一个')
    expect(home).toContain('const assistantName = customName(useAIName())')
    expect(read('app/notifications/page.tsx')).toContain('const aiNames = useAIName()')
  })
})
