// Knowledge base ·「待核对」notices (design §7.3): while a detected source change that touches a rule is
// still pending human review, the assistant prompt and the /rules page say so, with the official link.
import { createClient } from '@supabase/supabase-js'
import { officialLinkFor, ruleById } from '@/lib/ontario/rules'

export type RuleNotice = { rule_id: string; source_key: string; source_title: string; new_date: string | null; detected_at: string }

let cache: { value: RuleNotice[]; at: number } | null = null
const TTL_MS = 60_000

/** Server-only, service role, 60 s cache; never throws (no notices on failure). */
export async function loadPendingNotices(): Promise<RuleNotice[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return []
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb.rpc('kb_pending_rule_notices')
    if (error) throw error
    cache = { value: (data || []) as RuleNotice[], at: Date.now() }
  } catch {
    cache = { value: cache?.value ?? [], at: Date.now() }
  }
  return cache.value
}

/** The prompt lines (pure): one per affected rule, naming the statute, the change date and the official page. */
export function noticePromptBlock(notices: RuleNotice[], lang: 'zh' | 'en'): string {
  if (!notices.length) return ''
  const zh = lang === 'zh'
  const lines: string[] = []
  const seen = new Set<string>()
  for (const n of notices) {
    const r = ruleById(n.rule_id)
    if (!r || seen.has(r.id)) continue
    seen.add(r.id)
    const link = officialLinkFor(r).url
    lines.push(zh
      ? `- 「${r.title.zh}」所依据的 ${r.statute} 于 ${n.new_date || n.detected_at.slice(0, 10)} 有修订，本站规则表待核对；涉及这条时提醒用户以官方页面为准：${link}`
      : `- The rule "${r.title.en}" rests on ${r.statute}, which was amended on ${n.new_date || n.detected_at.slice(0, 10)}; our rules table is pending review — when it comes up, tell the user to check the official page: ${link}`)
    if (lines.length >= 6) break
  }
  if (!lines.length) return ''
  return (zh ? '\n\n【规则待核对】以下条文最近有修订，规则表还没人工核对：\n' : '\n\n[RULES PENDING REVIEW] These provisions were amended recently and the rules table has not been reviewed yet:\n') + lines.join('\n')
}
