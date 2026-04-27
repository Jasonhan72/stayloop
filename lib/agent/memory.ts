// -----------------------------------------------------------------------------
// Long-term memory (user_facts)
// -----------------------------------------------------------------------------
// At conversation start, recall the user's accumulated facts and inject them
// into the system prompt so the agent adapts to known preferences /
// patterns without re-discovering them every session.
//
// At conversation end, ask the model to summarize 1-3 new facts worth
// remembering, written to the user_facts table.
//
// Schema mapping: see migration agent_runtime_v1.
// -----------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserFact } from './types'

const MAX_FACTS_PER_PROMPT = 12

/**
 * Recall active facts for a user, ordered by recency. Returns up to
 * MAX_FACTS_PER_PROMPT most recent non-superseded facts.
 */
export async function recallUserFacts(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<UserFact[]> {
  const { data, error } = await supabaseAdmin
    .from('user_facts')
    .select('*')
    .eq('user_id', userId)
    .is('superseded_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_FACTS_PER_PROMPT)
  if (error) {
    console.warn('[memory] recall failed:', error.message)
    return []
  }
  return (data || []) as UserFact[]
}

/**
 * Format facts as a readable block for system prompt injection. Bilingual
 * (English first since the model is Anthropic + English-trained, but
 * preserve Chinese facts as-is so the model sees actual user voice).
 */
export function formatFactsForPrompt(facts: UserFact[]): string {
  if (facts.length === 0) return ''
  const grouped: Record<string, UserFact[]> = {}
  for (const f of facts) {
    if (!grouped[f.fact_type]) grouped[f.fact_type] = []
    grouped[f.fact_type].push(f)
  }
  const lines: string[] = ['# Known facts about this user (recall — do not re-ask)']
  for (const [type, items] of Object.entries(grouped)) {
    lines.push(`\n## ${type}`)
    for (const f of items) {
      lines.push(`- ${f.fact}`)
    }
  }
  return lines.join('\n')
}

/**
 * Persist a new fact. Optionally mark older facts of the same type as
 * superseded if the new one contradicts them (best-effort heuristic).
 */
export async function recordFact(
  supabaseAdmin: SupabaseClient,
  userId: string,
  fact: {
    fact: string
    fact_type: 'preference' | 'past_concern' | 'screening_pattern' | 'business_context'
    confidence?: number
    source_message_id?: string | null
  },
): Promise<void> {
  const { error } = await supabaseAdmin.from('user_facts').insert({
    user_id: userId,
    fact: fact.fact,
    fact_type: fact.fact_type,
    confidence: fact.confidence ?? 0.7,
    source_message_id: fact.source_message_id ?? null,
  })
  if (error) {
    console.warn('[memory] record fact failed:', error.message)
  }
}

/**
 * Mark a specific fact as superseded — used when a new fact directly
 * contradicts an old one. Preserves audit trail (we keep old rows).
 */
export async function supersedeFact(
  supabaseAdmin: SupabaseClient,
  factId: number,
): Promise<void> {
  await supabaseAdmin
    .from('user_facts')
    .update({ superseded_at: new Date().toISOString() })
    .eq('id', factId)
}

// ─── Fact summarization ────────────────────────────────────────────────────
//
// At the end of a meaningful conversation turn, ask Haiku to extract 0-3
// new facts worth remembering long-term. Cheap (~$0.001 per call), runs
// fire-and-forget so it never blocks the user-facing response.

const HAIKU_MODEL = 'claude-haiku-4-5'

interface RawSummarizedFact {
  fact: string
  fact_type: 'preference' | 'past_concern' | 'screening_pattern' | 'business_context'
  confidence?: number
}

const SUMMARIZE_PROMPT = `You are extracting durable facts about a user from a recent conversation snippet, to remember for future sessions. Output ONLY a JSON array of 0-3 facts. Each fact must be:
- About the USER (the landlord/agent), not about applicants/tenants
- Stable across sessions (preferences, business context, recurring concerns) — NOT transient details from one screening
- Actionable for future agent behaviour

Skip if nothing memorable. Empty array is fine.

fact_type values:
- "preference"          UI / report style preferences
- "past_concern"        recurring fraud concerns or skepticism patterns
- "screening_pattern"   what kinds of properties / tenants they typically screen
- "business_context"    portfolio size, geography, brokerage affiliation, language

Schema:
[
  { "fact": "...", "fact_type": "preference" | "past_concern" | ..., "confidence": 0-1 }
]

Return ONLY the JSON array, no markdown, no prose.`

/**
 * Summarize the last N turns of a conversation into 0-3 durable user_facts
 * and persist them. Best-effort — exceptions are logged, never thrown.
 */
export async function summarizeAndPersistFacts(
  supabaseAdmin: SupabaseClient,
  userId: string,
  conversationId: string,
  apiKey: string,
  options: { lookbackTurns?: number } = {},
): Promise<void> {
  const lookback = options.lookbackTurns ?? 6
  try {
    const { data: msgs, error } = await supabaseAdmin
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(lookback)
    if (error || !msgs || msgs.length < 2) return

    // Reverse to chronological order, flatten content blocks to plain text
    const transcript = msgs
      .reverse()
      .map((m: any) => {
        const text = flattenContent(m.content)
        return `${m.role.toUpperCase()}: ${text.slice(0, 800)}`
      })
      .join('\n\n')

    if (transcript.length < 80) return  // not enough signal

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 600,
        messages: [
          { role: 'user', content: `${SUMMARIZE_PROMPT}\n\n# Conversation\n${transcript}` },
          { role: 'assistant', content: '[' },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return
    const json: any = await res.json()
    const raw = (json?.content?.[0]?.text || '').trim()
    const text = raw.startsWith('[') ? raw : '[' + raw
    const arr = parseFactsArray(text)
    if (!arr || arr.length === 0) return

    // Persist (cap to 3 to avoid runaway memory growth)
    for (const f of arr.slice(0, 3)) {
      if (!f.fact || !f.fact_type) continue
      if (!['preference', 'past_concern', 'screening_pattern', 'business_context'].includes(f.fact_type)) continue
      await recordFact(supabaseAdmin, userId, {
        fact: f.fact.slice(0, 500),
        fact_type: f.fact_type,
        confidence: typeof f.confidence === 'number' ? Math.min(1, Math.max(0, f.confidence)) : 0.7,
      })
    }
  } catch (e: any) {
    console.warn('[memory] summarizeAndPersistFacts failed:', e?.message)
  }
}

function flattenContent(content: any): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((block: any) => {
      if (block?.type === 'text') return block.text || ''
      if (block?.type === 'tool_use') return `(called tool: ${block.name})`
      if (block?.type === 'tool_result') return `(tool result for ${block.tool_use_id})`
      return ''
    })
    .filter(Boolean)
    .join(' ')
}

function parseFactsArray(text: string): RawSummarizedFact[] | null {
  try {
    // Find the balanced top-level [ ... ]
    const start = text.indexOf('[')
    if (start < 0) return null
    let depth = 0
    let inStr = false
    let escape = false
    for (let i = start; i < text.length; i++) {
      const c = text[i]
      if (escape) {
        escape = false
        continue
      }
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') {
        inStr = !inStr
        continue
      }
      if (inStr) continue
      if (c === '[') depth++
      else if (c === ']') {
        depth--
        if (depth === 0) {
          const slice = text.slice(start, i + 1).replace(/,(\s*[}\]])/g, '$1')
          const parsed = JSON.parse(slice)
          return Array.isArray(parsed) ? parsed : null
        }
      }
    }
    return null
  } catch {
    return null
  }
}
