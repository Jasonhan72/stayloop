// Bank step (Flinks) — the server side of reading an applicant's bank after Flinks Connect
// hands the page a loginId (hardening B2 / B5 / B6, design/flinks-production-plan-2026-10-19.md).
//
//   startBankRead  Authorize → first GetAccountsDetail. Done → finish. 202 → the read is
//                  parked in verification_bank_reads (service role only) and continued by
//                  pollBankRead (the page, every 5 s) or sweepBankReads (hourly cron).
//   finish         summary → steps.bank → audit → DeleteCard.
//   DeleteCard     A loginId never expires and can pull the account again, so it is deleted
//                  at Flinks as soon as the summary is stored. If Flinks refuses (CARD_IN_USE
//                  right after Authorize is normal) the id stays in verification_bank_reads
//                  with phase 'delete' and the sweep retries. It is never written to
//                  verification_requests (which the landlord can read) — only login_ref.
//
// Every Flinks call goes through an injected FlinksApi so the flow is testable offline.
import type { SupabaseClient } from '@supabase/supabase-js'
import { FlinksError, flinksConfig, flinksToBankResult, type DetailResponse, type FlinksApi } from './providers/flinks'
import { writeStep } from './store'
import { normalizeBankErrorCode } from './bankErrors'
import type { VerificationRequestRow, VerifyStep, VerifySteps } from './types'

/** A parked read is given up after this long. The page polls ~10 min; the hourly sweep gets at least one more go. */
export const BANK_READ_TIMEOUT_MS = 2 * 60 * 60_000
/** The sweep leaves a read alone while the page is polling it. */
export const SWEEP_SKIP_RECENT_MS = 60_000
/** Request rows whose bank / identity / credit details are reduced to statuses (B4). */
export const VERIFY_DETAIL_RETENTION_DAYS = 90

export type BankOutcome = { state: 'reading' } | { state: 'verified' } | { state: 'failed'; code: string | null }

export type BankReadRow = {
  login_id: string
  verification_request_id: string | null
  phase: 'reading' | 'delete'
  flinks_request_id: string | null
  sandbox: boolean
  attempts: number
  created_at: string
  last_attempt_at: string | null
  last_error: string | null
}

const TABLE = 'verification_bank_reads'

export async function loginRef(loginId: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(loginId))
  return Array.from(new Uint8Array(d)).slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function codeOf(e: unknown): string | null {
  return e instanceof FlinksError ? e.code : null
}
function messageOf(e: unknown): string {
  return String((e as Error)?.message || 'flinks error').slice(0, 200)
}

async function audit(admin: SupabaseClient, requestId: string | null, action: string, metadata: Record<string, unknown>): Promise<void> {
  await admin.from('agent_audit_events').insert({
    actor_id: null, actor_type: 'system', action, target_type: 'verification_request', target_id: requestId, metadata,
  }).then(() => undefined, () => undefined)
}

/** DeleteCard now; on failure keep the id (phase 'delete') for the sweep. True when gone. */
export async function deleteConnection(admin: SupabaseClient, api: FlinksApi, requestId: string | null, loginId: string, sandbox: boolean, opts: { retryInUseMs?: number } = {}): Promise<boolean> {
  const ref = await loginRef(loginId)
  const attempt = async () => { await api.deleteCard(loginId) }
  try {
    try {
      await attempt()
    } catch (e) {
      // CARD_IN_USE: Flinks is still finishing the read it just served — one short retry.
      if (codeOf(e) !== 'CARD_IN_USE' || !opts.retryInUseMs) throw e
      await new Promise((r) => setTimeout(r, opts.retryInUseMs))
      await attempt()
    }
    await admin.from(TABLE).delete().eq('login_id', loginId)
    await audit(admin, requestId, 'verify_bank_connection_deleted', { login_ref: ref, sandbox })
    return true
  } catch (e) {
    const now = new Date().toISOString()
    const { data: prev } = await admin.from(TABLE).select('attempts').eq('login_id', loginId).maybeSingle<{ attempts: number }>()
    await admin.from(TABLE).upsert({
      login_id: loginId, verification_request_id: requestId, phase: 'delete', flinks_request_id: null, sandbox,
      attempts: (prev?.attempts ?? 0) + 1, last_attempt_at: now, last_error: codeOf(e) || messageOf(e),
    }, { onConflict: 'login_id' })
    await audit(admin, requestId, 'verify_bank_delete_deferred', { login_ref: ref, sandbox, code: codeOf(e) })
    return false
  }
}

