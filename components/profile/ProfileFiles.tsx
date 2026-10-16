'use client'

// Applicant pack · files (V1.0 阶段 4 · G14).
//
// Lists applicant_profile_files grouped by kind, with the freshness badge
// (lib/profile/freshness.ts), a signed-URL viewer and a two-step delete.
// Uploads go through prepareUploads (large photos are downscaled on the
// device, same as screening) and then POST /api/profile/files, which stores
// the object under profile/<uid>/<kind>/… and computes the SHA-256 server
// side. The client never inserts rows itself (no storage insert policy).
import { useRef, useState } from 'react'
import { PROFILE_FILE_KINDS, PROFILE_FILES_PER_KIND, PROFILE_FILES_TOTAL, profileFileErrorText, type ProfileFile, type ProfileFileKind } from '@/lib/profile/types'
import { freshness } from '@/lib/profile/freshness'
import { MAX_UPLOAD_BYTES, prepareUploads } from '@/lib/screening/prepareUpload'
import { supabase } from '@/lib/supabase'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf,.pdf'

export type ProfileFilesProps = {
  zh: boolean
  signedIn: boolean
  files: ProfileFile[]
  /** Called after any upload or delete so the page reloads the list. */
  onChanged: () => void | Promise<void>
  /** Injected for deterministic rendering in tests; defaults to now. */
  today?: Date
}

function fmtDay(iso: string | null | undefined, zh: boolean): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA')
}

