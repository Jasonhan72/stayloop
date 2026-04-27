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
