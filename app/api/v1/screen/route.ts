// POST /api/v1/screen — partner-initiated screening (Trust API plan §3.3).
// Same pipeline as the product; the differences are the door: a partner key
// bound to a landlord account, a mandatory applicant-consent record, files
// fetched from the partner's URLs into our bucket, and an optional webhook
// that receives the result. The run itself is the screen-score route in
// partner mode (x-partner-key), so scoring, quotas and compliance rules are
// identical to a landlord clicking the button.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestContext } from '@cloudflare/next-on-pages'

export const runtime = 'edge'

const MAX_FILE = 25 * 1024 * 1024
const MAX_FILES = 14
const CONSENT_VERSION = 'v1-2026-09'

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

type Body = {
  applicant_name?: string
  monthly_rent?: number
  files?: { url: string; name?: string; kind?: string }[]
  consent?: { version?: string; accepted_at?: string; typed_name?: string }
  external_ref?: string
  webhook_url?: string
  notes?: string
}

export async function POST(req: Request) {
  const apiKey = (req.headers.get('x-api-key') || '').trim()
  if (!apiKey) return NextResponse.json({ error: 'x-api-key header required' }, { status: 401 })
  let body: Body
  try { body = (await req.json()) as Body } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: partner } = await admin.from('trust_api_keys').select('id, partner_name, active, landlord_auth_id').eq('api_key_hash', await sha256Hex(apiKey)).eq('active', true).maybeSingle()
  if (!partner) return NextResponse.json({ error: 'invalid or inactive api key' }, { status: 403 })
  if (!partner.landlord_auth_id) return NextResponse.json({ error: 'this key is not bound to a landlord account; ask Stayloop to bind one' }, { status: 403 })
  const { data: rateCount, error: rateErr } = await admin.rpc('bump_trust_api_rate', { p_api_key_id: partner.id })
  if (rateErr) return NextResponse.json({ error: 'rate limiter unavailable — retry shortly' }, { status: 503, headers: { 'Retry-After': '30' } })
  if (typeof rateCount === 'number' && rateCount > 20) return NextResponse.json({ error: 'rate limit exceeded (20 screenings / minute)' }, { status: 429, headers: { 'Retry-After': '60' } })

  // Consent is not optional: the applicant must have accepted the same
  // versioned text the product uses (lib/verify/consent.ts).
  const c = body.consent || {}
  if (c.version !== CONSENT_VERSION || !c.accepted_at || !c.typed_name) {
    return NextResponse.json({ error: `consent required: { version: "${CONSENT_VERSION}", accepted_at, typed_name } — the applicant must accept Stayloop's screening consent text` }, { status: 422 })
  }
  const files = Array.isArray(body.files) ? body.files.filter((f) => typeof f?.url === 'string' && /^https:\/\//i.test(f.url)).slice(0, MAX_FILES) : []
  if (!files.length) return NextResponse.json({ error: 'files[] with https urls required' }, { status: 422 })
  const name = String(body.applicant_name || '').trim().slice(0, 120)
  const rent = Number.isFinite(Number(body.monthly_rent)) ? Number(body.monthly_rent) : null
  const webhook = typeof body.webhook_url === 'string' && /^https:\/\//i.test(body.webhook_url) ? body.webhook_url.slice(0, 500) : null

  const landlordId = partner.landlord_auth_id as string
  const { data: row, error: rErr } = await admin.from('screenings').insert({
    landlord_id: landlordId, tenant_name: name || null, monthly_rent: rent, status: 'uploading', files: [],
    notes: `[partner: ${partner.partner_name}] consent ${c.version} accepted ${c.accepted_at} by ${String(c.typed_name).slice(0, 80)}${body.external_ref ? `\nexternal_ref: ${String(body.external_ref).slice(0, 120)}` : ''}${body.notes ? `\n${String(body.notes).slice(0, 500)}` : ''}`,
    partner_key_id: partner.id, external_ref: typeof body.external_ref === 'string' ? body.external_ref.slice(0, 120) : null, webhook_url: webhook,
  }).select('id').single()
  if (rErr || !row) return NextResponse.json({ error: rErr?.message || 'could not create screening' }, { status: 500 })

  // Pull the partner's files into our bucket (same 25 MB cap as the UI).
  const manifest: { path: string; name: string; size: number; mime: string; kind: string }[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    try {
      const res = await fetch(f.url, { redirect: 'follow' })
      if (!res.ok) continue
      const buf = await res.arrayBuffer()
      if (buf.byteLength === 0 || buf.byteLength > MAX_FILE) continue
      const mime = res.headers.get('content-type')?.split(';')[0] || 'application/octet-stream'
      const safe = String(f.name || `file-${i + 1}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
      const path = `screenings/${landlordId}/${row.id}/partner_${i + 1}_${safe}`
      const { error: upErr } = await admin.storage.from('tenant-files').upload(path, buf, { contentType: mime, upsert: false })
      if (upErr) continue
      manifest.push({ path, name: safe, size: buf.byteLength, mime, kind: typeof f.kind === 'string' ? f.kind.slice(0, 40) : 'other' })
    } catch { /* skip this file */ }
  }
  if (!manifest.length) {
    await admin.from('screenings').update({ status: 'error', error: 'no files could be fetched' }).eq('id', row.id)
    return NextResponse.json({ error: 'none of the files could be fetched (https, ≤25 MB, reachable)' }, { status: 422 })
  }
  await admin.from('screenings').update({ files: manifest }).eq('id', row.id)
  await admin.from('trust_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', partner.id)
  await admin.from('agent_audit_events').insert({ actor_id: landlordId, actor_type: 'system', action: 'trust_api_screen_started', target_type: 'screening', target_id: row.id, metadata: { partner_id: partner.id, partner_name: partner.partner_name, files: manifest.length } })

  // Run in the background; the caller gets the id now and the webhook later.
  const origin = new URL(req.url).origin
  const run = (async () => {
    let result: Record<string, unknown> = {}
    let status = 'error'
    try {
      const r = await fetch(`${origin}/api/screen-score`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-partner-key': apiKey }, body: JSON.stringify({ screening_id: row.id }) })
      result = (await r.json().catch(() => ({}))) as Record<string, unknown>
      status = r.ok && typeof result.overall === 'number' ? 'scored' : 'error'
    } catch (e) { result = { error: (e as Error).message } }
    if (webhook) {
      const payload = status === 'scored'
        ? { screening_id: row.id, external_ref: body.external_ref ?? null, status, overall: result.overall, tier: result.tier ?? null, hard_gates: result.hard_gates ?? [], report_url: `${origin}/screening/${row.id}/report`, notice_letter_url: `${origin}/screening/${row.id}/notice`, boundary: 'Score and tier are information for the landlord\'s own decision — never grounds to decline (OHRC). Not a consumer report.' }
        : { screening_id: row.id, external_ref: body.external_ref ?? null, status, error: result.error ?? 'scoring failed' }
      try { await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Stayloop-Event': 'screening.completed' }, body: JSON.stringify(payload) }) } catch { /* partner endpoint down */ }
    }
  })()
  try { getRequestContext().ctx.waitUntil(run) } catch { void run }

  return NextResponse.json({ ok: true, screening_id: row.id, status: 'queued', files: manifest.length, webhook: !!webhook, report_url: `${origin}/screening/${row.id}/report` }, { status: 202 })
}
