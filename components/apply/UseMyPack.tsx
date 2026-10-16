'use client'

// 乙 #7 · 2026-10-16 · "Fill from my application pack" on /apply/[slug] (G15).
//
// Reads the signed-in applicant's own pack (applicant_profiles / _history /
// _files, all RLS-scoped to the account) and offers two things:
//   · one tap fills the application form — only fields that are still empty,
//     never overwriting what the applicant has already typed;
//   · a checklist of the pack's files to attach to this application — only the
//     kinds this listing collects (Quebec takes no ID), each with its
//     freshness; aging / stale files start unticked with a note.
// Files are copied by POST /api/profile/attach at submit time (the page does
// it); this component only decides what the applicant wants attached. Without
// consent given on the pack page the file list is read-only.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { ApplicantProfile, ProfileFile, ProfileHistoryEntry } from '@/lib/profile/types'
import { PROFILE_FILE_KINDS, profileToApplyForm } from '@/lib/profile/types'
import { freshness } from '@/lib/profile/freshness'

export type PackFileRow = ProfileFile
type Bi = { zh: string; en: string }

const KIND_ORDER: readonly string[] = PROFILE_FILE_KINDS.map((k) => k.kind)
function kindLabel(kind: string): Bi {
  return PROFILE_FILE_KINDS.find((k) => k.kind === kind)?.label ?? { zh: '其他', en: 'Other' }
}

/**
 * Values the pack would put into the form, restricted to fields that are still empty.
 * The form keeps its yes/no selects as the strings 'true' / 'false' with 'false' as the
 * untouched default, so a pack 'true' may land on a 'false' (the pack only says 'true'
 * when the applicant said so on the pack page); every other default stays as it is.
 */
export function fillOnlyEmpty(form: Record<string, unknown>, values: Record<string, unknown>): Record<string, string> {
  const patch: Record<string, string> = {}
  for (const [k, raw] of Object.entries(values)) {
    if (!(k in form)) continue
    if (raw === null || raw === undefined) continue
    const v = typeof raw === 'boolean' ? (raw ? 'true' : 'false') : String(raw).trim()
    if (!v) continue
    const cur = form[k]
    const empty = cur === '' || cur === null || cur === undefined || (cur === 'false' && v === 'true') || (cur === false && v === 'true')
    if (!empty) continue
    patch[k] = v
  }
  return patch
}

export type PackFileView = {
  file: ProfileFile
  days: number
  state: 'fresh' | 'aging' | 'stale'
  suggestZh: string
  suggestEn: string
}

export function describePackFile(file: ProfileFile, today: Date = new Date()): PackFileView {
  const fr = freshness(file.kind, file.as_of ?? file.uploaded_at, today)
  return { file, days: fr.days, state: fr.state, suggestZh: fr.suggestZh, suggestEn: fr.suggestEn }
}

