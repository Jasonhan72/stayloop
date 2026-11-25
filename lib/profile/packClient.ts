// The applicant pack's reads and writes, as the passport page makes them (app/tenant/passport/page.tsx,
// components/profile/ProfileFiles.tsx) — for the AI conversation's pack card
// (components/agent/PackFillChatCard), 2026-11-25:
//   read     applicant_profiles (own row) + how many files the pack holds
//   extract  POST /api/profile/extract — reads the documents, stores nothing
//   save     upsert on applicant_profiles, auth_id = the caller (plain RLS) — only the confirmed columns
//   file     POST /api/profile/files { kind, file, as_of } — the server stores the bytes and writes the row
// Everything runs under the applicant's own session. The consent columns are never written here.
import { supabase } from '@/lib/supabase'
import type { PackExtraction } from './packExtract'
import { profileFileErrorText, type ApplicantProfile, type ProfileFileKind } from './types'

const PROFILE_COLUMNS = 'auth_id,first_name,last_name,employment_status,employer_name,job_title,employment_start_date,monthly_income,employer_phone,employer_email,consent_version,consent_at'

async function bearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ? `Bearer ${data.session.access_token}` : null
}

/** The applicant's own pack, as far as the card needs it. A failed read throws: an empty pack must mean empty. */
export async function loadPack(uid: string): Promise<{ profile: Partial<ApplicantProfile> | null; files: number }> {
  const [{ data, error }, { count, error: fErr }] = await Promise.all([
    supabase.from('applicant_profiles').select(PROFILE_COLUMNS).eq('auth_id', uid).maybeSingle(),
    supabase.from('applicant_profile_files').select('id', { count: 'exact', head: true }).eq('auth_id', uid),
  ])
  if (error) throw new Error(error.message)
  if (fErr) throw new Error(fErr.message)
  return { profile: (data as Partial<ApplicantProfile> | null) ?? null, files: count ?? 0 }
}

/** Read the documents. A failed read is not a failed pack: the card says so and the applicant types instead. */
export async function extractPack(files: File[]): Promise<{ extraction: PackExtraction | null; status: number }> {
  try {
    const auth = await bearer()
    if (!auth) return { extraction: null, status: 401 }
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    const res = await fetch('/api/profile/extract', { method: 'POST', headers: { Authorization: auth }, body: fd })
    if (!res.ok) return { extraction: null, status: res.status }
    const { extraction } = (await res.json()) as { extraction: PackExtraction }
    return { extraction: extraction ?? null, status: 200 }
  } catch {
    return { extraction: null, status: 0 }
  }
}

/** Write the confirmed columns onto the applicant's own row. */
export async function savePackFields(uid: string, patch: Partial<ApplicantProfile>): Promise<boolean> {
  if (!Object.keys(patch).length) return true
  const { error } = await supabase.from('applicant_profiles').upsert({ auth_id: uid, ...patch }, { onConflict: 'auth_id' })
  return !error
}

/** Put one file into the pack under `kind`, with the document's own date when known. */
export async function storePackFile(file: File, kind: ProfileFileKind, asOf: string | null, zh: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const auth = await bearer()
    if (!auth) return { ok: false, message: profileFileErrorText('sign_in_required', zh) }
    const fd = new FormData()
    fd.set('kind', kind)
    fd.set('file', file, file.name)
    if (asOf) fd.set('as_of', asOf)
    const res = await fetch('/api/profile/files', { method: 'POST', headers: { Authorization: auth }, body: fd })
    if (res.ok) return { ok: true }
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, message: profileFileErrorText(j.error || `HTTP ${res.status}`, zh) }
  } catch (e) {
    return { ok: false, message: profileFileErrorText((e as Error).message, zh) }
  }
}