async function failBankRead(admin: SupabaseClient, api: FlinksApi, row: VerificationRequestRow, loginId: string, sandbox: boolean, code: string | null, message: string, opts: { retryInUseMs?: number }): Promise<BankOutcome> {
  const c = normalizeBankErrorCode(code)
  await writeStep(admin, row, 'bank', { status: 'failed', provider: 'flinks', sandbox, error: message.slice(0, 200), error_code: c })
  await audit(admin, row.id, 'verify_bank_failed', { login_ref: await loginRef(loginId), sandbox, code })
  await deleteConnection(admin, api, row.id, loginId, sandbox, opts)
  return { state: 'failed', code: c }
}

async function finishBankRead(admin: SupabaseClient, api: FlinksApi, row: VerificationRequestRow, loginId: string, sandbox: boolean, detail: DetailResponse, opts: { retryInUseMs?: number }): Promise<BankOutcome> {
  const result = flinksToBankResult(detail)
  const ok = result.accounts.length > 0
  await writeStep(admin, row, 'bank', {
    status: ok ? 'verified' : 'failed', provider: 'flinks', sandbox, result,
    error: ok ? null : 'no usable account', error_code: ok ? null : 'NO_ACCOUNTS',
  })
  await audit(admin, row.id, ok ? 'verify_bank_read' : 'verify_bank_failed', {
    login_ref: await loginRef(loginId), sandbox, accounts: result.accounts.length, institution: result.institution, code: ok ? null : 'NO_ACCOUNTS',
  })
  await deleteConnection(admin, api, row.id, loginId, sandbox, opts)
  return ok ? { state: 'verified' } : { state: 'failed', code: 'NO_ACCOUNTS' }
}

/** POST /api/verify/<token>/bank — a fresh loginId from Flinks Connect. */
export async function startBankRead(admin: SupabaseClient, api: FlinksApi, row: VerificationRequestRow, loginId: string, opts: { retryInUseMs?: number } = { retryInUseMs: 3000 }): Promise<BankOutcome> {
  const sandbox = flinksConfig().sandbox
  const ref = await loginRef(loginId)
  // A reconnect supersedes any read still running for this request; its connection is deleted too.
  const { data: older } = await admin.from(TABLE).select('login_id').eq('verification_request_id', row.id).eq('phase', 'reading')
  for (const o of (older ?? []) as { login_id: string }[]) {
    if (o.login_id !== loginId) await deleteConnection(admin, api, row.id, o.login_id, sandbox)
  }
  await writeStep(admin, row, 'bank', { status: 'submitted', provider: 'flinks', session_id: null, login_ref: ref, sandbox, result: null, error: null, error_code: null })

  let requestId: string
  try {
    requestId = await api.authorize(loginId)
  } catch (e) {
    return failBankRead(admin, api, row, loginId, sandbox, codeOf(e), messageOf(e), opts)
  }
  await audit(admin, row.id, 'verify_bank_authorized', { login_ref: ref, sandbox })

  try {
    const step = await api.detailStart(requestId)
    if (step.ready) return finishBankRead(admin, api, row, loginId, sandbox, step.detail, opts)
  } catch (e) {
    return failBankRead(admin, api, row, loginId, sandbox, codeOf(e), messageOf(e), opts)
  }
  const now = new Date().toISOString()
  await admin.from(TABLE).upsert({
    login_id: loginId, verification_request_id: row.id, phase: 'reading', flinks_request_id: requestId, sandbox,
    attempts: 1, created_at: now, last_attempt_at: now, last_error: null,
  }, { onConflict: 'login_id' })
  return { state: 'reading' }
}

/** One GetAccountsDetailAsync step for a parked read. */
async function advanceRead(admin: SupabaseClient, api: FlinksApi, row: VerificationRequestRow, read: BankReadRow, now: number, opts: { retryInUseMs?: number }): Promise<BankOutcome> {
  if (!read.flinks_request_id) return failBankRead(admin, api, row, read.login_id, read.sandbox, 'READ_TIMEOUT', 'missing request id', opts)
  let step
  try {
    step = await api.detailPoll(read.flinks_request_id)
  } catch (e) {
    return failBankRead(admin, api, row, read.login_id, read.sandbox, codeOf(e), messageOf(e), opts)
  }
  if (step.ready) return finishBankRead(admin, api, row, read.login_id, read.sandbox, step.detail, opts)
  if (now - Date.parse(read.created_at) > BANK_READ_TIMEOUT_MS) {
    return failBankRead(admin, api, row, read.login_id, read.sandbox, 'READ_TIMEOUT', 'bank read did not finish in time', opts)
  }
  await admin.from(TABLE).update({ attempts: read.attempts + 1, last_attempt_at: new Date(now).toISOString() }).eq('login_id', read.login_id)
  return { state: 'reading' }
}

