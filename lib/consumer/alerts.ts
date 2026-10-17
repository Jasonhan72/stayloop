// Identity alert (Consumer Reporting Act s.12.1–12.3, V0.8 G19): the applicant
// asks for a statement to sit on their file; every later disclosure — the
// disclosure pack, the screening report banner, the passport API response —
// carries it. Six years, revocable. Keyed on the lower-cased email the
// applicant applied with (the only identity the file has).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsumerAlert, ConsumerLang } from './types'

export const ALERT_MAX_CHARS = 500

export async function activeAlertFor(admin: SupabaseClient, email: string): Promise<ConsumerAlert | null> {
  const e = String(email ?? '').trim().toLowerCase()
  if (!e) return null
  const { data } = await admin
    .from('consumer_alerts')
    .select('id, email, name, statement, created_at, expires_at, revoked_at, request_id')
    .eq('email', e)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as ConsumerAlert | null) ?? null
}

/** Text for the banner / API field. The statement is the applicant's own words. */
export function alertBanner(alert: Pick<ConsumerAlert, 'statement' | 'created_at' | 'expires_at'>, lang: ConsumerLang): { title: string; body: string; meta: string } {
  const d = (iso: string) => new Date(iso).toISOString().slice(0, 10)
  return lang === 'zh'
    ? { title: '身份警示（申请人本人设置）', body: alert.statement, meta: `设置于 ${d(alert.created_at)} · 有效至 ${d(alert.expires_at)} · 《消费者报告法》s.12.1：使用这份档案前请先核实申请人身份。` }
    : { title: 'Identity alert (set by the applicant)', body: alert.statement, meta: `Set ${d(alert.created_at)} · valid until ${d(alert.expires_at)} · Consumer Reporting Act s.12.1: verify the applicant’s identity before relying on this file.` }
}

/** What goes into an API / JSON response (never the row id). */
export function alertPublic(alert: ConsumerAlert | null): { statement: string; created_at: string; expires_at: string } | null {
  return alert ? { statement: alert.statement, created_at: alert.created_at, expires_at: alert.expires_at } : null
}