/** Fresh files of the kinds this listing collects start ticked; aging / stale ones do not. */
export function defaultPackSelection(files: ProfileFile[], allowedKinds: readonly string[], today: Date = new Date()): string[] {
  return files
    .filter((f) => allowedKinds.includes(f.kind))
    .filter((f) => describePackFile(f, today).state === 'fresh')
    .map((f) => f.id)
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

type Props = {
  zh: boolean
  /** auth user id — the queries are RLS-scoped anyway; passed so the effect re-runs on account change */
  uid: string
  /** the live form state; the fill patch only touches keys that are empty here */
  form: Record<string, unknown>
  onFill: (patch: Record<string, string>) => void
  /** file kinds this listing collects (fileKindsFor) — pack files of other kinds are not offered */
  allowedKinds: readonly string[]
  selected: string[]
  onSelect: (ids: string[]) => void
  /** files the applicant picked on the page themselves, for the "N / max" line */
  ownCount: number
  maxFiles: number
  /** the application row already exists: the form is locked, files can still be attached */
  locked?: boolean
  onLoaded?: (info: { hasProfile: boolean; consented: boolean }) => void
}

export default function UseMyPack({ zh, uid, form, onFill, allowedKinds, selected, onSelect, ownCount, maxFiles, locked, onLoaded }: Props) {
  const [state, setState] = useState<'loading' | 'none' | 'ready' | 'error'>('loading')
  const [profile, setProfile] = useState<ApplicantProfile | null>(null)
  const [history, setHistory] = useState<ProfileHistoryEntry[]>([])
  const [files, setFiles] = useState<ProfileFile[]>([])
  const [filled, setFilled] = useState<number | null>(null)
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    ;(async () => {
      const [p, h, f] = await Promise.all([
        supabase.from('applicant_profiles').select('*').eq('auth_id', uid).maybeSingle(),
        supabase.from('applicant_profile_history').select('*').eq('auth_id', uid).order('position', { ascending: true }),
        supabase.from('applicant_profile_files').select('*').eq('auth_id', uid).order('uploaded_at', { ascending: false }),
      ])
      if (cancelled) return
      if (p.error) { setState('error'); onLoaded?.({ hasProfile: false, consented: false }); return }
      const prof = (p.data as ApplicantProfile | null) ?? null
      if (!prof) { setState('none'); onLoaded?.({ hasProfile: false, consented: false }); return }
      setProfile(prof)
      setHistory(((h.data ?? []) as ProfileHistoryEntry[]))
      setFiles(((f.data ?? []) as ProfileFile[]))
      setState('ready')
      onLoaded?.({ hasProfile: true, consented: !!prof.consent_version })
    })()
    return () => { cancelled = true }
    // onLoaded is a page callback; re-running on its identity would re-query on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  const consented = !!profile?.consent_version
  const views = useMemo(() => {
    const allowed = new Set(allowedKinds)
    return files
      .filter((f) => allowed.has(f.kind))
      .map((f) => describePackFile(f))
      .sort((a, b) => KIND_ORDER.indexOf(a.file.kind) - KIND_ORDER.indexOf(b.file.kind))
  }, [files, allowedKinds])

  // First time the file list is known and consent exists: fresh files start ticked.
  useEffect(() => {
    if (state !== 'ready' || seeded) return
    setSeeded(true)
    if (consented && selected.length === 0) {
      const ids = defaultPackSelection(files, allowedKinds)
      if (ids.length) onSelect(ids)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, seeded])

  // A kind that the listing stops collecting (province resolved late) drops out of the selection.
  useEffect(() => {
    if (state !== 'ready') return
    const ok = new Set(views.map((v) => v.file.id))
    const keep = selected.filter((id) => ok.has(id))
    if (keep.length !== selected.length) onSelect(keep)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views])

  if (state === 'loading') return null
  if (state === 'error') {
    return (
      <div data-testid="use-my-pack-error" className="rounded-xl border border-line-divider bg-white px-4 py-3 text-[12.5px] text-body-2">
        {zh ? '暂时读不到你的申请包，可以先手动填写。' : 'Your application pack could not be read right now — you can fill the form by hand.'}
      </div>
    )
  }
  if (state === 'none') {
    return (
      <div data-testid="use-my-pack-none" className="rounded-xl border border-line-divider bg-white px-4 py-3 text-[13px] leading-relaxed text-body-2">
        {zh ? '还没有申请包 · ' : 'No application pack yet · '}
        <Link href="/tenant/passport" className="font-semibold text-brand underline underline-offset-2">
          {zh ? '去准备一个，以后每次申请一键填入 →' : 'Build one and fill every application with one tap →'}
        </Link>
      </div>
    )
  }

  const total = ownCount + selected.length
  const over = total > maxFiles
  const toggle = (id: string) => onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const fill = () => {
    if (!profile) return
    const values = profileToApplyForm(profile, history[0]) as Record<string, unknown>
    const patch = fillOnlyEmpty(form, values)
    onFill(patch)
    setFilled(Object.keys(patch).length)
  }

  return (
    <div data-testid="use-my-pack" className="rounded-2xl border border-brand/30 bg-[#EAF6FD] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-brand">{zh ? '我的申请包' : 'My application pack'}</div>
          <div className="mt-0.5 text-[13px] leading-relaxed text-body-2">
            {zh ? '只填还空着的字段，你已经输入的不会被覆盖；填好后仍可逐项修改。' : 'Fills only the fields still empty — nothing you typed is overwritten, and you can edit every field afterwards.'}
          </div>
        </div>
        <button type="button" data-testid="use-my-pack-fill" onClick={fill} disabled={!!locked} className="sl-btn-primary !py-[10px] !text-[13px] disabled:opacity-60">
          {zh ? '用我的申请包填写' : 'Fill from my pack'}
        </button>
      </div>
      {filled !== null && (
        <div data-testid="use-my-pack-filled" className="mt-2 text-[12.5px] text-body-2">
          {filled > 0
            ? (zh ? `已填入 ${filled} 项，请往下核对。` : `${filled} field${filled === 1 ? '' : 's'} filled in — please check them below.`)
            : (zh ? '表单里没有空着的字段可填。' : 'No empty fields left to fill.')}
        </div>
      )}

      <div className="mt-4 border-t border-brand/15 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[13px] font-bold">{zh ? '附到这份申请的文件' : 'Files to attach to this application'}</div>
          <div data-testid="use-my-pack-count" className={`font-mono text-[11px] ${over ? 'text-danger' : 'text-body-3'}`}>
            {zh ? `共 ${total} / 上限 ${maxFiles}` : `${total} / ${maxFiles} max`}
          </div>
        </div>
        {!consented && (
          <div data-testid="use-my-pack-no-consent" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900">
            {zh ? '先在申请包页同意出示，这里才能附上包里的文件。' : 'Agree to present your pack on the pack page first; then its files can be attached here.'}{' '}
            <Link href="/tenant/passport" className="font-semibold underline">{zh ? '去申请包页 →' : 'Open the pack page →'}</Link>
          </div>
        )}
        {views.length === 0 ? (
          <div className="mt-2 text-[12.5px] text-body-2">
            {zh ? '包里还没有这套房源会收的文件。' : 'The pack has no files of the kinds this listing collects.'}{' '}
            <Link href="/tenant/passport" className="font-semibold text-brand underline underline-offset-2">{zh ? '去上传 →' : 'Add some →'}</Link>
          </div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {views.map(({ file, days, state: fs }) => {
              const checked = selected.includes(file.id)
              const stale = fs !== 'fresh'
              return (
                <li key={file.id} data-testid="use-my-pack-file" data-state={fs} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={file.name ?? file.kind}
                    checked={checked}
                    disabled={!consented}
                    onChange={() => toggle(file.id)}
                    className="mt-[3px] h-4 w-4 accent-brand disabled:opacity-50"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[12px] font-semibold text-body-2">{kindLabel(file.kind)[zh ? 'zh' : 'en']}</span>
                      <span className="truncate font-mono text-[12px]">{file.name ?? file.path.split('/').pop()}</span>
                      <span className={`sl-chip ${fs === 'fresh' ? 'fit' : 'lock'}`}>
                        {fs === 'fresh' ? (zh ? '较新' : 'Recent') : fs === 'aging' ? (zh ? '有些旧' : 'Aging') : (zh ? '已过时' : 'Out of date')}
                      </span>
                    </div>
                    <div className="font-mono text-[10.5px] text-body-3">
                      {file.as_of ? (zh ? `截至 ${fmtDate(file.as_of)}` : `as of ${fmtDate(file.as_of)}`) : (zh ? `上传于 ${fmtDate(file.uploaded_at)}` : `uploaded ${fmtDate(file.uploaded_at)}`)}
                      {stale && (zh ? ` · 已 ${days} 天，建议先更新` : ` · ${days} days old — consider updating it first`)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="mt-2 text-[11.5px] leading-relaxed text-body-3">
          {zh ? '勾选的文件会在提交时复制进这份申请；之后在申请包里删除不影响已提交的副本。' : 'Ticked files are copied into this application when you submit; removing them from the pack later does not affect the copy already submitted.'}
        </div>
      </div>
    </div>
  )
}
