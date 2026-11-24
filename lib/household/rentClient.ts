// Recording rent, as the signed-in person does it (2026-11-24) — the reads the landlord's ledger
// makes (components/landlord/RentLedger.tsx) and the write the tenancy page's rent tab makes
// (app/h/[id]/page.tsx markPaid): `mark_rent_paid(p_lease, p_due, p_paid_on)`, which itself checks
// that the caller is a member, that the period is due, and that the date is plausible. Everything
// runs under the person's own session; the AI conversation's card that calls this
// (components/agent/RentRecordChatCard) records nothing the person did not tick and confirm.
import { supabase } from '@/lib/supabase'
import { markPaidErrorText } from './csvReconcile'
import { buildRentTenancies, memberRolesFor, type RentHousehold, type RentPaymentRow, type RentRole, type RentTenancy } from './rentRecord'

/** The caller's tenancies in this role, with the periods that can be recorded. A failed read throws: "none" must mean none. */
export async function loadRentTenancies(uid: string, role: RentRole): Promise<RentTenancy[]> {
  const { data: mem, error: memErr } = await supabase.from('household_members').select('household_id, role').eq('user_id', uid).eq('status', 'active')
  if (memErr) throw new Error(memErr.message)
  const roles = memberRolesFor(role)
  const ids = Array.from(new Set(((mem ?? []) as { household_id: string; role: string }[]).filter((m) => roles.includes(m.role)).map((m) => m.household_id)))
  if (!ids.length) return []
  const { data: hh, error: hhErr } = await supabase
    .from('households')
    .select('id, address, unit, city, current_lease_id, next_lease_id, start_date, rent_due_day, monthly_rent, status')
    .in('id', ids)
  if (hhErr) throw new Error(hhErr.message)
  const households = (hh ?? []) as RentHousehold[]
  const current = households.map((h) => h.current_lease_id).filter((x): x is string => !!x)
  const leaseIds = Array.from(new Set([...current, ...households.map((h) => h.next_lease_id).filter((x): x is string => !!x)]))
  if (!leaseIds.length) return buildRentTenancies(households, [], [])
  const [{ data: ld, error: ldErr }, { data: rp, error: rpErr }] = await Promise.all([
    supabase.from('lease_documents').select('id, start_date, tenant_name').in('id', leaseIds),
    supabase.from('rent_payments').select('lease_id, due_date, status, paid_at, amount').in('lease_id', current).order('due_date', { ascending: false }).limit(600),
  ])
  if (ldErr) throw new Error(ldErr.message)
  if (rpErr) throw new Error(rpErr.message)
  return buildRentTenancies(households, (ld ?? []) as { id: string; start_date: string | null; tenant_name?: string | null }[], (rp ?? []) as RentPaymentRow[])
}

/** Record one period as paid on `paidOn`. The refusal, when there is one, is in the reader's language. */
export async function recordRentPaid(leaseId: string, due: string, paidOn: string, zh: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('mark_rent_paid', { p_lease: leaseId, p_due: due, p_paid_on: paidOn })
  return error ? { ok: false, message: markPaidErrorText(error.message, zh) } : { ok: true }
}
