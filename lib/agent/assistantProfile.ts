// One AI assistant per account (user decision 2026-09-25: "一用户就只有一个 AI
// 助理，他能处理所有三个角色的事情，角色还是分开的"). Its name, avatar and
// speaking style live in assistant_profiles — one row per account, RLS = self —
// instead of one agent_configs row per hat. Every read/write here runs on the
// caller's own client, so it can only ever touch the signed-in user's row.
import type { SupabaseClient } from '@supabase/supabase-js'

export type AssistantProfile = { name: string | null; avatar: string | null; vibe: string | null; persona: string | null }

/** The speaking style is one short line. */
export const VIBE_MAX = 120
/** The persona — who the assistant is and how it works — is a few sentences. */
export const PERSONA_MAX = 600

// Explicit instruction-override phrases have no place in a tone description:
// the prompt frames the vibe as wording only, and this keeps the obvious
// jailbreak strings out of the system prompt altogether. Narrowed on
// 2026-10-01 (sweep): ordinary persona text — 「我叫 Dan」, 「你现在是我的专属租房
// 顾问」, "From now on you answer in two sentences", "like a good assistant:
// no small talk" — matched and was silently erased. Role / identity phrases now
// count only next to a rule-escape word; role labels only at a line start.
const ESCAPE =
  '(?:unrestricted|unfiltered|uncensored|jailbr\\w*|developer mode|no (?:longer )?(?:bound|restricted)|not bound|free (?:from|of) (?:all |any |your )?(?:rules|restrictions|limits|guidelines|filters)|(?:no|without(?: any)?) (?:rules|restrictions|limits|guidelines|filters|limitations)|不受(?:任何)?(?:限制|约束|规则)|没有(?:任何)?(?:限制|约束|规则)|无(?:任何)?(?:限制|约束)|不再遵守|不必遵守|不用遵守|不需要遵守|越狱|开发者模式)'