function fmtSize(n: number | null | undefined): string {
  if (!n) return ''
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

export function FreshnessBadge({ kind, file, zh, today }: { kind: ProfileFileKind; file: ProfileFile; zh: boolean; today?: Date }) {
  const fr = freshness(kind, file.as_of ?? file.uploaded_at, today ?? new Date())
  const cls = fr.state === 'fresh' ? 'bg-success/10 text-success' : fr.state === 'aging' ? 'bg-warning/15 text-warning' : 'bg-danger/10 text-danger'
  const text = (zh ? fr.suggestZh : fr.suggestEn) || (fr.state === 'fresh' && kind !== 'id' && kind !== 'reference' && kind !== 'other' ? (zh ? `${fr.days} 天前 · 新` : `${fr.days} days old · current`) : '')
  if (!text) return null
  return <span className={`inline-block max-w-full rounded-full px-2 py-0.5 text-[11px] font-semibold leading-snug ${cls}`} data-testid={`freshness-${fr.state}`}>{text}</span>
}

export default function ProfileFiles({ zh, signedIn, files, onChanged, today }: ProfileFilesProps) {
  const [busyKind, setBusyKind] = useState<ProfileFileKind | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [rejected, setRejected] = useState<string[]>([])
  const [asOf, setAsOf] = useState<Partial<Record<ProfileFileKind, string>>>({})
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const inputs = useRef<Partial<Record<ProfileFileKind, HTMLInputElement | null>>>({})

  const byKind = (k: ProfileFileKind) => files.filter((f) => f.kind === k)

  async function token(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  async function upload(kind: ProfileFileKind, picked: FileList | null) {
    if (!picked || !picked.length || busyKind) return
    setErr(null)
    setRejected([])
    setBusyKind(kind)
    try {
      const t = await token()
      if (!t) { setErr(zh ? '请先登录。' : 'Please sign in first.'); return }
      const prepared = await prepareUploads(Array.from(picked))
      if (prepared.rejected.length) {
        setRejected(prepared.rejected.map((r) => (zh ? `${r.name}：超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB，没有上传` : `${r.name}: over ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB, not uploaded`)))
      }
      for (const p of prepared.accepted) {
        const fd = new FormData()
        fd.set('kind', kind)
        fd.set('file', p.file, p.file.name)
        const d = asOf[kind]
        if (d) fd.set('as_of', d)
        const res = await fetch('/api/profile/files', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: fd })
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          setErr(profileFileErrorText(j.error || `HTTP ${res.status}`, zh))
          break
        }
      }
      await onChanged()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusyKind(null)
      const el = inputs.current[kind]
      if (el) el.value = ''
    }
  }

  async function view(f: ProfileFile) {
    setErr(null)
    // Open the tab on the click so the browser's popup rule is satisfied, then point it at the signed URL.
    const win = window.open('about:blank', '_blank')
    const { data, error } = await supabase.storage.from('tenant-files').createSignedUrl(f.path, 600)
    if (error || !data?.signedUrl) { win?.close(); setErr(zh ? '暂时打不开这份文件，请稍后再试。' : 'Could not open this file right now — try again shortly.'); return }
    if (win) win.location.href = data.signedUrl; else window.location.assign(data.signedUrl)
  }

  async function remove(f: ProfileFile) {
    if (deleting) return
    setErr(null)
    setDeleting(f.id)
    try {
      const t = await token()
      if (!t) { setErr(zh ? '请先登录。' : 'Please sign in first.'); return }
      const res = await fetch(`/api/profile/files?id=${encodeURIComponent(f.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setErr(profileFileErrorText(j.error || `HTTP ${res.status}`, zh))
        return
      }
      setConfirmId(null)
      await onChanged()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <section className="rounded-xl border border-line-divider bg-white p-4 sm:p-5" data-testid="profile-files">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-bold tracking-tight">{zh ? '文件' : 'Files'}</h2>
        <span className="text-[12px] text-body-3">{zh ? `${files.length} 份 · 每种最多 ${PROFILE_FILES_PER_KIND} 份、共 ${PROFILE_FILES_TOTAL} 份 · 单个 ≤ ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB` : `${files.length} on file · up to ${PROFILE_FILES_PER_KIND} per kind, ${PROFILE_FILES_TOTAL} in all · ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB each`}</span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-body-3">
        {zh ? '文件只存在你的账号里，出示时由你决定给谁。房东看到的清单只有文件名、指纹（SHA-256）、上传日和新鲜度；文件本身在你出示申请时才附上。' : 'Files stay in your account; you decide who sees them. A landlord’s list shows only the name, fingerprint (SHA-256), upload date and freshness — the files themselves go with an application only when you present it.'}
      </p>
      {!signedIn && <p className="mt-3 rounded-lg bg-surface-chip px-3 py-2 text-[12.5px] text-body-2">{zh ? '登录后可以上传文件。' : 'Sign in to upload files.'}</p>}
      {err && <p className="mt-3 text-[12.5px] text-danger" role="alert">{err}</p>}
      {rejected.length > 0 && (
        <ul className="mt-3 rounded-lg border border-warning/40 bg-warning/[0.06] px-3 py-2 text-[12.5px] text-body-2" data-testid="profile-files-rejected">
          {rejected.map((r) => <li key={r}>⚠ {r}</li>)}
        </ul>
      )}

      <div className="mt-4 space-y-4">
        {PROFILE_FILE_KINDS.map(({ kind, label, hint }) => {
          const list = byKind(kind)
          const busy = busyKind === kind
          return (
            <div key={kind} className="rounded-xl border border-line-divider p-3 sm:p-4" data-kind={kind}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">{zh ? label.zh : label.en}<span className="ml-2 font-mono text-[10.5px] text-body-3">{list.length}/{PROFILE_FILES_PER_KIND}</span></div>
                  <div className="text-[11.5px] leading-relaxed text-body-3">{zh ? hint.zh : hint.en}{kind === 'id' ? (zh ? '；填到期日，过期会提醒你' : '; add the expiry date and you’ll be reminded') : ''}</div>
                </div>
                {signedIn && (
                  <div className="flex flex-wrap items-center gap-2">
                    {kind === 'id' && (
                      <label className="flex items-center gap-1.5 text-[11.5px] text-body-3">
                        {zh ? '到期日' : 'Expires'}
                        <input type="date" value={asOf.id ?? ''} onChange={(e) => setAsOf({ ...asOf, id: e.target.value })} className="sl-input !w-auto !px-2 !py-1 !text-[12px]" aria-label={zh ? '证件到期日' : 'ID expiry date'} />
                      </label>
                    )}
                    <input
                      ref={(el) => { inputs.current[kind] = el }}
                      type="file"
                      accept={ACCEPT}
                      multiple
                      className="hidden"
                      onChange={(e) => upload(kind, e.target.files)}
                      aria-label={zh ? `上传${label.zh}` : `Upload ${label.en}`}
                    />
                    <button type="button" disabled={!!busyKind || list.length >= PROFILE_FILES_PER_KIND} onClick={() => inputs.current[kind]?.click()} className="sl-btn-secondary !px-3 !py-1.5 text-[12.5px] disabled:opacity-50">
                      {busy ? (zh ? '上传中…' : 'Uploading…') : (zh ? '+ 上传' : '+ Upload')}
                    </button>
                  </div>
                )}
              </div>
              {list.length > 0 && (
                <ul className="mt-3 divide-y divide-line-divider">
                  {list.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                      <div className="min-w-0 flex-1 basis-[12rem]">
                        <div className="truncate text-[13px] font-medium" title={f.name ?? ''}>{f.name || f.path.split('/').pop()}</div>
                        <div className="text-[11px] text-body-3">
                          {zh ? '上传 ' : 'Uploaded '}{fmtDay(f.uploaded_at, zh)}
                          {f.as_of ? ` · ${kind === 'id' ? (zh ? '到期 ' : 'expires ') : (zh ? '文件日期 ' : 'as of ')}${fmtDay(f.as_of, zh)}` : ''}
                          {f.size ? ` · ${fmtSize(f.size)}` : ''}
                          {f.sha256 ? <span className="font-mono"> · {f.sha256.slice(0, 12)}</span> : null}
                        </div>
                      </div>
                      <FreshnessBadge kind={kind} file={f} zh={zh} today={today} />
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => view(f)} className="rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-brand hover:bg-brand/5">{zh ? '查看' : 'View'}</button>
                        {confirmId === f.id ? (
                          <span className="inline-flex items-center gap-1.5" data-testid="profile-file-delete-confirm">
                            <button type="button" disabled={deleting === f.id} onClick={() => remove(f)} className="rounded-lg bg-danger px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-60">{deleting === f.id ? (zh ? '删除中…' : 'Deleting…') : (zh ? '确认删除' : 'Confirm delete')}</button>
                            <button type="button" onClick={() => setConfirmId(null)} className="rounded-lg px-2 py-1 text-[12px] text-body-3 hover:bg-surface-chip">{zh ? '取消' : 'Cancel'}</button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setConfirmId(f.id)} className="rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-danger hover:bg-danger/5">{zh ? '删除' : 'Delete'}</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
