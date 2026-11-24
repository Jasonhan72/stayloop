// The lease import's confirm form, as data (2026-11-24): what the fields are, how an extraction
// fills them, what must be true before saving, and the arguments `create_household_import` takes.
//
// The import page (app/leases/import/page.tsx) has carried this inline since it was written. The
// lease import card in the AI conversation (components/agent/LeaseImportChatCard) is a second
// surface for the same flow, so the parts both must agree on live here; the page keeps its own
// copy for now, and tests/leaseImportChat20261124 fails if the two ever name different fields or
// pass different arguments. Pure.
import type { LeaseImportExtraction } from './importExtract'
import { emailShapeOk, EMAIL_SHAPE_MESSAGE } from '@/lib/validation/emailShape'

export type ImportRole = 'landlord' | 'tenant' | 'agent'

export interface ImportForm {
  address: string; unit: string; city: string
  monthly_rent: string; rent_due_day: string
  start_date: string; end_date: string
  tenant_name: string; tenant_email: string
}
export type ImportField = keyof ImportForm

export const EMPTY_IMPORT_FORM: ImportForm = {
  address: '', unit: '', city: '', monthly_rent: '', rent_due_day: '1',
  start_date: '', end_date: '', tenant_name: '', tenant_email: '',
}

/** What the extraction route accepts (app/api/household/extract/route.ts). */
export const IMPORT_MAX_FILES = 3
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024
export const IMPORT_FILE_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|gif))$/

/** The form an extraction starts — the tenant's email is never read from the lease. */
export function formFromExtraction(x: LeaseImportExtraction): ImportForm {
  return {
    address: x.address ?? '',
    unit: x.unit ?? '',
    city: x.city ?? '',
    monthly_rent: x.monthly_rent != null ? String(x.monthly_rent) : '',
    rent_due_day: x.rent_due_day != null ? String(x.rent_due_day) : '1',
    start_date: x.start_date ?? '',
    end_date: x.end_date ?? '',
    tenant_name: (x.tenant_names ?? []).join(' & '),
    tenant_email: '',
  }
}

/** The fields the extraction actually supplied (the form marks them until the person edits them). */
export function fieldsRead(x: LeaseImportExtraction): ImportField[] {
  const out: ImportField[] = []
  if (x.address) out.push('address')
  if (x.unit) out.push('unit')
  if (x.city) out.push('city')
  if (x.monthly_rent != null) out.push('monthly_rent')
  if (x.rent_due_day != null) out.push('rent_due_day')
  if (x.start_date) out.push('start_date')
  if (x.end_date) out.push('end_date')
  if ((x.tenant_names ?? []).length) out.push('tenant_name')
  return out
}

/** Why the form cannot be saved yet, in the reader's language — or null. The same two checks the page makes. */
export function importFormError(form: ImportForm, zh: boolean): string | null {
  if (form.address.trim().length < 5) return zh ? '请填写房屋地址' : 'Address is required'
  if (!emailShapeOk(form.tenant_email)) return zh ? EMAIL_SHAPE_MESSAGE.zh : EMAIL_SHAPE_MESSAGE.en
  return null
}

/** The arguments of the `create_household_import` RPC for a confirmed form. */
export function createImportArgs(form: ImportForm, role: ImportRole) {
  return {
    p_address: form.address.trim(),
    p_unit: form.unit.trim() || null,
    p_city: form.city.trim() || null,
    p_monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : null,
    p_rent_due_day: form.rent_due_day ? Number(form.rent_due_day) : null,
    p_start_date: form.start_date || null,
    p_end_date: form.end_date || null,
    p_creator_role: role,
    p_tenant_name: form.tenant_name.trim() || null,
    p_tenant_email: form.tenant_email.trim() || null,
  }
}

/** Who the importer usually invites: the other side; an agent invites both. */
export function defaultInvites(role: ImportRole): { email: string; role: ImportRole }[] {
  if (role === 'agent') return [{ email: '', role: 'landlord' }, { email: '', role: 'tenant' }]
  return [{ email: '', role: role === 'tenant' ? 'landlord' : 'tenant' }]
}

/** The invitations worth sending — the page's own test of an address. */
export function sendableInvites<T extends { email: string }>(invites: T[]): T[] {
  return invites.filter((i) => /\S+@\S+\.\S+/.test(i.email))
}

/** A storage path for the n-th file of an import — unique per attempt, so an earlier file is never overwritten. */
export function leaseFilePath(householdId: string, stamp: string, n: number, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || 'pdf'
  return `${householdId}/lease-${stamp}-${n + 1}.${ext}`
}

/** Files the extraction will take: PDFs and photos, the first three, ten megabytes in all. */
export function acceptableLeaseFiles<T extends { type: string; size: number }>(files: T[]): T[] {
  const out: T[] = []
  let total = 0
  for (const f of files) {
    if (out.length >= IMPORT_MAX_FILES) break
    if (!IMPORT_FILE_TYPES.test(f.type)) continue
    if (total + f.size > IMPORT_MAX_BYTES) continue
    total += f.size
    out.push(f)
  }
  return out
}
