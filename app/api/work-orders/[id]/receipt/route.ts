// POST /api/work-orders/[id]/receipt { lang?, acting_role? } — the settlement
// (or acceptance) record of one work order as printable HTML (节点 6). Any
// party (RLS read of the row proves it) may generate it; the audit row carries
// the work order and the rental matter. Not an invoice: Stayloop moved no money.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { WORK_ORDER_COLUMNS, invoiceWithinEstimate } from '@/lib/marketplace/workOrders'
import { canonicalJson, renderReceipt, type ReceiptData } from '@/lib/export/evidencePack'
import { ensureMatter } from '@/lib/matters/server'

export const runtime = 'edge'
const UUID = /^[0-9a-f-]{36}$/i
const HATS = new Set(['tenant', 'landlord', 'agent', 'provider', 'admin'])
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  let body: { lang?: string; acting_role?: string }
  try { body = (await req.json()) as typeof body } catch { body = {} }
  if (!(await underHourlyLimit(`wo-receipt:${ud.user.id}`, 40, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  // RLS: only a party reads the row.
  const { data: wo } = await sb.from('work_orders').select(WORK_ORDER_COLUMNS).eq('id', id).maybeSingle()
  if (!wo) return NextResponse.json({ error: 'not_a_party' }, { status: 403 })
  const w = wo as unknown as Record<string, unknown>
  if (!['accepted', 'paid', 'closed'].includes(String(w.status))) return NextResponse.json({ error: 'not_settled' }, { status: 409 })
  const lang: 'zh' | 'en' = body.lang === 'en' ? 'en' : 'zh'

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const [{ data: ev }, { data: hh }, { data: ll }, { data: prov }] = await Promise.all([
    admin.from('work_order_events').select('created_at, actor_kind, event, payload').eq('work_order_id', id).order('id'),
    admin.from('households').select('address, unit, city').eq('id', w.household_id as string).maybeSingle(),
    admin.auth.admin.getUserById(w.landlord_auth_id as string),
    w.provider_id ? admin.from('service_providers').select('legal_name, trade_name, business_number').eq('id', w.provider_id as string).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const h = hh as { address: string; unit: string | null; city: string | null } | null
  const p = prov as { legal_name: string; trade_name: string | null; business_number: string | null } | null
  const cpa = invoiceWithinEstimate(w.approved_amount as number | null, w.invoice_amount as number | null)
  const data: ReceiptData = {
    work_order: {
      id, status: String(w.status), trade: (w.trade as string) ?? null, scope: (w.scope as string) ?? null, emergency: !!w.emergency,
      contractor: p ? `${p.trade_name || p.legal_name}${p.trade_name ? ` (${p.legal_name})` : ''}` : ((w.external_name as string) || (w.external_email as string) || 'contractor'),
      provider_business_number: p?.business_number ?? null,
      household: h ? [h.address, h.unit ? `#${h.unit}` : null, h.city].filter(Boolean).join(', ') : null,
      landlord: ll?.user?.email ?? String(w.landlord_auth_id).slice(0, 8),
      quote_amount: (w.quote_amount as number) ?? null, quote_version: (w.quote_version as number) ?? null, approved_amount: (w.approved_amount as number) ?? null, invoice_amount: (w.invoice_amount as number) ?? null,
      created_at: String(w.created_at), quoted_at: (w.quoted_at as string) ?? null, approved_at: (w.approved_at as string) ?? null, arrived_at: (w.arrived_at as string) ?? null, completed_at: (w.completed_at as string) ?? null, accepted_at: (w.accepted_at as string) ?? null, paid_at: (w.paid_at as string) ?? null,
      payment_mode: (w.payment_mode as string) ?? null, decline_code: (w.decline_code as string) ?? null, cancel_reason: (w.cancel_reason as string) ?? null,
      events: ((ev ?? []) as { created_at: string; actor_kind: string; event: string; payload: Record<string, unknown> }[]),
    },
    cpa,
  }
  const fingerprint = await sha256Hex(canonicalJson(data))
  const actingRole = HATS.has(String(body.acting_role)) ? String(body.acting_role) : null
  const html = renderReceipt(data, { lang, generatedAt: new Date().toISOString(), generatedBy: `${ud.user.email ?? ud.user.id.slice(0, 8)}${actingRole ? ` (${actingRole})` : ''}`, fingerprint, siteUrl: SITE() })
  const matterId = await ensureMatter(admin, 'work_order', id)
  await admin.from('agent_audit_events').insert({
    actor_id: ud.user.id, actor_type: 'user', action: 'work_order_receipt_generated', target_type: 'work_order', target_id: id, acting_role: actingRole,
    matter_type: 'work_order', matter_id: id, rental_matter_id: matterId, metadata: { fingerprint, status: w.status, paid: !!w.paid_at, lang },
  }).then(() => undefined, () => undefined)
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Fingerprint': fingerprint } })
}
