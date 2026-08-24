// -----------------------------------------------------------------------------
// Per-user data snapshot + on-demand lookup for the Personal Agent (2026-08-24).
//
// Problem this solves: the agent knew only memories + workflow, so it denied
// knowledge of the user's own applications / screenings / leases sitting in
// the DB. Two layers:
//   • buildUserContext() — a compact, role-shaped snapshot injected into the
//     system prompt on EVERY authed turn (parallel RLS queries, 4 s guard,
//     failures degrade to an empty block — never break the turn).
//   • runLookup() — the model's escape hatch: when it needs data the snapshot
//     doesn't carry, it returns {lookup: {entity, query}}; the route executes
//     ONE whitelisted RLS query and re-asks the model with the results.
//
// Every query runs on the CALLER'S RLS-scoped client — the agent can only
// ever see what the user themselves can see. Dual-ID rule applies throughout
// (landlords.id ≠ auth.uid → resolve with .or()).
// -----------------------------------------------------------------------------
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentRole } from './types'

const ROW_LIMIT = 6

function guard<T>(p: PromiseLike<T>, ms = 4000): Promise<T | null> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]).catch(() => null) as Promise<T | null>
}

const d = (s: unknown) => (typeof s === 'string' ? s.slice(0, 10) : '')
const money = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? `$${n.toLocaleString()}` : '?')

async function landlordIds(sb: SupabaseClient, uid: string): Promise<string[]> {
  const { data } = await sb.from('landlords').select('id').or(`id.eq.${uid},auth_id.eq.${uid}`)
  return Array.from(new Set([...(data ?? []).map((r: { id: string }) => r.id), uid]))
}

/** Compact zh snapshot of the user's own Stayloop data, per role. '' when nothing/anonymous. */
export async function buildUserContext(sb: SupabaseClient, role: AgentRole, uid: string | null): Promise<string> {
  if (!uid) return ''
  try {
    if (role === 'landlord') return (await guard(landlordContext(sb, uid), 4500)) || ''
    if (role === 'tenant') return (await guard(tenantContext(sb, uid), 4500)) || ''
    return ''
  } catch {
    return ''
  }
}

