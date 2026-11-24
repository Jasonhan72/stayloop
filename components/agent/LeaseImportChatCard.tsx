'use client'

// The lease import, finished in the AI conversation (2026-11-24, user: 「所有产品页面里的模块…也能用 AI 对话
// 完成服务」 → 「从导入租约开始」). It appears under the assistant's reply when a signed-in person asks
// to bring a signed lease in (lib/agent/leaseImportIntent.ts) and takes the import from file to
// managed tenancy without leaving the thread:
//   file     the lease that came with the message is used as it is; otherwise one is picked here
//   read     the same extraction the import page uses — an accelerator, never a bypass
//   check    every field is editable, and the ones the AI Agent read are marked until touched
//   confirm  only 「确认导入」 creates anything, and only from what is on the card
//   invite   the other side, by email, or later
// Every call is the person's own (lib/household/importClient.ts — the import page's routes and
// RPCs). The assistant never sees the card's fields and cannot press its button: this is a form
// the person submits, like the listing draft card, not something the assistant proposes.
//
// What survives a reload: that the import was done (this browser, per account and card), so the
// card does not offer to import the same lease again. A second attempt at the same address is
// caught anyway — the card shows the tenancy that is already there.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { notifyFactsChanged } from '@/lib/facts/useFacts'
import type { LeaseImportOffer } from '@/lib/agent/leaseImportIntent'
import type { AgentRole, ChatAttachment } from '@/lib/agent/types'
import type { LeaseImportExtraction } from '@/lib/household/importExtract'
import { EMPTY_IMPORT_FORM, IMPORT_MAX_FILES, acceptableLeaseFiles, defaultInvites, fieldsRead, formFromExtraction, importFormError, sendableInvites, type ImportField, type ImportForm, type ImportRole } from '@/lib/household/importForm'
import { createImportedHousehold, extractLease, householdsAtSameAddress, sendHouseholdInvites, uploadLeaseFiles, type ImportMatch } from '@/lib/household/importClient'

type Step = 'pick' | 'reading' | 'form' | 'invite' | 'done'
type Done = { id: string; address: string; invited?: number }

/** One read per card, however often the thread re-mounts it (each read is a model call on a whole lease). */
const READS = new Map<string, Promise<{ extraction: LeaseImportExtraction | null; status: number }>>()
/** Test seam: forget the reads made so far. */
export function forgetLeaseImportReads() { READS.clear() }

export const leaseImportDoneKey = (uid: string, offerId: string) => `sl-lease-import:${uid}:${offerId}`

/** The files a chat message carried, as the extraction takes them (a stored thread keeps names only — no bytes, no file). */
export function filesFromAttachments(attachments: ChatAttachment[] | undefined): File[] {
  const out: File[] = []
  for (const a of attachments ?? []) {
    const m = /^data:([^;,]+);base64,(.+)$/.exec(a.dataUrl || '')
    if (!m) continue
    try {
      const bin = atob(m[2])
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      out.push(new File([bytes], a.name || 'lease', { type: m[1] }))
    } catch { /* not a file we can rebuild */ }
  }
  return acceptableLeaseFiles(out)
}

const INPUT = 'w-full rounded-lg border border-line-divider bg-white px-3 py-2 text-[14px] text-ink outline-none transition focus:border-brand'
const LABEL = 'mb-1 mt-3 block text-[12px] font-semibold text-body-2'

