// The lease import's calls, as the signed-in person makes them (2026-11-24) — the same routes and
// RPCs, in the same order, as the import page (app/leases/import/page.tsx):
//   read    POST /api/household/extract (multipart; nothing is stored)
//   check   my_households_for_import() + sameTenancyAddress — the same lease must not become two tenancies
//   create  create_household_import(…) — only what the person confirmed
//   file    storage upload into `tenancy-files`, then attach_household_lease_file — after the
//           create, because the bucket's RLS needs the membership row the RPC makes
//   invite  POST /api/household/invite
// Everything runs under the person's own session: nothing here is a service-role write, and the AI
// conversation's card that calls these (components/agent/LeaseImportChatCard) submits nothing the
// person did not confirm on it.
import { supabase } from '@/lib/supabase'
import { sameTenancyAddress } from '@/lib/lease/householdMatch'
import type { LeaseImportExtraction } from './importExtract'
import { createImportArgs, leaseFilePath, sendableInvites, type ImportForm, type ImportRole } from './importForm'

/** A household the caller is in, or invited to, at the same address (a row of my_households_for_import()). */
export type ImportMatch = {
  id: string; address: string; unit: string | null
  verified: boolean; relation: 'member' | 'invited'; is_creator: boolean; invite_token: string | null
}

async function bearer(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  return `Bearer ${session?.access_token || ''}`
}

/** Read the lease. A failed read is not a failed import: the form simply starts blank. */
export async function extractLease(files: File[]): Promise<{ extraction: LeaseImportExtraction | null; status: number }> {
  try {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    const res = await fetch('/api/household/extract', { method: 'POST', headers: { Authorization: await bearer() }, body: fd })
    if (!res.ok) return { extraction: null, status: res.status }
    const { extraction } = (await res.json()) as { extraction: LeaseImportExtraction }
    return { extraction: extraction ?? null, status: 200 }
  } catch {
    return { extraction: null, status: 0 }
  }
}

/** The caller's households at this address and unit. A failed read throws: "none" must mean none. */
export async function householdsAtSameAddress(form: Pick<ImportForm, 'address' | 'unit'>): Promise<ImportMatch[]> {
  const { data, error } = await supabase.rpc('my_households_for_import')
  if (error) throw new Error(error.message)
  return ((data ?? []) as ImportMatch[]).filter((h) => sameTenancyAddress({ address: form.address, unit: form.unit }, { address: h.address, unit: h.unit }))
}

/** Create the managed tenancy from the confirmed form; returns its id. */
export async function createImportedHousehold(form: ImportForm, role: ImportRole): Promise<string> {
  const { data, error } = await supabase.rpc('create_household_import', createImportArgs(form, role))
  if (error || !data) throw new Error(error?.message || 'create failed')
  return data as string
}

/** Store the lease file(s) on the tenancy and link the first as its lease document. Returns how many were stored. */
export async function uploadLeaseFiles(householdId: string, files: File[]): Promise<number> {
  const stamp = crypto.randomUUID().slice(0, 8)
  let stored = 0
  for (let i = 0; i < files.length; i++) {
    const path = leaseFilePath(householdId, stamp, i, files[i].name)
    const { error } = await supabase.storage.from('tenancy-files').upload(path, files[i], { upsert: false })
    if (error) continue
    stored++
    if (i === 0) await supabase.rpc('attach_household_lease_file', { p_household: householdId, p_path: path })
  }
  return stored
}

/** Email the invitations. Returns how many were sent; throws with the route's reason when it refuses. */
export async function sendHouseholdInvites(householdId: string, invites: { email: string; role: string }[]): Promise<number> {
  const valid = sendableInvites(invites)
  if (!valid.length) return 0
  const res = await fetch('/api/household/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await bearer() },
    body: JSON.stringify({ household_id: householdId, invites: valid }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(d.error || 'invite failed')
  }
  return valid.length
}
