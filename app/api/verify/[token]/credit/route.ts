import { NextRequest, NextResponse } from 'next/server'
import { isVerifyToken } from '@/lib/verify/token'
import { adminClient, isExpired, loadRequest, providerAvailability, toPublicView, writeStep } from '@/lib/verify/store'
import { creditProvider, creditProviderIsSandbox, pullCredit } from '@/lib/verify/providers/equifax'

export const runtime = 'edge'

// POST /api/verify/<token>/credit — the applicant's own credit pull.
// Body: { first_name, last_name, date_of_birth, address:{line1,city,province,postal_code} }
// Requires consent. Stores the report in our CreditReport shape (no SIN is
// ever collected); the deterministic analysis layer runs at read time.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!isVerifyToken(token)) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  const admin = adminClient()
  const row = await loadRequest(admin, token)
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (isExpired(row)) return NextResponse.json({ ok: false, error: 'expired' }, { status: 410 })
  if (!row.consent) return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 403 })
  if (!providerAvailability().credit.available) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 404 })

  const b = (await req.json().catch(() => ({}))) as Record<string, any>
  const s = (v: unknown, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const input = {
    first_name: s(b.first_name), last_name: s(b.last_name), date_of_birth: s(b.date_of_birth, 10),
    address: { line1: s(b.address?.line1, 120), city: s(b.address?.city), province: s(b.address?.province, 2).toUpperCase(), postal_code: s(b.address?.postal_code, 7).toUpperCase() },
  }
  if (!input.first_name || !input.last_name || !/^\d{4}-\d{2}-\d{2}$/.test(input.date_of_birth) || !input.address.line1 || !input.address.city || !input.address.province || !input.address.postal_code) {
    return NextResponse.json({ ok: false, error: 'fields_required' }, { status: 400 })
  }
  // Review 2026-09-14: the token is held by the landlord too, so the pull
  // must be tied to the person who verified / consented, not to whatever
  // name and DOB were typed. With a Veriff-approved identity on this
  // request the typed name must match it; without one it must match the
  // consent signature and the applicant the landlord named.
  const norm = (x: string | null | undefined) => (x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1)
  const inputToks = norm(`${input.first_name} ${input.last_name}`)
  const overlaps = (name: string | null | undefined) => { const t = norm(name); return t.length > 0 && inputToks.length > 0 && t.some((x) => inputToks.includes(x)) && inputToks.some((x) => t.includes(x)) }
  const idStep = row.steps?.id
  const idRes = idStep && idStep.status === 'verified' ? (idStep.result as { first_name?: string | null; last_name?: string | null; decision?: string } | null) : null
  if (idRes) {
    if (!overlaps(`${idRes.first_name || ''} ${idRes.last_name || ''}`)) {
      return NextResponse.json({ ok: false, error: 'identity_mismatch', detail: 'The name entered does not match the identity verified on this request.' }, { status: 403 })
    }
  } else {
    const signed = row.consent?.typed_name
    const named = (row as { tenant_name?: string | null }).tenant_name
    if (!overlaps(signed) || (named && !overlaps(named))) {
      return NextResponse.json({ ok: false, error: 'identity_mismatch', detail: 'The name entered must match the consent signature and the applicant this request was created for.' }, { status: 403 })
    }
  }
  const provider = creditProvider() || 'unknown'
  const sandbox = creditProviderIsSandbox()
  try {
    await writeStep(admin, row, 'credit', { status: 'submitted', provider, sandbox })
    const result = await pullCredit(input)
    const steps = await writeStep(admin, row, 'credit', {
      status: result.report ? 'verified' : 'failed', provider, sandbox, session_id: result.reference, result, error: null,
    })
    return NextResponse.json(toPublicView({ ...row, steps }))
  } catch (err: any) {
    const msg = String(err?.message || 'credit pull failed').slice(0, 200)
    console.error('verify/credit error', msg)
    const steps = await writeStep(admin, row, 'credit', { status: 'failed', provider, sandbox, error: msg })
    return NextResponse.json({ ...toPublicView({ ...row, steps }), error: 'provider_error', detail: msg }, { status: 502 })
  }
}
