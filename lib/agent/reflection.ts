// -----------------------------------------------------------------------------
// User-model reflection (2026-08-24) — the "learns you over time" layer.
//
// Mechanism (three tiers):
//   1. Per-turn memory_writes (existing): granular facts the model saves live.
//   2. THIS MODULE — a periodic reflection pass per active user+role: read the
//      recent conversation trail (agent_audit_events turn metadata), the raw
//      memories, and the approve/reject record, then have a cheap model
//      SYNTHESISE a durable user model — goals, preferences, constraints,
//      communication style, current focus, and what worked / what got
//      rejected. Contradictions resolve toward the newest evidence; stale and
//      duplicate facts merge away. Stored as ONE user_memories row
//      (memory_type 'system', key 'user_model') so RLS, the /settings surfaces
//      and the client memory list all see it like any other memory.
//   3. The turn route injects this profile every turn (server-side, so it is
//      never lost to the client's 50-memory clamp) — the agent starts each
//      conversation already knowing the person.
//
// Triggered from the proactive cron sweep (daily) for users active in the
// last REFLECT_WINDOW_HOURS, capped per run. Cost: one small-model call per
// active user per day.
// -----------------------------------------------------------------------------
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_MODELS, getModel, getModelDef, getModelDefAsync } from '@/lib/modelConfig'
import { llmChat } from '@/lib/llmChat'
import { parseModelJson } from '@/lib/screening/jsonRepair'
import type { AgentRole } from './types'

export const USER_MODEL_KEY = 'user_model'
const REFLECT_WINDOW_HOURS = 36
const MAX_USERS_PER_RUN = 40
const MAX_TURNS = 40

export interface UserModel {
  goals: string[]
  preferences: string[]
  constraints: string[]
  communication_style: string
  current_focus: string
  worked_well: string[]
  avoid: string[]
  updated_at: string
  turns_analyzed: number
}

const REFLECT_PROMPT = `你是一个"用户理解引擎"。下面是某位 Stayloop 用户（角色：{ROLE}）最近与 AI 管家的对话记录、TA 已保存的记忆、以及 TA 对 AI 提议的批准/拒绝记录。

任务：把零散信息提炼成一份稳定的「用户画像」，让 AI 管家越来越懂这个人。规则：
1. 只写有证据支撑的判断，不猜测；矛盾时以最新的证据为准。
2. 合并重复、丢弃过时（比如已完成的找房需求）。
3. 目标(goals)写 TA 正在追求的结果（如「把 89 Estelle 租出去」「续约谈到 $2900 以内」）；偏好(preferences)写做事方式（语言、渠道、风格、预算习惯）；约束(constraints)写硬限制（预算上限、时间、宠物）。
4. worked_well/avoid 来自批准与拒绝记录：TA 接受过什么类型的提议、拒绝过什么——之后的提议要顺着接受的模式来。
5. 不得记录任何《安大略人权法典》受保护特征（种族、宗教、家庭状况、年龄特征、是否领取社会援助等）。
6. 每个数组最多 6 条，每条 ≤ 40 字；communication_style 与 current_focus 各一句话。没有证据的字段给空数组/空串。

只输出这个 JSON（不要 markdown）：
{"goals":[],"preferences":[],"constraints":[],"communication_style":"","current_focus":"","worked_well":[],"avoid":[]}`

function clampArr(v: unknown, n = 6, len = 60): string[] {
  return (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, len)).slice(0, n)
}

/** Sanitize the model's output into a UserModel (pure — tested). */
export function sanitizeUserModel(raw: unknown, turns: number): UserModel | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!o) return null
  const m: UserModel = {
    goals: clampArr(o.goals),
    preferences: clampArr(o.preferences),
    constraints: clampArr(o.constraints),
    communication_style: typeof o.communication_style === 'string' ? o.communication_style.slice(0, 120) : '',
    current_focus: typeof o.current_focus === 'string' ? o.current_focus.slice(0, 120) : '',
    worked_well: clampArr(o.worked_well),
    avoid: clampArr(o.avoid),
    updated_at: new Date().toISOString().slice(0, 10),
    turns_analyzed: turns,
  }
  const hasContent = m.goals.length || m.preferences.length || m.constraints.length || m.current_focus || m.communication_style
  return hasContent ? m : null
}

/** Render the stored profile as a prompt block (used by the turn route). */
export function userModelToPromptBlock(value: unknown): string {
  const m = value && typeof value === 'object' ? (value as Partial<UserModel>) : null
  if (!m) return ''
  const sec = (label: string, arr?: string[]) => (arr && arr.length ? `- ${label}: ${arr.join('；')}` : null)
  const lines = [
    m.current_focus ? `- 当前重点: ${m.current_focus}` : null,
    sec('目标', m.goals),
    sec('偏好', m.preferences),
    sec('硬性约束', m.constraints),
    m.communication_style ? `- 沟通风格: ${m.communication_style}` : null,
    sec('有效的做法', m.worked_well),
    sec('避免', m.avoid),
  ].filter(Boolean)
  if (!lines.length) return ''
  return (
    `\n\n## 我对这位用户的长期理解（系统自动学习，截至 ${m.updated_at || '近期'}）\n` +
    lines.join('\n') +
    '\n（据此调整你的建议与语气；发现与画像矛盾的新信息时，照常用 memory_writes 记下新事实——画像会在下次自动反思时更新。）'
  )
}

