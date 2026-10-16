'use client'

// Applicant pack · the four self-declared sections (V1.0 阶段 4 · G14).
//
// ① identity ② employment & income ③ rental history ④ other. Each section
// saves on its own (upsert applicant_profiles, auth_id = auth.uid(), plain
// RLS). Every item carries a small「自述」tag; only an applicant-authorised
// verification (verification_requests, read best-effort by the page) or a
// tenancy both sides confirmed on Stayloop (lib/profile/history.ts) earns
//「已核验」. No SIN, no protected grounds, no credit / court placeholder.
import { useEffect, useState } from 'react'
import type { ApplicantProfile, ProfileHistoryEntry } from '@/lib/profile/types'
import { EMPLOYMENT_STATUS_LABEL, stayloopRentLine, type PackVerified, type StayloopSegment } from '@/lib/profile/exportPack'
import { supabase } from '@/lib/supabase'

export type ProfileDraft = Partial<ApplicantProfile>

export type ProfileSectionsProps = {
  zh: boolean
  signedIn: boolean
  uid: string | null
  profile: ProfileDraft | null
  history: ProfileHistoryEntry[]
  stayloopHistory: StayloopSegment[]
  verified: PackVerified
  /** Upsert the given columns on the applicant's own row. Resolves to an error message or null. */
  onSave: (patch: ProfileDraft) => Promise<string | null>
  /** Reload applicant_profile_history after an insert / update / delete / reorder. */
  onHistoryChanged: () => void | Promise<void>
}

function Tag({ zh, verified }: { zh: boolean; verified?: boolean }) {
  return verified ? (
    <span className="rounded-full bg-success/10 px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-wide text-success" data-testid="tag-verified">{zh ? '已核验' : 'VERIFIED'}</span>
  ) : (
    <span className="rounded-full bg-surface-chip px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-wide text-body-3" data-testid="tag-self">{zh ? '自述' : 'SELF-DECLARED'}</span>
  )
}

function Field({ label, zh, verified, children, hint }: { label: string; zh: boolean; verified?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-body-2">{label}<Tag zh={zh} verified={verified} /></span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-relaxed text-body-3">{hint}</span>}
    </label>
  )
}

function SectionShell({ title, zh, children, onSave, busy, saved, err, signedIn, meta }: { title: string; zh: boolean; children: React.ReactNode; onSave?: () => void; busy?: boolean; saved?: boolean; err?: string | null; signedIn: boolean; meta?: string }) {
  return (
    <section className="rounded-xl border border-line-divider bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-bold tracking-tight">{title}</h2>
        {meta && <span className="text-[11.5px] text-body-3">{meta}</span>}
      </div>
      <div className="mt-3">{children}</div>
      {onSave && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onSave} disabled={!signedIn || !!busy} className="sl-btn-primary !px-4 !py-2 text-[13px] disabled:opacity-50">
            {busy ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存' : 'Save')}
          </button>
          {saved && <span className="text-[12.5px] font-semibold text-success">{zh ? '已保存 ✓' : 'Saved ✓'}</span>}
          {err && <span className="text-[12.5px] text-danger" role="alert">{err}</span>}
          {!signedIn && <span className="text-[12px] text-body-3">{zh ? '登录后才能保存。' : 'Sign in to save.'}</span>}
        </div>
      )}
    </section>
  )
}

function useSection(onSave: ProfileSectionsProps['onSave']) {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save(patch: ProfileDraft) {
    setBusy(true); setErr(null); setSaved(false)
    const e = await onSave(patch)
    setBusy(false)
    if (e) setErr(e); else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }
  return { busy, saved, err, save }
}