/** What steps.bank already says, as an outcome (nothing parked for this request). */
export function outcomeFromStep(step: VerifyStep | undefined): BankOutcome | null {
  if (step?.status === 'verified') return { state: 'verified' }
  if (step?.status === 'failed') return { state: 'failed', code: step.error_code ?? null }
  return null
}

/** POST /api/verify/<token>/bank/poll — the page asking "is it done yet?". */
export async function pollBankRead(admin: SupabaseClient, api: FlinksApi, row: VerificationRequestRow, now: number = Date.now(), opts: { retryInUseMs?: number } = { retryInUseMs: 3000 }): Promise<BankOutcome> {
  const { data } = await admin.from(TABLE).select('*').eq('verification_request_id', row.id).eq('phase', 'reading').order('created_at', { ascending: false }).limit(1).maybeSingle<BankReadRow>()
  if (data) return advanceRead(admin, api, row, data, now, opts)
  const known = outcomeFromStep(row.steps?.bank)
  if (known) return known
  // 'submitted' with nothing parked: the read was lost (e.g. a deploy mid-request).
  if (row.steps?.bank?.status === 'submitted') {
    await writeStep(admin, row, 'bank', { status: 'failed', provider: 'flinks', error: 'read lost', error_code: 'READ_TIMEOUT' })
    return { state: 'failed', code: 'READ_TIMEOUT' }
  }
  return { state: 'failed', code: null }
}

export type SweepReport = { finished: number; failed: number; reading: number; deleted: number; delete_failed: number; skipped: number }

/** Hourly (/api/cron/verify-sweep): finish or time out parked reads, retry deferred DeleteCards. */
export async function sweepBankReads(admin: SupabaseClient, api: FlinksApi, now: number = Date.now()): Promise<SweepReport> {
  const rep: SweepReport = { finished: 0, failed: 0, reading: 0, deleted: 0, delete_failed: 0, skipped: 0 }
  const { data } = await admin.from(TABLE).select('*').order('created_at', { ascending: true }).limit(50)
  for (const r of (data ?? []) as BankReadRow[]) {
    if (r.phase === 'delete') {
      if (await deleteConnection(admin, api, r.verification_request_id, r.login_id, r.sandbox)) rep.deleted++
      else rep.delete_failed++
      continue
    }
    if (r.last_attempt_at && now - Date.parse(r.last_attempt_at) < SWEEP_SKIP_RECENT_MS) { rep.skipped++; continue }
    const { data: req } = r.verification_request_id
      ? await admin.from('verification_requests').select('*').eq('id', r.verification_request_id).maybeSingle<VerificationRequestRow>()
      : { data: null }
    if (!req) {
      // The request (and its screening) was deleted: nothing to finish, only the connection to end.
      if (await deleteConnection(admin, api, null, r.login_id, r.sandbox)) rep.deleted++
      else rep.delete_failed++
      continue
    }
    const out = await advanceRead(admin, api, req, r, now, {})
    if (out.state === 'verified') rep.finished++
    else if (out.state === 'failed') rep.failed++
    else rep.reading++
  }
  return rep
}

/** Keep a step's status, drop what it learned. */
export function minimizeSteps(steps: VerifySteps | null | undefined): VerifySteps {
  const out: VerifySteps = {}
  for (const k of ['id', 'bank', 'credit'] as const) {
    const s = steps?.[k]
    if (!s) continue
    out[k] = { status: s.status, provider: s.provider ?? null, sandbox: !!s.sandbox, error_code: s.error_code ?? null, updated_at: s.updated_at } as never
  }
  return out
}

/**
 * B4: after VERIFY_DETAIL_RETENTION_DAYS a request row keeps statuses only (no holder names,
 * balances, deposits, decision details, session ids). The snapshot on screenings.verification
 * is the screening's own record and goes with the screening (screening module — untouched).
 */
export async function purgeVerificationDetails(admin: SupabaseClient, now: number = Date.now(), days: number = VERIFY_DETAIL_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(now - days * 86_400_000).toISOString()
  const { data } = await admin.from('verification_requests').select('id, steps').is('details_purged_at', null).lt('updated_at', cutoff).limit(200)
  let n = 0
  for (const r of (data ?? []) as { id: string; steps: VerifySteps | null }[]) {
    const { error } = await admin.from('verification_requests').update({ steps: minimizeSteps(r.steps), details_purged_at: new Date(now).toISOString() }).eq('id', r.id)
    if (!error) n++
  }
  return n
}
