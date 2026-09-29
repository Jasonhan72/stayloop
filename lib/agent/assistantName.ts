// The generic name of the person's assistant. User 2026-09-28: 全站统一 ——
// 中文叫「AI 助理」，英文叫「AI Agent」.
//
// GENERIC_AI_NAME doubles as the stored "not named yet" marker (agent_configs,
// assistant_profiles, the local name cache), so it stays one fixed string;
// everything a person reads goes through displayAiName, which turns the marker
// into the label for the interface language and leaves a real name alone.
//
// No 'use client' here on purpose: the server-side prompt builder imports it
// too, and a client module's exports arrive in route handlers as
// client-reference stubs (the avatarKeys lesson, 2026-09-28).
export const GENERIC_AI_NAME = 'AI Agent'
export const GENERIC_AI_NAME_ZH = 'AI 助理'

export type NameLang = 'zh' | 'en'

export function genericAiName(lang: NameLang): string {
  return lang === 'zh' ? GENERIC_AI_NAME_ZH : GENERIC_AI_NAME
}

/** True when the person has not named the assistant (empty, or one of the generic labels). */
export function isGenericAiName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim()
  return !n || n === GENERIC_AI_NAME || n === GENERIC_AI_NAME_ZH
}

/** What to show: the person's own name for it, else the generic label in the interface language. */
export function displayAiName(name: string | null | undefined, lang: NameLang): string {
  return isGenericAiName(name) ? genericAiName(lang) : (name as string).trim()
}
