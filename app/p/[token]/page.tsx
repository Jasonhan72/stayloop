// Public read-only Passport snapshot — /p/{token}
//
// Server-side (edge): validates the share token with the SERVICE ROLE key
// (passport_share_tokens has no anon read policy on purpose), assembles a
// minimal snapshot (initials + stamp statuses + rent punctuality — never
// documents, ID numbers or contact info) and hands it to the client view.
import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import PublicPassportView, { type PassportSnapshot } from './view'

export const runtime = 'edge'

export const metadata: Metadata = {
  title: 'Stayloop · 租客护照快照 / Passport snapshot',
  robots: { index: false, follow: false },
}

const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/

/** "陈美雅" → "陈**" · "Mia Chen" → "M.C." — initials only, never the full name. */
function toInitials(name: string | null | undefined, email: string | null | undefined): string {
  const n = (name || '').trim()
  if (n) {
    // CJK name: show the family-name character only.
    if (/[一-鿿]/.test(n[0])) return n[0]
    const parts = n.split(/\s+/).filter(Boolean)
    const letters = parts.slice(0, 2).map((p) => p[0].toUpperCase())
    if (letters.length) return letters.join('.') + '.'
  }
  const e = (email || '').trim()
  if (e) return e[0].toUpperCase() + '.'
  return '—'
}

async function loadSnapshot(token: string): Promise<PassportSnapshot | null> {
  if (!TOKEN_RE.test(token)) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: row, error } = await sb
    .from('passport_share_tokens')
    .select('token,tenant_user_id,created_at,expires_at,revoked_at,view_count')
    .eq('token', token)
    .maybeSingle()
  if (error || !row) return null
  if (row.revoked_at) return null
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null

  // View counter — best-effort (a lost race under concurrent views is fine).
  try {
    await sb
      .from('passport_share_tokens')
      .update({ view_count: (row.view_count ?? 0) + 1 })
      .eq('token', token)
  } catch {
    /* non-fatal */
  }

  // ── Tenant profile (name initials + tier) ───────────────────────────────
  let fullName: string | null = null
  let email: string | null = null
  let tier = 1
  let tenantId: string | null = null
  try {
    const { data: tenant } = await sb
      .from('tenants')
      .select('id,full_name,email,tier')
      .eq('auth_id', row.tenant_user_id)
      .maybeSingle()
    if (tenant) {
      tenantId = tenant.id
      fullName = tenant.full_name
      email = tenant.email
      tier = Math.min(Math.max(Number(tenant.tier) || 1, 1), 4)
    }
  } catch {
    /* tolerated — fall through to auth lookup */
  }
  if (!fullName && !email) {
    try {
      const { data } = await sb.auth.admin.getUserById(row.tenant_user_id)
      fullName = ((data?.user?.user_metadata as Record<string, unknown>)?.full_name as string) || null
      email = data?.user?.email || null
    } catch {
      /* tolerated */
    }
  }

  // ── Stamp statuses: tier N = first N stamped; rental_passports flags win ─
  const done: [boolean, boolean, boolean, boolean] = [tier >= 1, tier >= 2, tier >= 3, tier >= 4]
  if (tenantId) {
    try {
      const { data: pass } = await sb
        .from('rental_passports')
        .select('tier,id_verified,income_verified,bank_verified,credit_score,court_records_json')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (pass) {
        done[0] = !!pass.id_verified || (Number(pass.tier) || 0) >= 1
        done[1] = !!pass.income_verified || (Number(pass.tier) || 0) >= 2
        done[2] = !!pass.bank_verified || (Number(pass.tier) || 0) >= 3
        done[3] = pass.credit_score != null || pass.court_records_json != null || (Number(pass.tier) || 0) >= 4
      }
    } catch {
      /* tolerated — tenants.tier fallback stands */
    }
  }

  // ── Rent punctuality (statuses only — no amounts) ───────────────────────
  let rentRecord: PassportSnapshot['rentRecord'] = null
  if (tenantId) {
    try {
      const { data: leases } = await sb
        .from('lease_documents')
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(20)
      const leaseIds = (leases ?? []).map((l) => l.id)
      if (leaseIds.length) {
        const { data: pays } = await sb
          .from('rent_payments')
          .select('due_date,status')
          .in('lease_id', leaseIds)
          .in('status', ['paid', 'late'])
          .order('due_date', { ascending: false })
          .limit(12)
        if (pays && pays.length) {
          rentRecord = pays
            .reverse()
            .map((p) => ({ dueDate: p.due_date as string, status: p.status as 'paid' | 'late' }))
        }
      }
    } catch {
      /* tolerated — card simply hidden */
    }
  }

  return {
    initials: toInitials(fullName, email),
    stamps: done,
    stampedCount: done.filter(Boolean).length,
    rentRecord,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}

export default async function PublicPassportPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const snapshot = await loadSnapshot(token)
  return <PublicPassportView snapshot={snapshot} />
}