export default function LeaseImportChatCard({ offer, role, attachments }: { offer: LeaseImportOffer; role: AgentRole; attachments?: ChatAttachment[] }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user } = useAuth()
  const uid = user?.id ?? null
  const creator: ImportRole = role
  const fid = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const carried = useMemo(() => filesFromAttachments(attachments), [attachments])

  const [step, setStep] = useState<Step>('pick')
  const [files, setFiles] = useState<File[]>([])
  const [form, setForm] = useState<ImportForm>(EMPTY_IMPORT_FORM)
  const [read, setRead] = useState<ImportField[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [matches, setMatches] = useState<ImportMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [invites, setInvites] = useState(() => defaultInvites(creator))
  const [done, setDone] = useState<Done | null>(null)
  const started = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  // The card grows as it moves on (the form is taller than the picker), and the thread scrolled to its end
  // before that: bring it back into view — but only once the person, or the file they sent, set it going,
  // never when an old conversation is opened and the card merely restores 「已导入」.
  const acted = useRef(false)
  const existingRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const bring = (el: HTMLElement | null, block: ScrollLogicalPosition) => { try { el?.scrollIntoView?.({ block, behavior: 'smooth' }) } catch { /* not scrollable here */ } }
  // a new step: from its top (the form is taller than the thread's window, so 「nearest」 would not move it)
  useEffect(() => { if (acted.current) bring(boxRef.current, 'start') }, [step])
  // what was just added inside the form — the tenancy already there, or why it was not saved — must be seen
  useEffect(() => { if (acted.current && matches?.length) bring(existingRef.current, 'center') }, [matches])
  useEffect(() => { if (acted.current && error) bring(errorRef.current, 'center') }, [error])

  // Done already (in this browser): say so instead of offering the same import again.
  useEffect(() => {
    if (!uid) return
    try {
      const raw = window.localStorage.getItem(leaseImportDoneKey(uid, offer.id))
      const d = raw ? (JSON.parse(raw) as Done) : null
      if (d && typeof d.id === 'string') { setDone(d); setStep('done') }
    } catch { /* no storage: the card simply starts over */ }
  }, [uid, offer.id])

  const readFiles = useCallback(async (picked: File[]) => {
    const take = acceptableLeaseFiles(picked)
    if (!take.length) { setError(zh ? '只能读 PDF 或照片（最多 3 个，共 10MB）。' : 'Only PDFs or photos can be read (up to 3 files, 10MB in all).'); return }
    acted.current = true
    setError(null); setFiles(take); setStep('reading'); setReadFailed(false)
    let run = READS.get(offer.id)
    if (!run) { run = extractLease(take); READS.set(offer.id, run) }
    const { extraction } = await run
    if (extraction) {
      setForm(formFromExtraction(extraction))
      setRead(fieldsRead(extraction))
      setNote(extraction.note)
    } else {
      // A failed read is not a failed import: the form starts blank, and the next file may be read again.
      READS.delete(offer.id)
      setForm(EMPTY_IMPORT_FORM); setRead([]); setNote(null); setReadFailed(true)
    }
    setStep('form')
  }, [offer.id, zh])

  // The lease that came with the message is read straight away — once.
  useEffect(() => {
    if (started.current || !uid || !carried.length) return
    let finished = false
    try { finished = !!window.localStorage.getItem(leaseImportDoneKey(uid, offer.id)) } catch { /* no storage */ }
    if (finished) return
    started.current = true
    void readFiles(carried)
  }, [uid, carried, offer.id, readFiles])

  const set = (k: ImportField) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setForm((f) => ({ ...f, [k]: v }))
    setRead((r) => r.filter((x) => x !== k))
    if (k === 'address' || k === 'unit') setMatches(null)
  }

  async function confirm(force = false) {
    acted.current = true
    const bad = importFormError(form, zh)
    if (bad) { setError(bad); return }
    setError(null); setBusy(true)
    try {
      if (!force) {
        const same = await householdsAtSameAddress(form)
        if (same.length) { setMatches(same); return }
      }
      const id = await createImportedHousehold(form, creator)
      setHouseholdId(id); setMatches(null)
      if (files.length) await uploadLeaseFiles(id, files)
      notifyFactsChanged()
      setStep('invite')
    } catch (e) {
      setError(zh ? `没有导入成功（${e instanceof Error ? e.message : '未知错误'}）。可以再试一次。` : `The import did not go through (${e instanceof Error ? e.message : 'unknown error'}). You can try again.`)
    } finally {
      setBusy(false)
    }
  }

  function finish(invited: number) {
    if (!householdId) return
    const d: Done = { id: householdId, address: form.address.trim() + (form.unit.trim() ? ` · ${form.unit.trim()}` : ''), invited }
    setDone(d); setStep('done')
    if (uid) { try { window.localStorage.setItem(leaseImportDoneKey(uid, offer.id), JSON.stringify(d)) } catch { /* no storage */ } }
  }

  async function invite() {
    if (!householdId) return
    if (!sendableInvites(invites).length) { finish(0); return }
    setError(null); setBusy(true)
    try {
      finish(await sendHouseholdInvites(householdId, invites))
    } catch (e) {
      setError(zh ? `邀请没有发出（${e instanceof Error ? e.message : '未知错误'}）。在管租约已经建好，可以再试，或稍后在管理页里邀请。` : `The invitation was not sent (${e instanceof Error ? e.message : 'unknown error'}). The tenancy is created — try again, or invite from its page later.`)
    } finally {
      setBusy(false)
    }
  }

  if (!uid) return null

  const field = (k: ImportField, label: string, props: Record<string, unknown> = {}) => (
    <div>
      <label htmlFor={`${fid}-${k}`} className={LABEL}>
        {label}
        {read.includes(k) && <span data-testid="lease-import-read" className="ml-1.5 inline-flex items-center rounded-full bg-brand/10 px-1.5 py-[1px] align-middle text-[10.5px] font-semibold leading-[1.5] text-brand">{zh ? 'AI 读出' : 'AI read'}</span>}
      </label>
      <input id={`${fid}-${k}`} className={INPUT} value={form[k]} onChange={set(k)} data-testid={`lease-import-${k}`} {...props} />
    </div>
  )
  const roleName = (r: string) => (r === 'landlord' ? (zh ? '房东' : 'Landlord') : r === 'tenant' ? (zh ? '租客' : 'Tenant') : (zh ? '经纪' : 'Agent'))

  return (
    <div ref={boxRef} className="w-full max-w-[460px] scroll-mb-4 scroll-mt-4 rounded-xl border border-line-divider bg-white p-4 text-left" data-testid="lease-import-card" data-step={step}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#E6F5EF] text-[#047857]" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15l2 2 4-4" /></svg>
        </span>
        <div className="text-[14px] font-bold text-ink">{zh ? '导入租约' : 'Import a lease'}</div>
        <span className="ml-auto text-[11.5px] text-body-3">{zh ? `以${roleName(creator)}身份` : `As the ${roleName(creator).toLowerCase()}`}</span>
      </div>

      {error && <div ref={errorRef} className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700" role="alert" data-testid="lease-import-error">{error}</div>}

      {step === 'pick' && (
        <div className="mt-3" data-testid="lease-import-pick">
          <p className="text-[12.5px] leading-relaxed text-body-2">
            {zh ? '选一份签好的租约（PDF 或照片）。我读出地址、租期和租金，你核对后再保存。' : 'Choose the signed lease (a PDF or photos). I read the address, the term and the rent; you check them before anything is saved.'}
          </p>
          <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 w-full rounded-lg border-2 border-dashed border-line-divider bg-[#F8FAFC] px-4 py-5 text-center transition hover:border-brand" data-testid="lease-import-choose">
            <span className="block text-[13.5px] font-bold text-ink">{zh ? '选择租约文件' : 'Choose lease file(s)'}</span>
            <span className="mt-0.5 block text-[11.5px] text-body-3">{zh ? `PDF 或照片 · 最多 ${IMPORT_MAX_FILES} 个 · 共 10MB` : `PDF or photos · up to ${IMPORT_MAX_FILES} files · 10MB total`}</span>
          </button>
          <button type="button" onClick={() => { acted.current = true; setError(null); setStep('form') }} className="mt-2.5 text-[12px] text-body-3 underline underline-offset-2" data-testid="lease-import-manual">
            {zh ? '没有电子版？直接填写' : 'No file at hand? Fill it in'}
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        aria-label={zh ? '选择租约文件' : 'Choose lease file(s)'}
        data-testid="lease-import-file"
        onChange={(e) => { const list = Array.from(e.target.files ?? []).slice(0, IMPORT_MAX_FILES); e.target.value = ''; if (list.length) void readFiles(list) }}
      />

      {step === 'reading' && (
        <div className="py-7 text-center" data-testid="lease-import-reading" role="status">
          <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-[#00ACE4] border-t-transparent" />
          <p className="mt-2.5 text-[12.5px] text-body-3">{zh ? '正在读这份租约…' : 'Reading the lease…'}</p>
          <p className="mt-1 truncate text-[11.5px] text-body-3">{files.map((f) => f.name).join(' · ')}</p>
        </div>
      )}

      {step === 'form' && (
        <div className="mt-1" data-testid="lease-import-form">
          <p className="mt-2 text-[12px] leading-relaxed text-body-3">
            {read.length
              ? (zh ? '标「AI 读出」的是我从租约里读到的，请逐项核对——以你确认的为准。' : 'Fields marked “AI read” came from the lease. Check each one — what you confirm is what counts.')
              : readFailed
                ? (zh ? '这份文件我没有读出来，请直接填写。' : 'I could not read this file — please fill the fields in.')
                : (zh ? '填好下面几项，确认后建成在管租约。' : 'Fill these in; confirming creates the managed tenancy.')}
          </p>
          {files.length > 0 && <p className="mt-1 truncate text-[11.5px] text-body-3" data-testid="lease-import-files">{zh ? '文件：' : 'File: '}{files.map((f) => f.name).join(' · ')}</p>}
          {note && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800" data-testid="lease-import-note">⚠ {note}</p>}

          {field('address', zh ? '房屋地址 *' : 'Address *', { placeholder: zh ? '例：88 Harbour St' : 'e.g. 88 Harbour St' })}
          <div className="grid grid-cols-2 gap-3">
            {field('unit', zh ? '单元号' : 'Unit')}
            {field('city', zh ? '城市' : 'City')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('monthly_rent', zh ? '月租金 (CAD)' : 'Monthly rent (CAD)', { type: 'number', inputMode: 'decimal', min: 0 })}
            {field('rent_due_day', zh ? '每月几号交租' : 'Rent due day', { type: 'number', inputMode: 'numeric', min: 1, max: 31 })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('start_date', zh ? '起租日' : 'Start date', { type: 'date' })}
            {field('end_date', zh ? '到期日（月租可留空）' : 'End of term (optional)', { type: 'date' })}
          </div>
          {field('tenant_name', zh ? '租客姓名（按租约）' : 'Tenant name(s) as on the lease')}
          {field('tenant_email', zh ? '租客邮箱（可留空）' : 'Tenant email (optional)', { type: 'email', autoComplete: 'off' })}

          {matches && matches.length > 0 && (
            <div ref={existingRef} className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900" data-testid="lease-import-existing">
              <div className="font-semibold">{zh ? '这个地址和单元已经有在管租约了' : 'This address and unit is already a managed tenancy'}</div>
              <p className="mt-1 text-[12px]">{zh ? '同一份租约导入两次会变成两份在管租约。先看看是不是这一份：' : 'Importing the same lease twice makes two tenancies. Check whether it is this one first:'}</p>
              <ul className="mt-2 space-y-1.5">
                {matches.map((h) => (
                  <li key={h.id} className="rounded-md border border-amber-200 bg-white px-2.5 py-1.5">
                    <div className="text-[12.5px] font-semibold text-body">{h.address}{h.unit ? ` · ${h.unit}` : ''}</div>
                    {h.relation === 'invited' && h.invite_token
                      ? <Link href={`/join/${h.invite_token}`} className="text-[12px] font-semibold text-[#00ACE4] underline underline-offset-2">{zh ? '你已被邀请加入 · 去接受邀请 →' : 'You were invited · accept the invitation →'}</Link>
                      : <Link href={`/h/${h.id}`} className="text-[12px] font-semibold text-[#00ACE4] underline underline-offset-2" data-testid="lease-import-existing-open">{zh ? '打开它 →' : 'Open it →'}</Link>}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => void confirm(true)} disabled={busy} className="mt-2 text-[12px] text-body-2 underline underline-offset-2 disabled:opacity-50" data-testid="lease-import-force">
                {zh ? '不是同一份（例如这个单元的新租客）——仍然新建' : 'Not the same tenancy (e.g. a new tenant in this unit) — create a new one'}
              </button>
            </div>
          )}

          <button type="button" onClick={() => void confirm()} disabled={busy} className="mt-4 w-full rounded-lg py-2.5 text-[14px] font-bold text-white transition hover:brightness-95 disabled:opacity-60" style={{ background: '#00ACE4' }} data-testid="lease-import-confirm">
            {busy ? (zh ? '处理中…' : 'Working…') : (zh ? '确认导入' : 'Confirm & import')}
          </button>
          <p className="mt-2 text-center text-[11.5px] text-body-3">{zh ? '确认之前什么都不会保存。' : 'Nothing is saved until you confirm.'}</p>
        </div>
      )}

      {step === 'invite' && (
        <div className="mt-3" data-testid="lease-import-invite">
          <div className="text-[13.5px] font-bold text-ink">{zh ? '✓ 在管租约已建好。邀请对方加入' : '✓ The tenancy is created. Invite the other side'}</div>
          <p className="mt-1 text-[12px] leading-relaxed text-body-3">{zh ? '对方会收到邮件，看过租约信息后自己决定是否加入；确认后这份记录就是双方共同的。' : 'They get an email and decide after seeing the details; once they confirm, the record belongs to both sides.'}</p>
          {invites.map((inv, i) => (
            <div key={i} className="mt-2.5 flex gap-2">
              <input
                className={INPUT}
                type="email"
                autoComplete="off"
                placeholder="email@example.com"
                aria-label={zh ? `${roleName(inv.role)}的邮箱` : `${roleName(inv.role)}’s email`}
                value={inv.email}
                data-testid="lease-import-invite-email"
                onChange={(e) => setInvites((a) => a.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
              />
              <select
                className="flex-none rounded-lg border border-line-divider bg-white px-2 text-[13px] text-ink"
                aria-label={zh ? '对方的身份' : 'Their role'}
                value={inv.role}
                onChange={(e) => setInvites((a) => a.map((x, j) => (j === i ? { ...x, role: e.target.value as ImportRole } : x)))}
              >
                <option value="landlord">{roleName('landlord')}</option>
                <option value="tenant">{roleName('tenant')}</option>
                <option value="agent">{roleName('agent')}</option>
              </select>
            </div>
          ))}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void invite()} disabled={busy} className="flex-1 rounded-lg py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-95 disabled:opacity-60" style={{ background: '#00ACE4' }} data-testid="lease-import-invite-send">
              {busy ? (zh ? '发送中…' : 'Sending…') : (zh ? '发送邀请' : 'Send the invitation')}
            </button>
            <button type="button" onClick={() => finish(0)} disabled={busy} className="rounded-lg border border-line-divider px-4 text-[13px] text-body-2 disabled:opacity-50" data-testid="lease-import-invite-later">
              {zh ? '稍后再邀' : 'Later'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && done && (
        <div className="mt-3" data-testid="lease-import-done">
          <div className="text-[13.5px] font-bold text-ink">{zh ? '✓ 已导入，在管租约已建好' : '✓ Imported — the managed tenancy is created'}</div>
          {done.address && <div className="mt-0.5 text-[12.5px] text-body-2">{done.address}</div>}
          <p className="mt-1.5 text-[12px] leading-relaxed text-body-3">
            {done.invited
              ? (zh ? `已发出 ${done.invited} 封邀请。对方加入并确认后，对话、报修和租金记录都在这份在管租约里。` : `${done.invited} invitation${done.invited === 1 ? '' : 's'} sent. Once the other side joins and confirms, messages, repairs and the rent record all live in this tenancy.`)
              : (zh ? '还没有邀请对方，可以随时在管理页里邀请。对方加入并确认后，这份记录就是双方共同的。' : 'Nobody has been invited yet — you can do it from the tenancy’s page at any time. Once the other side joins and confirms, the record belongs to both.')}
          </p>
          {creator === 'landlord' && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-body-2" data-testid="lease-import-next">
              {zh ? '下一步：在管理页把每一期租金记上（上传银行流水的 CSV，或逐期标记）。' : 'Next: record each rent period on the tenancy’s page (upload the bank statement CSV, or mark periods one by one).'}
            </p>
          )}
          <Link href={`/h/${done.id}`} className="mt-3 inline-flex min-h-[40px] items-center rounded-lg px-4 text-[13.5px] font-bold text-white transition hover:brightness-95" style={{ background: '#00ACE4' }} data-testid="lease-import-open">
            {zh ? '进入管理页 →' : 'Open the tenancy →'}
          </Link>
        </div>
      )}
    </div>
  )
}