const num = (s: string): number | null => {
  const n = Number(String(s).replace(/[^0-9.]/g, ''))
  return s.trim() === '' || Number.isNaN(n) ? null : Math.round(n)
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const INPUT = 'sl-input w-full'

export default function ProfileSections(p: ProfileSectionsProps) {
  return (
    <div className="space-y-4" data-testid="profile-sections">
      <IdentitySection {...p} />
      <EmploymentSection {...p} />
      <HistorySection {...p} />
      <OtherSection {...p} />
    </div>
  )
}

function IdentitySection({ zh, signedIn, profile, verified, onSave }: ProfileSectionsProps) {
  const [d, setD] = useState({ first_name: '', last_name: '', phone: '', current_address: '', date_of_birth: '' })
  useEffect(() => { setD({ first_name: str(profile?.first_name), last_name: str(profile?.last_name), phone: str(profile?.phone), current_address: str(profile?.current_address), date_of_birth: str(profile?.date_of_birth).slice(0, 10) }) }, [profile])
  const s = useSection(onSave)
  return (
    <SectionShell title={zh ? '① 身份' : '① Identity'} zh={zh} signedIn={signedIn} busy={s.busy} saved={s.saved} err={s.err} meta={zh ? '不收 SIN · 不问任何受保护特征' : 'No SIN · no protected grounds'}
      onSave={() => s.save({ first_name: d.first_name.trim() || null, last_name: d.last_name.trim() || null, phone: d.phone.trim() || null, current_address: d.current_address.trim() || null, date_of_birth: d.date_of_birth || null } as ProfileDraft)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={zh ? '名' : 'First name'} zh={zh} verified={verified.identity}><input className={INPUT} value={d.first_name} maxLength={200} onChange={(e) => setD({ ...d, first_name: e.target.value })} autoComplete="given-name" /></Field>
        <Field label={zh ? '姓' : 'Last name'} zh={zh} verified={verified.identity}><input className={INPUT} value={d.last_name} maxLength={200} onChange={(e) => setD({ ...d, last_name: e.target.value })} autoComplete="family-name" /></Field>
        <Field label={zh ? '电话' : 'Phone'} zh={zh}><input className={INPUT} value={d.phone} maxLength={200} inputMode="tel" onChange={(e) => setD({ ...d, phone: e.target.value })} autoComplete="tel" /></Field>
        <Field label={zh ? '现住址' : 'Current address'} zh={zh}><input className={INPUT} value={d.current_address} maxLength={200} onChange={(e) => setD({ ...d, current_address: e.target.value })} autoComplete="street-address" /></Field>
        <Field label={zh ? '出生日期（可选）' : 'Date of birth (optional)'} zh={zh} hint={zh ? '只用于你本人同意的信用查询；不填也能出示申请包。' : 'Used only for a credit check you yourself consent to; the pack works without it.'}>
          <input type="date" className={INPUT} value={d.date_of_birth} onChange={(e) => setD({ ...d, date_of_birth: e.target.value })} />
        </Field>
      </div>
    </SectionShell>
  )
}

function EmploymentSection({ zh, signedIn, profile, verified, onSave }: ProfileSectionsProps) {
  const [d, setD] = useState({ employment_status: '', employer_name: '', job_title: '', employment_start_date: '', monthly_income: '', employer_phone: '', employer_email: '' })
  useEffect(() => {
    setD({
      employment_status: str(profile?.employment_status), employer_name: str(profile?.employer_name), job_title: str(profile?.job_title),
      employment_start_date: str(profile?.employment_start_date).slice(0, 10), monthly_income: typeof profile?.monthly_income === 'number' ? String(profile.monthly_income) : '',
      employer_phone: str(profile?.employer_phone), employer_email: str(profile?.employer_email),
    })
  }, [profile])
  const s = useSection(onSave)
  return (
    <SectionShell title={zh ? '② 雇佣与收入' : '② Employment & income'} zh={zh} signedIn={signedIn} busy={s.busy} saved={s.saved} err={s.err}
      onSave={() => s.save({ employment_status: d.employment_status || null, employer_name: d.employer_name.trim() || null, job_title: d.job_title.trim() || null, employment_start_date: d.employment_start_date || null, monthly_income: num(d.monthly_income), employer_phone: d.employer_phone.trim() || null, employer_email: d.employer_email.trim() || null } as ProfileDraft)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={zh ? '雇佣状态' : 'Employment status'} zh={zh}>
          <select className={INPUT} value={d.employment_status} onChange={(e) => setD({ ...d, employment_status: e.target.value })}>
            <option value="">{zh ? '请选择' : 'Choose'}</option>
            {Object.entries(EMPLOYMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{zh ? v.zh : v.en}</option>)}
          </select>
        </Field>
        <Field label={zh ? '雇主' : 'Employer'} zh={zh}><input className={INPUT} value={d.employer_name} maxLength={200} onChange={(e) => setD({ ...d, employer_name: e.target.value })} autoComplete="organization" /></Field>
        <Field label={zh ? '职位' : 'Job title'} zh={zh}><input className={INPUT} value={d.job_title} maxLength={200} onChange={(e) => setD({ ...d, job_title: e.target.value })} autoComplete="organization-title" /></Field>
        <Field label={zh ? '入职日期' : 'Start date'} zh={zh}><input type="date" className={INPUT} value={d.employment_start_date} onChange={(e) => setD({ ...d, employment_start_date: e.target.value })} /></Field>
        <Field label={zh ? '月收入（税前，$）' : 'Monthly income (gross, $)'} zh={zh} verified={verified.income} hint={zh ? '只作参考，不是任何门槛。' : 'For reference only — never a cutoff.'}>
          <input className={INPUT} value={d.monthly_income} inputMode="numeric" onChange={(e) => setD({ ...d, monthly_income: e.target.value })} />
        </Field>
        <Field label={zh ? '雇主电话' : 'Employer phone'} zh={zh}><input className={INPUT} value={d.employer_phone} maxLength={200} inputMode="tel" onChange={(e) => setD({ ...d, employer_phone: e.target.value })} /></Field>
        <Field label={zh ? '雇主邮箱' : 'Employer email'} zh={zh}><input className={INPUT} value={d.employer_email} maxLength={200} inputMode="email" onChange={(e) => setD({ ...d, employer_email: e.target.value })} /></Field>
      </div>
    </SectionShell>
  )
}

type HistoryDraft = { prev_address: string; prev_landlord_name: string; prev_landlord_phone: string; prev_landlord_email: string; prev_rent: string; prev_move_in: string; prev_move_out: string; reason_for_leaving: string }
const EMPTY_H: HistoryDraft = { prev_address: '', prev_landlord_name: '', prev_landlord_phone: '', prev_landlord_email: '', prev_rent: '', prev_move_in: '', prev_move_out: '', reason_for_leaving: '' }
const toDraft = (h: ProfileHistoryEntry): HistoryDraft => ({
  prev_address: str(h.prev_address), prev_landlord_name: str(h.prev_landlord_name), prev_landlord_phone: str(h.prev_landlord_phone), prev_landlord_email: str(h.prev_landlord_email),
  prev_rent: typeof h.prev_rent === 'number' ? String(h.prev_rent) : '', prev_move_in: str(h.prev_move_in).slice(0, 10), prev_move_out: str(h.prev_move_out).slice(0, 10), reason_for_leaving: str(h.reason_for_leaving),
})
const toRow = (d: HistoryDraft) => ({
  prev_address: d.prev_address.trim() || null, prev_landlord_name: d.prev_landlord_name.trim() || null, prev_landlord_phone: d.prev_landlord_phone.trim() || null, prev_landlord_email: d.prev_landlord_email.trim() || null,
  prev_rent: num(d.prev_rent), prev_move_in: d.prev_move_in || null, prev_move_out: d.prev_move_out || null, reason_for_leaving: d.reason_for_leaving.trim() || null,
})

function fmtDay(iso: string | null | undefined, zh: boolean): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA')
}

function HistorySection({ zh, signedIn, uid, history, stayloopHistory, onHistoryChanged }: ProfileSectionsProps) {
  const sorted = [...history].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [d, setD] = useState<HistoryDraft>(EMPTY_H)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  function startEdit(h?: ProfileHistoryEntry) {
    setErr(null)
    setEditing(h ? h.id : 'new')
    setD(h ? toDraft(h) : EMPTY_H)
  }
  async function saveEntry() {
    if (!uid || busy) return
    setBusy(true); setErr(null)
    const row = toRow(d)
    const res = editing === 'new'
      ? await supabase.from('applicant_profile_history').insert({ auth_id: uid, position: sorted.length, ...row })
      : await supabase.from('applicant_profile_history').update(row).eq('id', editing as string)
    setBusy(false)
    if (res.error) { setErr(zh ? '没保存上，请稍后再试。' : 'Could not save — try again shortly.'); return }
    setEditing(null)
    await onHistoryChanged()
  }
  async function removeEntry(id: string) {
    if (busy) return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('applicant_profile_history').delete().eq('id', id)
    if (!error) {
      // Close the gap so positions stay 0..n-1.
      const rest = sorted.filter((h) => h.id !== id)
      await Promise.all(rest.map((h, i) => (h.position === i ? null : supabase.from('applicant_profile_history').update({ position: i }).eq('id', h.id))))
    }
    setBusy(false)
    setConfirmId(null)
    if (error) { setErr(zh ? '没删掉，请稍后再试。' : 'Could not delete — try again shortly.'); return }
    await onHistoryChanged()
  }
  async function move(idx: number, dir: -1 | 1) {
    const other = idx + dir
    if (other < 0 || other >= sorted.length || busy) return
    setBusy(true)
    const a = sorted[idx], b = sorted[other]
    await Promise.all([
      supabase.from('applicant_profile_history').update({ position: other }).eq('id', a.id),
      supabase.from('applicant_profile_history').update({ position: idx }).eq('id', b.id),
    ])
    setBusy(false)
    await onHistoryChanged()
  }

  return (
    <SectionShell title={zh ? '③ 租史' : '③ Rental history'} zh={zh} signedIn={signedIn} meta={zh ? '最近的一段排在最上面' : 'Most recent first'}>
      {stayloopHistory.length > 0 && (
        <div className="mb-3 rounded-lg border border-success/30 bg-success/[0.05] p-3" data-testid="stayloop-history">
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-success">
            {zh ? 'Stayloop 内双方确认的租约' : 'Tenancies both sides confirmed on Stayloop'}
            <Tag zh={zh} verified />
            <span className="font-normal text-body-3">{zh ? '· 来自双方确认的租约，不可编辑' : '· from leases both sides confirmed; not editable'}</span>
          </div>
          <ul className="mt-2 space-y-1.5 text-[12.5px] text-body-2">
            {stayloopHistory.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">{[s.address, s.unit, s.city].filter(Boolean).join(' · ') || (zh ? '（地址未记录）' : '(address not recorded)')}</span>
                <span className="text-body-3">{fmtDay(s.start, zh)} → {s.end ? fmtDay(s.end, zh) : (zh ? '至今' : 'present')}</span>
                <span className="text-body-3">{stayloopRentLine(s, zh ? 'zh' : 'en')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sorted.length === 0 && editing !== 'new' && (
        <p className="text-[12.5px] text-body-3">{zh ? '还没有填写以前住过的地方。房东通常想看最近两段。' : 'No previous addresses yet. Landlords usually want the last two.'}</p>
      )}
      <ul className="divide-y divide-line-divider">
        {sorted.map((h, idx) => (
          <li key={h.id} className="py-2.5">
            {editing === h.id ? (
              <HistoryForm zh={zh} d={d} setD={setD} busy={busy} onSave={saveEntry} onCancel={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-1 basis-[14rem]">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">{h.prev_address || (zh ? '（地址未填）' : '(no address)')}<Tag zh={zh} /></div>
                  <div className="text-[11.5px] text-body-3">
                    {fmtDay(h.prev_move_in, zh)} → {h.prev_move_out ? fmtDay(h.prev_move_out, zh) : (zh ? '至今' : 'present')}
                    {h.prev_landlord_name ? ` · ${zh ? '房东' : 'landlord'} ${h.prev_landlord_name}` : ''}
                    {typeof h.prev_rent === 'number' ? ` · $${h.prev_rent.toLocaleString('en-CA')}/${zh ? '月' : 'mo'}` : ''}
                  </div>
                </div>
                {signedIn && (
                  <div className="flex items-center gap-1 text-[12px]">
                    <button type="button" disabled={busy || idx === 0} onClick={() => move(idx, -1)} className="rounded px-1.5 py-1 text-body-3 hover:bg-surface-chip disabled:opacity-30" aria-label={zh ? '上移' : 'Move up'}>↑</button>
                    <button type="button" disabled={busy || idx === sorted.length - 1} onClick={() => move(idx, 1)} className="rounded px-1.5 py-1 text-body-3 hover:bg-surface-chip disabled:opacity-30" aria-label={zh ? '下移' : 'Move down'}>↓</button>
                    <button type="button" onClick={() => startEdit(h)} className="rounded-lg px-2 py-1 font-semibold text-brand hover:bg-brand/5">{zh ? '改' : 'Edit'}</button>
                    {confirmId === h.id ? (
                      <span className="inline-flex items-center gap-1" data-testid="profile-history-delete-confirm">
                        <button type="button" disabled={busy} onClick={() => removeEntry(h.id)} className="rounded-lg bg-danger px-2 py-1 font-semibold text-white">{zh ? '确认删除' : 'Confirm'}</button>
                        <button type="button" onClick={() => setConfirmId(null)} className="rounded-lg px-2 py-1 text-body-3">{zh ? '取消' : 'Cancel'}</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmId(h.id)} className="rounded-lg px-2 py-1 font-semibold text-danger hover:bg-danger/5">{zh ? '删' : 'Delete'}</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' && <div className="mt-2"><HistoryForm zh={zh} d={d} setD={setD} busy={busy} onSave={saveEntry} onCancel={() => setEditing(null)} /></div>}
      {err && <p className="mt-2 text-[12.5px] text-danger" role="alert">{err}</p>}
      {signedIn && editing === null && (
        <button type="button" onClick={() => startEdit()} className="sl-btn-secondary mt-3 !px-4 !py-2 text-[13px]">{zh ? '+ 添加一段' : '+ Add a tenancy'}</button>
      )}
    </SectionShell>
  )
}

function HistoryForm({ zh, d, setD, busy, onSave, onCancel }: { zh: boolean; d: HistoryDraft; setD: (d: HistoryDraft) => void; busy: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="rounded-lg bg-surface-chip p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={zh ? '地址' : 'Address'} zh={zh}><input className={INPUT} value={d.prev_address} maxLength={200} onChange={(e) => setD({ ...d, prev_address: e.target.value })} /></Field>
        <Field label={zh ? '月租（$）' : 'Monthly rent ($)'} zh={zh}><input className={INPUT} value={d.prev_rent} inputMode="numeric" onChange={(e) => setD({ ...d, prev_rent: e.target.value })} /></Field>
        <Field label={zh ? '入住' : 'Moved in'} zh={zh}><input type="date" className={INPUT} value={d.prev_move_in} onChange={(e) => setD({ ...d, prev_move_in: e.target.value })} /></Field>
        <Field label={zh ? '搬离（仍住着就留空）' : 'Moved out (blank if still there)'} zh={zh}><input type="date" className={INPUT} value={d.prev_move_out} onChange={(e) => setD({ ...d, prev_move_out: e.target.value })} /></Field>
        <Field label={zh ? '房东姓名' : 'Landlord name'} zh={zh}><input className={INPUT} value={d.prev_landlord_name} maxLength={200} onChange={(e) => setD({ ...d, prev_landlord_name: e.target.value })} /></Field>
        <Field label={zh ? '房东电话' : 'Landlord phone'} zh={zh}><input className={INPUT} value={d.prev_landlord_phone} maxLength={200} inputMode="tel" onChange={(e) => setD({ ...d, prev_landlord_phone: e.target.value })} /></Field>
        <Field label={zh ? '房东邮箱' : 'Landlord email'} zh={zh}><input className={INPUT} value={d.prev_landlord_email} maxLength={200} inputMode="email" onChange={(e) => setD({ ...d, prev_landlord_email: e.target.value })} /></Field>
        <Field label={zh ? '搬离原因' : 'Reason for leaving'} zh={zh}><input className={INPUT} value={d.reason_for_leaving} maxLength={200} onChange={(e) => setD({ ...d, reason_for_leaving: e.target.value })} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onSave} className="sl-btn-primary !px-4 !py-2 text-[13px] disabled:opacity-50">{busy ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存这段' : 'Save this tenancy')}</button>
        <button type="button" onClick={onCancel} className="sl-btn-ghost !px-3 !py-2 text-[13px]">{zh ? '取消' : 'Cancel'}</button>
      </div>
    </div>
  )
}

function OtherSection({ zh, signedIn, profile, onSave }: ProfileSectionsProps) {
  const [d, setD] = useState({ num_occupants: '1', has_pets: false, pet_details: '', is_smoker: false, additional_notes: '' })
  useEffect(() => {
    setD({ num_occupants: typeof profile?.num_occupants === 'number' ? String(profile.num_occupants) : '1', has_pets: !!profile?.has_pets, pet_details: str(profile?.pet_details), is_smoker: !!profile?.is_smoker, additional_notes: str(profile?.additional_notes) })
  }, [profile])
  const s = useSection(onSave)
  return (
    <SectionShell title={zh ? '④ 其他' : '④ Other'} zh={zh} signedIn={signedIn} busy={s.busy} saved={s.saved} err={s.err}
      onSave={() => s.save({ num_occupants: num(d.num_occupants) ?? 1, has_pets: d.has_pets, pet_details: d.has_pets ? d.pet_details.trim() || null : null, is_smoker: d.is_smoker, additional_notes: d.additional_notes.trim() || null } as ProfileDraft)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={zh ? '同住人数（含你自己）' : 'Occupants (including you)'} zh={zh}><input className={INPUT} value={d.num_occupants} inputMode="numeric" onChange={(e) => setD({ ...d, num_occupants: e.target.value })} /></Field>
        <div className="grid gap-2">
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-brand" checked={d.has_pets} onChange={(e) => setD({ ...d, has_pets: e.target.checked })} />{zh ? '有宠物' : 'I have pets'}<Tag zh={zh} /></label>
          {d.has_pets && <input className={INPUT} placeholder={zh ? '种类 / 数量 / 体型' : 'Kind / how many / size'} value={d.pet_details} maxLength={200} onChange={(e) => setD({ ...d, pet_details: e.target.value })} />}
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-brand" checked={d.is_smoker} onChange={(e) => setD({ ...d, is_smoker: e.target.checked })} />{zh ? '吸烟' : 'I smoke'}<Tag zh={zh} /></label>
        </div>
        <div className="sm:col-span-2">
          <Field label={zh ? '备注（想让房东知道的）' : 'Notes (anything a landlord should know)'} zh={zh}>
            <textarea className={`${INPUT} min-h-[84px]`} value={d.additional_notes} maxLength={2000} onChange={(e) => setD({ ...d, additional_notes: e.target.value })} />
          </Field>
        </div>
      </div>
    </SectionShell>
  )
}