/** Should we re-run reflection for this user? (pure — tested) */
export function needsReflection(row: { updated_at?: string | null } | null | undefined, now = Date.now()): boolean {
  if (!row || !row.updated_at) return true
  const t = Date.parse(row.updated_at)
  if (!Number.isFinite(t)) return true
  return now - t > 20 * 3_600_000 // at most ~once a day per user+role
}

/** One user's reflection: gather evidence → synthesize → upsert the user_model memory. */
export async function reflectUser(admin: SupabaseClient, userId: string, role: AgentRole): Promise<boolean> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const [turnsQ, memsQ, apprQ] = await Promise.all([
    admin.from('agent_audit_events').select('action,metadata,created_at').eq('actor_id', userId).eq('action', `${role}_agent_turn`).gte('created_at', since).order('created_at', { ascending: false }).limit(MAX_TURNS),
    admin.from('user_memories').select('memory_type,key,label,value,updated_at').eq('user_id', userId).eq('role', role).neq('key', USER_MODEL_KEY).order('updated_at', { ascending: false }).limit(60),
    admin.from('approval_events').select('action_type,status,created_at').eq('user_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(30),
  ])
  const turns = (turnsQ.data ?? []) as Array<{ metadata?: Record<string, unknown>; created_at?: string }>
  if (turns.length < 3) return false // not enough signal to learn from yet
  const convo = turns
    .slice()
    .reverse()
    .map((t) => {
      const md = t.metadata || {}
      const msg = typeof md.message === 'string' ? md.message : ''
      const reply = typeof md.reply === 'string' ? md.reply : ''
      return `[${String(t.created_at).slice(0, 10)}] 用户: ${msg}${reply ? `\n  管家: ${reply.slice(0, 200)}` : ''}`
    })
    .join('\n')
  const mems = ((memsQ.data ?? []) as Array<{ key: string; label?: string; value?: unknown }>).map((m) => `- ${m.label || m.key}: ${JSON.stringify(m.value).slice(0, 160)}`).join('\n') || '(无)'
  const appr = ((apprQ.data ?? []) as Array<{ action_type?: string; status?: string }>).map((a) => `- ${a.action_type}: ${a.status}`).join('\n') || '(无)'

  const modelId = await getModel('turn')
  const def = (await getModelDefAsync(modelId)) ?? getModelDef(DEFAULT_MODELS.turn)!
  const { text } = await llmChat({
    model: def,
    system: REFLECT_PROMPT.replace('{ROLE}', role),
    messages: [{ role: 'user', content: `## 最近对话（旧→新）\n${convo.slice(0, 12_000)}\n\n## 已保存的记忆\n${mems.slice(0, 4_000)}\n\n## 提议批准/拒绝记录\n${appr.slice(0, 1_500)}` }],
    maxTokens: def.provider === 'openai-compat' ? 2500 : 1200,
    temperature: 0.2,
    jsonMode: def.provider === 'openai-compat',
    signal: AbortSignal.timeout(60_000),
    meta: { userId, slot: 'turn', source: 'agent/reflection' },
  })
  const model = sanitizeUserModel(parseModelJson(text), turns.length)
  if (!model) return false
  const { error } = await admin.from('user_memories').upsert(
    {
      user_id: userId,
      role,
      memory_type: 'system',
      key: USER_MODEL_KEY,
      label: '用户画像（自动学习）',
      value: model as unknown as Record<string, unknown>,
      confidence: 0.9,
      source: 'reflection',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,role,memory_type,key' },
  )
  if (error) {
    console.warn('[reflection] upsert failed', error.message)
    return false
  }
  return true
}

/** Cron sweep: reflect every user active in the last REFLECT_WINDOW_HOURS. */
export async function runReflectionSweep(admin: SupabaseClient): Promise<{ reflected: number; skipped: number }> {
  const since = new Date(Date.now() - REFLECT_WINDOW_HOURS * 3_600_000).toISOString()
  const { data } = await admin
    .from('agent_audit_events')
    .select('actor_id, action')
    .like('action', '%_agent_turn')
    .gte('created_at', since)
    .limit(2000)
  const pairs = new Map<string, { userId: string; role: AgentRole }>()
  for (const row of (data ?? []) as Array<{ actor_id: string; action: string }>) {
    const role = row.action.replace('_agent_turn', '') as AgentRole
    if (!['tenant', 'landlord', 'agent'].includes(role)) continue
    pairs.set(`${row.actor_id}:${role}`, { userId: row.actor_id, role })
  }
  let reflected = 0
  let skipped = 0
  for (const { userId, role } of Array.from(pairs.values()).slice(0, MAX_USERS_PER_RUN)) {
    try {
      ;(await reflectUser(admin, userId, role)) ? reflected++ : skipped++
    } catch (e) {
      skipped++
      console.warn('[reflection] user failed', userId.slice(0, 8), (e as Error).message)
    }
  }
  return { reflected, skipped }
}
