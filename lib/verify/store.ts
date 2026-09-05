// Server-side persistence for verification requests. Service role only —
// these helpers are called from /api/verify/* routes, never from the browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  ScreeningVerification, VerificationRequestRow, VerifyPublicView, VerifyStep, VerifyStepKey, VerifySteps,
} from './types'
import { CONSENT_VERSION } from './consent'
import { veriffConfigured } from './providers/veriff'
import { flinksConfig } from './providers/flinks'

export function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function loadRequest(admin: SupabaseClient, token: string): Promise<VerificationRequestRow | null> {
  const { data } = await admin.from('verification_requests').select('*').eq('token', token).maybeSingle()
  return (data as VerificationRequestRow | null) ?? null
}

export function isExpired(row: VerificationRequestRow): boolean {
  return Date.parse(row.expires_at) < Date.now() || row.status === 'expired'
}

// Which providers exist in this deployment. The credit pull has no signed
// provider yet — it renders as "未开通" until CREDIT_PULL_PROVIDER is set.
export function providerAvailability(): Record<VerifyStepKey, { available: boolean; provider: string | null; sandbox: boolean }> {
  const f = flinksConfig()
  return {
    id: { available: veriffConfigured(), provider: veriffConfigured() ? 'veriff' : null, sandbox: false },
    // Flinks needs issued credentials even on the public toolbox instance
    // (the tokens on its help page are stale) — without them the step would
    // be clickable but always fail, so it is "未开通" instead.
    bank: { available: !!(process.env.FLINKS_BEARER || process.env.FLINKS_AUTH_KEY), provider: 'flinks', sandbox: f.sandbox },
    credit: {
      available: !!process.env.CREDIT_PULL_PROVIDER,
      provider: process.env.CREDIT_PULL_PROVIDER || null,
      sandbox: false,
    },
  }
}

function stepSummary(key: VerifyStepKey, step: VerifyStep | undefined): string | null {
  if (!step?.result) return null
  if (key === 'id') {
    const r = step.result as { decision?: string; document_type?: string | null }
    return [r.decision, r.document_type].filter(Boolean).join(' · ') || null
  }
  if (key === 'bank') {
    const r = step.result as { institution?: string | null; accounts?: unknown[]; payroll_monthly_estimate?: number | null }
    const parts = [r.institution, r.accounts ? `${r.accounts.length} account(s)` : null]
    if (typeof r.payroll_monthly_estimate === 'number') parts.push(`~$${Math.round(r.payroll_monthly_estimate)}/mo recurring`)
    return parts.filter(Boolean).join(' · ') || null
  }
  return null
}

export function toPublicView(row: VerificationRequestRow): VerifyPublicView {
  const avail = providerAvailability()
  const steps = {} as VerifyPublicView['steps']
  for (const key of ['id', 'bank', 'credit'] as VerifyStepKey[]) {
    const st = row.steps?.[key]
    const a = avail[key]
    steps[key] = {
      status: st?.status ?? (a.available ? 'pending' : 'not_configured'),
      provider: st?.provider ?? a.provider,
      sandbox: st?.sandbox ?? a.sandbox,
      summary: stepSummary(key, st),
    }
  }
  return {
    ok: true,
    status: isExpired(row) ? 'expired' : row.status,
    landlord_name: row.landlord_name,
    tenant_name: row.tenant_name,
    consent_version: CONSENT_VERSION,
    consented: !!row.consent,
    expires_at: row.expires_at,
    steps,
  }
}

export async function writeStep(
  admin: SupabaseClient,
  row: VerificationRequestRow,
  key: VerifyStepKey,
  step: Partial<VerifyStep> & { status: VerifyStep['status'] },
): Promise<VerifySteps> {
  const prev = row.steps?.[key] ?? { status: 'pending', provider: null, updated_at: new Date().toISOString() }
  const next: VerifySteps = {
    ...(row.steps || {}),
    [key]: { ...prev, ...step, updated_at: new Date().toISOString() },
  }
  const terminal = (s?: VerifyStep) => !s || ['verified', 'failed', 'skipped', 'not_configured'].includes(s.status)
  const avail = providerAvailability()
  const allDone = (['id', 'bank', 'credit'] as VerifyStepKey[]).every((k) => !avail[k].available || terminal(next[k]))
  const status = allDone && row.consent ? 'complete' : row.status
  await admin
    .from('verification_requests')
    .update({ steps: next, status, updated_at: new Date().toISOString() })
    .eq('id', row.id)
  await snapshotToScreening(admin, { ...row, steps: next, status })
  return next
}

// Denormalise onto the screening so scoring and the report read one column.
export async function snapshotToScreening(admin: SupabaseClient, row: VerificationRequestRow): Promise<void> {
  if (!row.consent) return
  const pick = <T,>(s?: VerifyStep<T>) => (s && s.result ? { ...(s.result as object), status: s.status } as T & { status: VerifyStep['status'] } : null)
  const snap: ScreeningVerification = {
    request_id: row.id,
    consent_version: row.consent.version,
    consented_at: row.consent.accepted_at,
    updated_at: new Date().toISOString(),
    sandbox: !!(row.steps?.id?.sandbox || row.steps?.bank?.sandbox || row.steps?.credit?.sandbox),
    id: pick(row.steps?.id) as ScreeningVerification['id'],
    bank: pick(row.steps?.bank) as ScreeningVerification['bank'],
    credit: pick(row.steps?.credit) as ScreeningVerification['credit'],
  }
  await admin.from('screenings').update({ verification: snap }).eq('id', row.screening_id)
}
