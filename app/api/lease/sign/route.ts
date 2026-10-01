// /api/lease/sign — records an electronic signature on the lease.
// Two signer modes:
//   • tenant: token capability (no account needed) — { token, name }
//   • landlord: Bearer auth — { lease_id, name }
// Signatures are written with a CONDITIONAL update (only if that party
// hasn't signed yet) so a double-click can never overwrite a signature.
// When both parties have signed: status → signed_both, signed_at stamped,
// both parties emailed their permanent view/download links, audit written.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml, sendEmail } from '@/lib/email'
import { leaseHasTerms, leaseIsSignable } from '@/lib/lease/leaseState'
import { hasUsableInvite, householdAddressMayMatch, leaseAttachSlot, normalizeEmail, pickHouseholdForLease, sameTenancyAddress, type HouseholdCandidate, type InviteRow } from '@/lib/lease/householdMatch'
import { firstDueDate, rentDueDay, torontoDate } from '@/lib/household/ledger'

export const runtime = 'edge'

type LeaseRow = {
  id: string
  status: string
  terms: Record<string, unknown>
  tenant_name: string | null
  tenant_email: string | null
  unit_label: string | null
  sign_token: string | null
  landlord_signature: { name: string } | null
  tenant_signature: { name: string } | null
  landlord_id: string | null
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function POST(req: Request) {
  let body: { token?: string; lease_id?: string; name?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }
  const name = (body.name || '').trim()
  if (!name || name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: 'a full legal name is required to sign' }, { status: 400 })
  }
  const admin = adminClient()

  let lease: LeaseRow | null = null
  let signer: 'tenant' | 'landlord'
  let actorId: string | null = null

  if (body.token) {
    signer = 'tenant'
    const { data } = await admin
      .from('lease_documents')
      .select('id, status, terms, tenant_name, tenant_email, unit_label, sign_token, landlord_signature, tenant_signature, landlord_id')
      .eq('sign_token', body.token.trim())
      .maybeSingle<LeaseRow>()
    lease = data
  } else if (body.lease_id) {
    signer = 'landlord'
    const rawAuth = req.headers.get('authorization') || ''
    const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
    if (!authHeader) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data: ud, error: ue } = await sb.auth.getUser()
    if (ue || !ud?.user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    if (ud.user.is_anonymous) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    actorId = ud.user.id
    const { data } = await sb
      .from('lease_documents')
      .select('id, status, terms, tenant_name, tenant_email, unit_label, sign_token, landlord_signature, tenant_signature, landlord_id')
      .eq('id', body.lease_id)
      .maybeSingle<LeaseRow>()
    lease = data
    // An RLS read is NOT an ownership check here: the `leases_parties` policy
    // grants BOTH parties access to the row, so a tenant passing `lease_id`
    // would otherwise land a landlord_signature and fully execute the lease.
    // Verify the caller actually owns the landlord side.
    if (lease) {
      const { data: mine } = await sb.from('landlords').select('id').eq('auth_id', ud.user.id)
      const ownsLandlordSide = (mine ?? []).some((l: { id: string }) => l.id === lease!.landlord_id)
      if (!ownsLandlordSide) {
        return NextResponse.json({ error: 'not the landlord on this lease' }, { status: 403 })
      }
    }
  } else {
    return NextResponse.json({ error: 'token or lease_id required' }, { status: 400 })
  }

  if (!lease) return NextResponse.json({ error: 'lease not found' }, { status: 404 })
  if (lease.status === 'ended') return NextResponse.json({ error: 'lease has ended' }, { status: 409 })
  if (signer === 'tenant' && lease.tenant_signature) {
    return NextResponse.json({ ok: true, already: true, status: lease.status })
  }
  if (signer === 'landlord' && lease.landlord_signature) {
    return NextResponse.json({ ok: true, already: true, status: lease.status })
  }
  // Only a real terms document in the signing flow can be signed (sweep 2026-10-01): an
  // imported or quick-entered record has nothing to sign, and a signature on it froze the row
  // half-signed forever (the tenant never gets a token, the guard locks its terms).
  if (!leaseIsSignable(lease)) {
    // Two different situations, two codes: a record with nothing to sign, or a document
    // that is no longer waiting for a signature (the page was stale).
    return leaseHasTerms(lease.terms)
      ? NextResponse.json({ error: 'lease_not_signable', detail: 'this lease is no longer waiting for a signature' }, { status: 409 })
      : NextResponse.json({ error: 'lease_no_terms', detail: 'this lease has no full terms document to sign' }, { status: 409 })
  }

  const signature = { name, signed_at: new Date().toISOString(), role: signer }

  // Step 1 — land ONLY this signature (guarded so the slot must still be empty).
  // Do NOT decide 'signed_both' from the pre-read snapshot: a concurrent signer
  // would have the same stale view and both would miss full execution.
  const provisionalStatus = signer === 'tenant' ? 'signed_tenant' : lease.status === 'draft' ? 'sent' : lease.status
  const { data: updated } = await admin
    .from('lease_documents')
    .update({ [`${signer}_signature`]: signature, status: provisionalStatus })
    .eq('id', lease.id)
    .is(`${signer}_signature`, null)
    .select('id')
  if (!updated || updated.length === 0) {
    return NextResponse.json({ ok: true, already: true, status: lease.status })
  }

  // Step 2 — re-read fresh state. Whichever request wrote second now sees BOTH
  // signatures and finalizes; the finalize is claimed atomically (signed_at
  // must still be null) so only one request sends the fully-executed emails.
  const { data: fresh } = await admin
    .from('lease_documents')
    .select('landlord_signature, tenant_signature')
    .eq('id', lease.id)
    .maybeSingle<{ landlord_signature: unknown; tenant_signature: unknown }>()
  const bothPresent = !!fresh?.landlord_signature && !!fresh?.tenant_signature
  let otherSigned = false
  if (bothPresent) {
    const { data: finalized } = await admin
      .from('lease_documents')
      .update({ status: 'signed_both', signed_at: signature.signed_at })
      .eq('id', lease.id)
      .is('signed_at', null)
      .select('id')
    otherSigned = !!finalized && finalized.length > 0
  }

  // Unskippable audit.
  await admin.from('agent_audit_events').insert({
    actor_id: actorId,
    actor_type: 'user',
    action: `lease_signed_${signer}`,
    target_type: 'lease_document',
    target_id: lease.id,
    metadata: { signer_name: name, fully_executed: otherSigned },
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
  const unit = lease.unit_label || 'the rental unit'
  const tenantLink = lease.sign_token ? `${siteUrl}/lease/sign/${lease.sign_token}` : null

  if (otherSigned) {
    // Lifecycle plan 2026-09-22 §2.1: a fully signed lease IS the tenancy.
    // Create the managed household (verified — both signatures are the
    // counterparty confirmation), the first rent row, and an invite for the
    // tenant's email so they can join with any account. Best-effort, audited.
    try {
      const { data: full } = await admin
        .from('lease_documents')
        .select('id, landlord_id, tenant_name, tenant_email, unit_label, monthly_rent, start_date, end_date, terms, listing_id')
        .eq('id', lease.id)
        .maybeSingle()
      if (full) {
        const terms = (full.terms || {}) as { premises?: { street?: string; unit?: string; city?: string }; unit?: { street?: string; unit?: string; city?: string }; rent?: { due_day?: number } }
        const prem = terms.premises || terms.unit || {}
        const address = prem.street || full.unit_label || 'Rental unit'
        const dueDay = rentDueDay(terms.rent?.due_day)
        const { data: ll } = await admin.from('landlords').select('auth_id').eq('id', full.landlord_id).maybeSingle()
        const landlordAuth = (ll?.auth_id as string | null) ?? null
        // Already on a household — as its current lease, or as the renewal waiting for its start date.
        const { data: existing } = await admin.from('households').select('id').or(`current_lease_id.eq.${full.id},next_lease_id.eq.${full.id}`).limit(1).maybeSingle()
        // A second lease for a tenancy already in management (a renewal, the standard form
        // replacing an imported paper lease) joins that household — one tenancy keeps one
        // thread, one ledger, one ticket list — instead of a duplicate (sweep 2026-10-01).
        // Same unit AND same tenant only: a re-let unit is a new tenancy (review 2026-10-01).
        const attachTo = !existing && landlordAuth
          ? await findManagedHousehold(admin, landlordAuth, { address, unit: prem.unit || null, tenant_email: full.tenant_email })
          : null
        if (attachTo && landlordAuth) {
          await attachLeaseToHousehold(admin, attachTo, full, landlordAuth, dueDay)
        } else if (!existing && landlordAuth) {
          const { data: hh } = await admin.from('households').insert({
            address, unit: prem.unit || null, city: prem.city || null,
            monthly_rent: full.monthly_rent, rent_due_day: dueDay ?? 1,
            start_date: full.start_date, end_date: full.end_date, current_lease_id: full.id,
            status: 'active', source: 'esign', verified: true, created_by: landlordAuth,
          }).select('id').single()
          if (hh) {
            await admin.from('household_members').insert({ household_id: hh.id, user_id: landlordAuth, role: 'landlord' })
            if (full.tenant_email) {
              await admin.from('household_invites').insert({ household_id: hh.id, invited_email: String(full.tenant_email).toLowerCase(), invited_role: 'tenant', invited_by: landlordAuth })
            }
            await insertFirstPeriod(admin, full, dueDay ?? 1)
            await admin.from('agent_audit_events').insert({ actor_id: landlordAuth, actor_type: 'system', action: 'household_created_from_esign', target_type: 'household', target_id: hh.id, metadata: { lease_id: full.id } })
          }
        }
      }
    } catch (e) {
      console.warn('[lease/sign] household auto-create failed:', (e as Error).message)
    }
    // Fully executed — both parties get their permanent copies.
    if (lease.tenant_email && tenantLink) {
      await sendEmail({
        to: lease.tenant_email,
        subject: `Fully signed — your lease for ${unit}`,
        text: `Your Residential Tenancy Agreement for ${unit} is now fully signed by both parties.\n\nView and download your permanent copy anytime:\n${tenantLink}\n\n租约已由双方签署完成。上方链接长期有效，可随时查看和下载 PDF 备份。\n\n— Stayloop`,
        html: `<p>Your Residential Tenancy Agreement for <b>${escapeHtml(unit)}</b> is now <b>fully signed</b> by both parties.</p><p><a href="${tenantLink}">View &amp; download your permanent copy →</a></p><p style="color:#64748b;font-size:13px">该链接长期有效，可随时查看和下载 PDF 备份。</p>`,
      })
    }
  } else if (signer === 'tenant') {
    // Tell the landlord to countersign. Resolve their email via the lease row.
    if (lease.landlord_id) {
      const { data: ll } = await admin.from('landlords').select('email').eq('id', lease.landlord_id).maybeSingle()
      if (ll?.email) {
        await sendEmail({
          to: ll.email,
          subject: `${lease.tenant_name || 'Your tenant'} signed the lease for ${unit} — countersign to complete`,
          text: `${lease.tenant_name || 'Your tenant'} has signed the Residential Tenancy Agreement for ${unit}.\n\nCountersign in your Stayloop workspace:\n${siteUrl}/landlord/leases\n\n租客已签署租约，请在工作台回签完成签约。\n\n— Stayloop`,
          html: `<p><b>${escapeHtml(lease.tenant_name || 'Your tenant')}</b> has signed the lease for <b>${escapeHtml(unit)}</b>.</p><p><a href="${siteUrl}/landlord/leases">Countersign in your workspace →</a></p>`,
        })
      }
    }
  }

  const finalStatus = otherSigned ? 'signed_both' : provisionalStatus
  return NextResponse.json({ ok: true, status: finalStatus, fully_executed: otherSigned, signature })
}

type AdminClient = ReturnType<typeof adminClient>
type FullLease = { id: string; tenant_email: string | null; monthly_rent: number | null; start_date: string | null; end_date: string | null }

type ManagedHousehold = { id: string; current_lease_id: string | null; next_lease_id: string | null; start_date: string | null; member_emails: string[] }

/**
 * The landlord's active household (as creator or landlord member) that is this
 * lease's tenancy — same unit AND same tenant. The tenant is known from the
 * household's tenant invites (not declined / revoked), its current lease's
 * tenant email and its active tenant members' account emails. A household at
 * the same unit with a different (or unknown) tenant is the previous tenancy
 * and is never reused.
 */
async function findManagedHousehold(admin: AdminClient, landlordAuth: string, lease: { address: string; unit: string | null; tenant_email: string | null }): Promise<ManagedHousehold | null> {
  if (!normalizeEmail(lease.tenant_email)) return null
  const [{ data: created }, { data: memberOf }] = await Promise.all([
    admin.from('households').select('id').eq('created_by', landlordAuth).eq('status', 'active').limit(200),
    admin.from('household_members').select('household_id').eq('user_id', landlordAuth).eq('role', 'landlord').eq('status', 'active').limit(200),
  ])
  const ids = [...new Set([...(created ?? []).map((r: { id: string }) => r.id), ...(memberOf ?? []).map((r: { household_id: string }) => r.household_id)])]
  if (!ids.length) return null
  const { data: rows } = await admin.from('households').select('id, address, unit, status, current_lease_id, next_lease_id, start_date').in('id', ids).eq('status', 'active')
  type Row = { id: string; address: string | null; unit: string | null; status: string | null; current_lease_id: string | null; next_lease_id: string | null; start_date: string | null }
  // Only households that can still match by address need their tenant looked up.
  const near = ((rows ?? []) as Row[])
    .filter((r) => householdAddressMayMatch(lease, r))
    .sort((a, b) => Number(sameTenancyAddress(lease, b)) - Number(sameTenancyAddress(lease, a)))
    .slice(0, 10)
  if (!near.length) return null
  const nearIds = near.map((r) => r.id)
  const leaseIds = near.flatMap((r) => [r.current_lease_id, r.next_lease_id]).filter((x): x is string => !!x)
  const [{ data: invites }, { data: leases }, { data: members }] = await Promise.all([
    admin.from('household_invites').select('household_id, invited_email, declined_at, revoked_at').in('household_id', nearIds).eq('invited_role', 'tenant'),
    leaseIds.length ? admin.from('lease_documents').select('id, tenant_email').in('id', leaseIds) : Promise.resolve({ data: [] as { id: string; tenant_email: string | null }[] }),
    admin.from('household_members').select('household_id, user_id').in('household_id', nearIds).eq('role', 'tenant').eq('status', 'active'),
  ])
  const tenantEmails = new Map<string, Set<string>>()
  const add = (hh: string, e: string | null | undefined) => {
    const v = normalizeEmail(e)
    if (!v) return
    tenantEmails.set(hh, (tenantEmails.get(hh) ?? new Set()).add(v))
  }
  for (const i of (invites ?? []) as { household_id: string; invited_email: string; declined_at: string | null; revoked_at: string | null }[]) {
    if (!i.declined_at && !i.revoked_at) add(i.household_id, i.invited_email)
  }
  const leaseEmail = new Map(((leases ?? []) as { id: string; tenant_email: string | null }[]).map((l) => [l.id, l.tenant_email]))
  for (const r of near) {
    if (r.current_lease_id) add(r.id, leaseEmail.get(r.current_lease_id))
    if (r.next_lease_id) add(r.id, leaseEmail.get(r.next_lease_id))
  }
  const memberEmails = new Map<string, string[]>()
  const memberRows = ((members ?? []) as { household_id: string; user_id: string }[]).slice(0, 20)
  await Promise.all(memberRows.map(async (m) => {
    try {
      const { data } = await admin.auth.admin.getUserById(m.user_id)
      const e = normalizeEmail(data?.user?.email)
      if (!e) return
      add(m.household_id, e)
      memberEmails.set(m.household_id, [...(memberEmails.get(m.household_id) ?? []), e])
    } catch { /* an unreadable member just does not count as evidence */ }
  }))
  const cands: HouseholdCandidate[] = near.map((r) => ({ id: r.id, address: r.address, unit: r.unit, status: r.status, tenant_emails: [...(tenantEmails.get(r.id) ?? [])] }))
  const id = pickHouseholdForLease(lease, cands)
  const hit = id ? near.find((r) => r.id === id) : null
  return hit ? { id: hit.id, current_lease_id: hit.current_lease_id, next_lease_id: hit.next_lease_id, start_date: hit.start_date, member_emails: memberEmails.get(hit.id) ?? [] } : null
}

async function attachLeaseToHousehold(admin: AdminClient, hh: ManagedHousehold, full: FullLease, landlordAuth: string, dueDay: number | null) {
  // Both parties signed this lease: the tenancy is confirmed (like the new-household path).
  // A term that has started becomes the current lease now; a renewal starting later waits in
  // next_lease_id and the running term keeps its lease, end date, rent and due day — its
  // remaining periods stay in the hub and stay recordable (mark_rent_paid is current-lease
  // only). promote_household_leases() switches it on its start date (B1 2026-10-01).
  const slot = leaseAttachSlot(full.start_date, torontoDate())
  const { error: hhErr } = await admin.from('households').update(slot === 'current'
    ? {
        current_lease_id: full.id,
        end_date: full.end_date,
        monthly_rent: full.monthly_rent,
        ...(dueDay ? { rent_due_day: dueDay } : {}),
        start_date: hh.start_date ?? full.start_date,
        verified: true,
        // The term it replaces stays reachable: its unrecorded periods remain on the hub and
        // recordable (mark_rent_paid accepts previous_lease_id within that lease's dates).
        ...(hh.current_lease_id && hh.current_lease_id !== full.id ? { previous_lease_id: hh.current_lease_id } : {}),
      }
    : { next_lease_id: full.id, verified: true }).eq('id', hh.id)
  if (hhErr) console.warn('[lease/sign] household attach failed:', hhErr.message)
  const email = normalizeEmail(full.tenant_email)
  // A fresh invite unless the tenant is already in, or holds one that still works
  // (accepted, or not yet expired). An invite that lapsed unanswered (14 days) cannot
  // be used on /join, so it does not count.
  if (email && !hh.member_emails.includes(email)) {
    const { data: inv } = await admin.from('household_invites').select('invited_email, accepted_at, expires_at, declined_at, revoked_at').eq('household_id', hh.id).eq('invited_role', 'tenant')
    if (!hasUsableInvite((inv ?? []) as InviteRow[], email, Date.now())) {
      await admin.from('household_invites').insert({ household_id: hh.id, invited_email: email, invited_role: 'tenant', invited_by: landlordAuth })
    }
  }
  // The first period of the new term, unless the ledger already has it (under either lease).
  // A renewal waiting in next_lease_id gets it from promote_household_leases on its start
  // date: until then the hub does not show its ledger, so a 'due' row now would only make
  // the facts / rail count a period nobody can see (review 2026-10-01).
  if (slot === 'current') await insertFirstPeriod(admin, full, dueDay ?? 1, hh.current_lease_id)
  await admin.from('agent_audit_events').insert({
    actor_id: landlordAuth, actor_type: 'system', action: 'household_lease_attached_from_esign', target_type: 'household', target_id: hh.id,
    metadata: { lease_id: full.id, previous_lease_id: hh.current_lease_id, slot, ...(slot === 'next' ? { starts_on: full.start_date, replaced_next_lease_id: hh.next_lease_id } : {}) },
  })
}

/**
 * The first-month placeholder ('due', no paid_at) at the first scheduled due date on/after
 * the lease start — a real period on the hub's schedule, not the start date itself (a
 * mid-month start used to park a full month's rent off the schedule). Skipped when the
 * ledger already has that period under this lease or the previous one; a unique violation
 * from rent_payments (lease_id, due_date) means another writer got there first (B1 2026-10-01).
 */
async function insertFirstPeriod(admin: AdminClient, full: FullLease, dueDay: number, previousLeaseId: string | null = null) {
  if (!full.start_date || !full.monthly_rent) return
  const due = firstDueDate(full.start_date, dueDay)
  if (!due) return
  const leaseIds = [full.id, ...(previousLeaseId && previousLeaseId !== full.id ? [previousLeaseId] : [])]
  const { data: have } = await admin.from('rent_payments').select('id').in('lease_id', leaseIds).eq('due_date', due).limit(1)
  if ((have ?? []).length) return
  const { error } = await admin.from('rent_payments').insert({ lease_id: full.id, due_date: due, amount: full.monthly_rent, status: 'due' })
  if (error && error.code !== '23505') console.warn('[lease/sign] first rent period insert failed:', error.message)
}