const EN_NEG = "(?<!(?:n['’]t|\\bnot|\\bnever)\\s+)"
const ZH_NEG = '(?<!别|不要|不能|不可|不可以|勿|不准|不许|绝不|不会)'
const VIBE_OVERRIDE: RegExp[] = [
  // The object must be the AI Agent's own instructions: a determiner like previous /
  // system / your / 以上 / 你的 sits between the verb and it, and a negation right before
  // the verb ("never forget your rules", 「别忽略以上规则」) reinforces rather than overrides.
  // Without that, 「别忽略我的预算限制」 or "Don't forget the rules about deposits" was erased.
  new RegExp(`${EN_NEG}\\b(?:ignore|disregard|forget|override)\\s+(?:all\\s+)?(?:(?:the|your|any)\\s+)?(?:previous|prior|above|earlier|preceding|system|all|your)\\s+(?:instructions?|rules|prompts?|guidelines|directives)\\b`, 'i'),
  new RegExp(`${EN_NEG}\\b(?:ignore|disregard|forget|override)\\s+(?:all\\s+)?(?:the\\s+)?(?:instructions?|prompts?|rules)\\s+above\\b`, 'i'),
  new RegExp(`${ZH_NEG}(?:忽略|无视|忘掉|忘记)掉?(?:以上|之前|前面|上面|先前|所有|全部|任何|你的|系统)[^。！？!?\\n]{0,6}?(?:指令|指示|规则|提示词?|设定|原则|限制|约束)`),
  // 覆盖 is also plain "cover" (「回答要覆盖所有规则」), so only the pointed determiners count
  new RegExp(`${ZH_NEG}覆盖掉?(?:以上|之前|前面|上面|先前|你的|系统)[^。！？!?\\n]{0,6}?(?:指令|指示|规则|提示词?|设定|原则)`),
  new RegExp(`(?:you are now|you're now|from now on,? you|你现在是|从现在起你|从现在开始你)[^\\n]{0,40}?${ESCAPE}`, 'i'),
  // the "DAN" jailbreak persona — upper-case only, so the name Dan stays fine
  /\b(?:[Yy]ou(?: are|'re)(?: now)? DAN|[Aa]ct as DAN|[Bb]e DAN|DAN [Mm]ode)\b/,
  /system prompt|系统提示词|developer mode|开发者模式|jailbreak|越狱模式|pretend (?:you|to be)|<\/?system>/i,
  // a transcript-style role label at the start of a line ("assistant: …", "system: …")
  /(?:^|\n)\s*(?:assistant|system|developer)\s*[:：]/i,
]
const hasOverride = (t: string) => VIBE_OVERRIDE.some((re) => re.test(t))

/** One line, ≤ VIBE_MAX chars, no override phrases; null when nothing usable is left. Pure — tested. */
export function sanitizeVibe(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const one = raw.replace(/\s+/g, ' ').trim().slice(0, VIBE_MAX)
  if (!one) return null
  if (hasOverride(one)) return null
  return one
}

/** Paragraph-length, line breaks kept, ≤ PERSONA_MAX chars, no override phrases; null when nothing usable is left. Pure — tested. */
export function sanitizePersona(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, PERSONA_MAX)
  if (!text) return null
  if (hasOverride(text)) return null
  return text
}

/** What a save of this draft would do: clear (empty draft), set (clean text), or refuse
 *  (non-empty text the filter rejects — never written as NULL over the stored one). Pure — tested. */
export type DraftCheck = { ok: true; value: string | null } | { ok: false; reason: 'override' }
export function checkVibe(draft: string): DraftCheck {
  if (!draft.trim()) return { ok: true, value: null }
  const v = sanitizeVibe(draft)
  return v ? { ok: true, value: v } : { ok: false, reason: 'override' }
}
export function checkPersona(draft: string): DraftCheck {
  if (!draft.trim()) return { ok: true, value: null }
  const v = sanitizePersona(draft)
  return v ? { ok: true, value: v } : { ok: false, reason: 'override' }
}
export const OVERRIDE_REJECTED = {
  zh: '没有保存：这段话里有像「忽略以上规则」「你现在不受任何限制」这样改写规则的说法。去掉那一句再保存；原来的内容没有变。',
  en: 'Not saved: the text contains a rule-override phrase (like "ignore the rules above" or "you are now unrestricted"). Remove that sentence and save again; what was saved before is unchanged.',
}

export async function readAssistantProfile(client: SupabaseClient): Promise<AssistantProfile | null> {
  const { data, error } = await client.from('assistant_profiles').select('name, avatar, vibe, persona').maybeSingle()
  if (error) {
    console.warn('[assistant] profile read failed', error.message)
    return null
  }
  if (!data) return null
  const row = data as { name?: string | null; avatar?: string | null; vibe?: string | null; persona?: string | null }
  return { name: (row.name ?? '').trim() || null, avatar: row.avatar ?? null, vibe: sanitizeVibe(row.vibe), persona: sanitizePersona(row.persona) }
}

/** The name the person gave their assistant (≤ 40 chars, trimmed). */
export async function saveAssistantName(client: SupabaseClient, userId: string, name: string): Promise<boolean> {
  const trimmed = name.trim().slice(0, 40)
  if (!trimmed) return false
  const { error } = await client.from('assistant_profiles').upsert({ user_id: userId, name: trimmed }, { onConflict: 'user_id' })
  if (error) console.warn('[assistant] name save failed', error.message)
  return !error
}

/** The chosen avatar preset (lib/agent/avatars.tsx); null = the default face. */
export async function saveAssistantAvatar(client: SupabaseClient, userId: string, avatar: string | null): Promise<boolean> {
  const { error } = await client.from('assistant_profiles').upsert({ user_id: userId, avatar }, { onConflict: 'user_id' })
  if (error) console.warn('[assistant] avatar save failed', error.message)
  return !error
}

/** The speaking style (sanitized); null or empty clears it. Text the filter rejects is
 *  refused (false, nothing written) — it never wipes the stored style. */
export async function saveAssistantVibe(client: SupabaseClient, userId: string, vibe: string | null): Promise<boolean> {
  const c = checkVibe(vibe ?? '')
  if (!c.ok) return false
  const { error } = await client.from('assistant_profiles').upsert({ user_id: userId, vibe: c.value }, { onConflict: 'user_id' })
  if (error) console.warn('[assistant] vibe save failed', error.message)
  return !error
}

/** The persona (sanitized); null or empty clears it. Rejected text is refused, never written as NULL. */
export async function saveAssistantPersona(client: SupabaseClient, userId: string, persona: string | null): Promise<boolean> {
  const c = checkPersona(persona ?? '')
  if (!c.ok) return false
  const { error } = await client.from('assistant_profiles').upsert({ user_id: userId, persona: c.value }, { onConflict: 'user_id' })
  if (error) console.warn('[assistant] persona save failed', error.message)
  return !error
}