async function landlordContext(sb: SupabaseClient, uid: string): Promise<string> {
  const ids = await landlordIds(sb, uid)
  const [profile, apps, screenings, leases, tickets] = await Promise.all([
    guard(sb.from('landlords').select('full_name,email,plan,company_name').or(`id.eq.${uid},auth_id.eq.${uid}`).limit(1).maybeSingle()),
    // Applications are RLS-scoped ("Landlords see own applications") — no owner filter, per the dual-ID rule.
    guard(sb.from('applications').select('first_name,last_name,status,ai_score,monthly_income,created_at,listing:listings(address,unit)').order('created_at', { ascending: false }).limit(ROW_LIMIT)),
    guard(sb.from('screenings').select('tenant_name,ai_score,v3_tier,status,created_at').order('created_at', { ascending: false }).limit(ROW_LIMIT)),
    guard(sb.from('lease_documents').select('tenant_name,status,monthly_rent,end_date,unit_label').in('landlord_id', ids).order('end_date', { ascending: false }).limit(20)),
    guard(sb.from('maintenance_tickets').select('title,status,priority,created_at').not('status', 'in', '(done,cancelled)').order('created_at', { ascending: false }).limit(5)),
  ])
  const lines: string[] = []
  const p = profile?.data as { full_name?: string; email?: string; plan?: string; company_name?: string } | null
  if (p) lines.push(`- 账号: ${[p.full_name, p.company_name, p.email].filter(Boolean).join(' · ')}${p.plan ? ` · 计划 ${p.plan}` : ''}`)
  const appRows = (apps?.data ?? []) as Array<{ first_name?: string; last_name?: string; status?: string; ai_score?: number; monthly_income?: number; created_at?: string; listing?: { address?: string; unit?: string } | null }>
  if (appRows.length) {
    lines.push(`- 收到的租房申请(最近 ${appRows.length} 条):`)
    for (const a of appRows) lines.push(`  · ${[a.first_name, a.last_name].filter(Boolean).join(' ') || '(未具名)'} → ${[a.listing?.unit, a.listing?.address].filter(Boolean).join(' ') || '?'} · 状态 ${a.status || '?'}${typeof a.ai_score === 'number' ? ` · AI 评分 ${a.ai_score}` : ''}${a.monthly_income ? ` · 月收入 ${money(a.monthly_income)}` : ''} · ${d(a.created_at)}`)
  } else lines.push('- 收到的租房申请: 0 条')
  const scr = (screenings?.data ?? []) as Array<{ tenant_name?: string; ai_score?: number; v3_tier?: string; status?: string; created_at?: string }>
  if (scr.length) {
    lines.push(`- 租客筛查记录(最近 ${scr.length} 条):`)
    for (const s of scr) lines.push(`  · ${s.tenant_name || '(未具名)'} · ${s.status === 'scored' ? `总分 ${s.ai_score ?? '?'}${s.v3_tier ? ` · ${s.v3_tier}` : ''}` : `状态 ${s.status}`} · ${d(s.created_at)}`)
  }
  const leaseRows = (leases?.data ?? []) as Array<{ tenant_name?: string; status?: string; monthly_rent?: number; end_date?: string; unit_label?: string }>
  const activeLeases = leaseRows.filter((l) => l.status === 'active' || l.status === 'signed_both')
  if (leaseRows.length) {
    lines.push(`- 租约: 共 ${leaseRows.length} 份,生效中 ${activeLeases.length} 份`)
    const soon = activeLeases.filter((l) => l.end_date && (Date.parse(l.end_date) - Date.now()) / 86_400_000 <= 120)
    for (const l of soon.slice(0, 4)) lines.push(`  · ${l.tenant_name || '?'}${l.unit_label ? ` @ ${l.unit_label}` : ''} · ${money(l.monthly_rent)}/月 · ${d(l.end_date)} 到期(120 天窗口内)`)
  }
  const tk = (tickets?.data ?? []) as Array<{ title?: string; status?: string; priority?: string }>
  if (tk.length) lines.push(`- 未关闭报修 ${tk.length} 条: ${tk.map((t) => `${t.title || '?'}(${t.status}${t.priority ? `/${t.priority}` : ''})`).join('; ')}`)
  return wrap(lines)
}

async function tenantContext(sb: SupabaseClient, uid: string): Promise<string> {
  const [tenant, leases] = await Promise.all([
    guard(sb.from('tenants').select('id,full_name,email,tier').eq('auth_id', uid).maybeSingle()),
    // RLS ("leases_parties") scopes lease rows to this tenant.
    guard(sb.from('lease_documents').select('status,monthly_rent,start_date,end_date,unit_label,listing:listings(address,unit,city)').order('created_at', { ascending: false }).limit(5)),
  ])
  const t = tenant?.data as { id?: string; full_name?: string; email?: string; tier?: number } | null
  const [intents, tickets] = await Promise.all([
    t?.id ? guard(sb.from('showing_intents').select('status,created_at,listing:listings(address)').eq('tenant_id', t.id).order('created_at', { ascending: false }).limit(4)) : Promise.resolve(null),
    t?.id ? guard(sb.from('maintenance_tickets').select('title,status,priority').eq('tenant_id', t.id).not('status', 'in', '(done,cancelled)').limit(4)) : Promise.resolve(null),
  ])
  const lines: string[] = []
  if (t) lines.push(`- 账号: ${[t.full_name, t.email].filter(Boolean).join(' · ')}${typeof t.tier === 'number' ? ` · 租客护照认证 ${t.tier} 级` : ''}`)
  const leaseRows = (leases?.data ?? []) as Array<{ status?: string; monthly_rent?: number; start_date?: string; end_date?: string; unit_label?: string; listing?: { address?: string; unit?: string; city?: string } | null }>
  if (leaseRows.length) {
    lines.push(`- 我的租约(${leaseRows.length} 份):`)
    for (const l of leaseRows.slice(0, 3)) lines.push(`  · ${[l.listing?.unit, l.listing?.address].filter(Boolean).join(' ') || l.unit_label || '?'} · ${money(l.monthly_rent)}/月 · ${d(l.start_date)}→${d(l.end_date) || '?'} · 状态 ${l.status}`)
  }
  const it = (intents?.data ?? []) as Array<{ status?: string; listing?: { address?: string } | null }>
  if (it.length) lines.push(`- 看房意向: ${it.map((x) => `${x.listing?.address || '?'}(${x.status})`).join('; ')}`)
  const tk = (tickets?.data ?? []) as Array<{ title?: string; status?: string }>
  if (tk.length) lines.push(`- 未关闭报修: ${tk.map((x) => `${x.title}(${x.status})`).join('; ')}`)
  return wrap(lines)
}

function wrap(lines: string[]): string {
  if (!lines.length) return ''
  return (
    '\n\n## 用户数据快照（Stayloop 数据库实时记录 —— 回答用户自己的数据时以此为准，不要说“我没有你的资料”）\n' +
    lines.join('\n') +
    '\n（快照只含最近几条；用户问到快照之外、但库里可能有的自身数据时，用 lookup 字段发起查询，系统会立刻查库并让你基于结果作答。缺的字段就是库里没有——不要臆测。）'
  )
}

// ── On-demand lookup ─────────────────────────────────────────────────────────

export const LOOKUP_ENTITIES = ['applications', 'screenings', 'leases', 'maintenance', 'listings', 'payments'] as const
export type LookupEntity = (typeof LOOKUP_ENTITIES)[number]

/** Validate the model's lookup request (pure — tested). */
export function parseLookup(raw: unknown): { entity: LookupEntity; query: string | null } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const entity = typeof r.entity === 'string' ? (r.entity.trim() as LookupEntity) : null
  if (!entity || !LOOKUP_ENTITIES.includes(entity)) return null
  const query = typeof r.query === 'string' && r.query.trim() ? r.query.trim().slice(0, 80) : null
  return { entity, query }
}

/** Execute one whitelisted, RLS-scoped lookup and format the rows for the model. */
export async function runLookup(
  sb: SupabaseClient,
  role: AgentRole,
  uid: string,
  lookup: { entity: LookupEntity; query: string | null },
): Promise<string> {
  const like = lookup.query ? `%${lookup.query.replace(/[%_]/g, ' ')}%` : null
  try {
    if (lookup.entity === 'applications') {
      let q = sb.from('applications').select('first_name,last_name,email,status,ai_score,monthly_income,employer_name,move_in_date,created_at,listing:listings(address,unit)').order('created_at', { ascending: false }).limit(10)
      if (like) q = q.or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
      const { data } = await q
      return fmt('租房申请', (data ?? []).map((a: Record<string, any>) => `${[a.first_name, a.last_name].filter(Boolean).join(' ')} → ${[a.listing?.unit, a.listing?.address].filter(Boolean).join(' ')} · 状态 ${a.status} · AI ${a.ai_score ?? '—'} · 月收入 ${money(a.monthly_income)} · 雇主 ${a.employer_name || '—'} · 期望入住 ${d(a.move_in_date) || '—'} · ${d(a.created_at)}`))
    }
    if (lookup.entity === 'screenings') {
      let q = sb.from('screenings').select('tenant_name,ai_score,v3_tier,status,red_flags,hard_gates_triggered,created_at').order('created_at', { ascending: false }).limit(10)
      if (like) q = q.ilike('tenant_name', like)
      const { data } = await q
      return fmt('租客筛查', (data ?? []).map((s: Record<string, any>) => `${s.tenant_name || '(未具名)'} · ${s.status === 'scored' ? `总分 ${s.ai_score ?? '?'}${s.v3_tier ? ` · ${s.v3_tier}` : ''}` : `状态 ${s.status}`}${Array.isArray(s.hard_gates_triggered) && s.hard_gates_triggered.length ? ` · 硬门槛 ${s.hard_gates_triggered.join(',')}` : ''}${Array.isArray(s.red_flags) && s.red_flags.length ? ` · 风险标记 ${s.red_flags.length} 项` : ''} · ${d(s.created_at)}`))
    }
    if (lookup.entity === 'leases') {
      const ids = role === 'landlord' ? await landlordIds(sb, uid) : null
      let q = sb.from('lease_documents').select('tenant_name,status,monthly_rent,start_date,end_date,unit_label,listing:listings(address,unit)').order('created_at', { ascending: false }).limit(10)
      if (ids) q = q.in('landlord_id', ids)
      if (like) q = q.or(`tenant_name.ilike.${like},unit_label.ilike.${like}`)
      const { data } = await q
      return fmt('租约', (data ?? []).map((l: Record<string, any>) => `${l.tenant_name || '?'} @ ${[l.listing?.unit, l.listing?.address].filter(Boolean).join(' ') || l.unit_label || '?'} · ${money(l.monthly_rent)}/月 · ${d(l.start_date)}→${d(l.end_date) || '?'} · 状态 ${l.status}`))
    }
    if (lookup.entity === 'maintenance') {
      let q = sb.from('maintenance_tickets').select('title,description,status,priority,category,created_at,resolved_at').order('created_at', { ascending: false }).limit(10)
      if (like) q = q.or(`title.ilike.${like},description.ilike.${like}`)
      const { data } = await q
      return fmt('报修工单', (data ?? []).map((t: Record<string, any>) => `${t.title || '?'} · ${t.category || '—'} · ${t.status}${t.priority ? `/${t.priority}` : ''} · 创建 ${d(t.created_at)}${t.resolved_at ? ` · 解决 ${d(t.resolved_at)}` : ''}`))
    }
    if (lookup.entity === 'listings') {
      const ids = role === 'landlord' ? await landlordIds(sb, uid) : null
      let q = sb.from('listings').select('title,address,unit,city,monthly_rent,bedrooms,bathrooms,is_active,verification_status,source').order('created_at', { ascending: false }).limit(10)
      if (ids) q = q.in('landlord_id', ids)
      if (like) q = q.or(`address.ilike.${like},title.ilike.${like}`)
      const { data } = await q
      return fmt('房源', (data ?? []).map((l: Record<string, any>) => `${[l.unit, l.address].filter(Boolean).join(' ')} · ${money(l.monthly_rent)}/月 · ${l.bedrooms ?? '?'}卧${l.bathrooms ?? '?'}浴 · ${l.is_active ? (l.source === 'realtor' ? '上架中(Realtor.ca)' : l.verification_status === 'verified' ? '上架中' : '待审核') : '已下架'}`))
    }
    if (lookup.entity === 'payments') {
      const { data } = await sb.from('rent_payments').select('due_date,amount,status,lease_id').order('due_date', { ascending: false }).limit(12)
      return fmt('租金记录', (data ?? []).map((p: Record<string, any>) => `${d(p.due_date)} · ${money(p.amount)} · ${p.status}`))
    }
  } catch (e) {
    return `（查询失败：${(e as Error)?.message?.slice(0, 120) || 'error'} —— 如实告诉用户没查到，请他到对应页面查看。）`
  }
  return '（未支持的查询实体。）'
}

function fmt(label: string, rows: string[]): string {
  if (!rows.length) return `（${label}：按当前条件没有查到记录 —— 如实告诉用户，并提示可能的原因（名字拼写/尚未创建）。）`
  return `${label}（RLS 范围内最近 ${rows.length} 条）:\n` + rows.map((r) => `- ${r}`).join('\n')
}
