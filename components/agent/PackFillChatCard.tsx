'use client'

// The application pack, filled from the AI conversation (2026-11-25, user: 「接着做护照」). It appears under
// the assistant's reply when a signed-in tenant asks to get the pack ready (lib/agent/packFillIntent.ts):
//   files     the pay stub or employment letter that came with the message is read at once; otherwise
//             one is picked here (PDF or photo). Read once per card — each read is a model call
//   proposed  only the pack fields the documents show AND the pack still lacks (lib/profile/packFill.ts):
//             a value the applicant typed is never replaced by one a model read
//   check     every proposed value is editable and marked 「AI 读出」 until touched; the monthly income
//             says what it was worked out from
//   files     each file goes into the pack under the kind shown — which the applicant can change, or untick
//   confirm   only 「确认写进申请包」 writes: the confirmed columns onto the applicant's own row, the
//             ticked files through the pack's own upload route (lib/profile/packClient.ts)
// The consent box is the applicant's alone and is not on this card; nor are the date of birth, the
// rental history or the household. What is written stays self-declared — nothing here verifies anything.
// The assistant never sees the fields and cannot press the button.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import type { PackFillOffer } from '@/lib/agent/packFillIntent'
import type { AgentRole, ChatAttachment } from '@/lib/agent/types'
import { hasCurrentConsent } from '@/lib/profile/consent'
import { EMPLOYMENT_STATUS_LABEL } from '@/lib/profile/exportPack'
import { PACK_EXTRACT_MAX_BYTES, PACK_EXTRACT_MAX_FILES, PACK_EXTRACT_TYPES, type PackExtraction } from '@/lib/profile/packExtract'
import { PACK_FILL_FIELDS, PACK_FILL_LABEL, nameDiffers, packFillError, packPatch, packSuggestion, payBasisLine, type PackFillField, type PackFillValues } from '@/lib/profile/packFill'
import { extractPack, loadPack, savePackFields, storePackFile } from '@/lib/profile/packClient'
import { PROFILE_FILE_KINDS, acceptProfileFile, type ApplicantProfile, type ProfileFileKind } from '@/lib/profile/types'

type Step = 'loading' | 'failed' | 'pick' | 'reading' | 'form' | 'saving' | 'done'
type FileRow = { file: File; kind: ProfileFileKind; asOf: string; keep: boolean; error?: string; stored?: boolean }
type Done = { fields: PackFillField[]; files: number; consented: boolean }

/** One read per card, however often the thread re-mounts it (each read is a model call on whole documents). */
const READS = new Map<string, Promise<{ extraction: PackExtraction | null; status: number }>>()
/** Test seam: forget the reads made so far. */
export function forgetPackReads() { READS.clear() }

export const packFillDoneKey = (uid: string, offerId: string) => `sl-pack-fill:${uid}:${offerId}`

/** The files a chat message carried that the pack card can read: PDFs and photos, the first three, ten megabytes in all. */
export function packFilesFromAttachments(attachments: ChatAttachment[] | undefined): File[] {
  const out: File[] = []
  let total = 0
  for (const a of attachments ?? []) {
    if (out.length >= PACK_EXTRACT_MAX_FILES) break
    const m = /^data:([^;,]+);base64,(.+)$/.exec(a.dataUrl || '')
    if (!m || !PACK_EXTRACT_TYPES.test(m[1])) continue
    try {
      const bin = atob(m[2])
      if (total + bin.length > PACK_EXTRACT_MAX_BYTES) continue
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      total += bin.length
      out.push(new File([bytes], a.name || 'document', { type: m[1] }))
    } catch { /* not a file we can rebuild */ }
  }
  return out
}

const INPUT = 'w-full rounded-lg border border-line-divider bg-white px-3 py-2 text-[14px] text-ink outline-none transition focus:border-brand'
const LABEL = 'mb-1 mt-3 block text-[12px] font-semibold text-body-2'

export default function PackFillChatCard({ offer, role, attachments }: { offer: PackFillOffer; role: AgentRole; attachments?: ChatAttachment[] }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user } = useAuth()
  const uid = user?.id ?? null
  const mine = role === 'tenant'
  const fid = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const carried = useMemo(() => packFilesFromAttachments(attachments), [attachments])

  const [step, setStep] = useState<Step>('loading')
  const [profile, setProfile] = useState<Partial<ApplicantProfile> | null>(null)
  const [values, setValues] = useState<PackFillValues>({})
  const [read, setRead] = useState<PackFillField[]>([])
  const [kept, setKept] = useState<PackFillField[]>([])
  const [x, setX] = useState<PackExtraction | null>(null)
  const [rows, setRows] = useState<FileRow[]>([])
  const [readFailed, setReadFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const started = useRef<string | null>(null)
  const acted = useRef(false)

  // after the applicant (or the files they sent) set it going, keep the new step in view — never when an old thread merely restores 「已写进」
  useEffect(() => { if (acted.current) { try { boxRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }) } catch { /* not scrollable here */ } } }, [step])

  const readFiles = useCallback(async (picked: File[], current: Partial<ApplicantProfile> | null) => {
    const take: File[] = []
    let total = 0
    for (const f of picked) {
      if (take.length >= PACK_EXTRACT_MAX_FILES) break
      if (!PACK_EXTRACT_TYPES.test(f.type) || total + f.size > PACK_EXTRACT_MAX_BYTES) continue
      total += f.size; take.push(f)
    }
    if (!take.length) { setError(zh ? '能读的是 PDF 或 JPG / PNG / WebP 照片（最多 3 个，共 10MB）。' : 'What can be read is a PDF or a JPG / PNG / WebP photo (up to 3 files, 10MB in all).'); return }
    acted.current = true
    setError(null); setReadFailed(false); setStep('reading')
    let run = READS.get(offer.id)
    if (!run) { run = extractPack(take); READS.set(offer.id, run) }
    const { extraction } = await run
    if (!extraction) READS.delete(offer.id) // a failed read may be tried again with the next file
    const s = extraction ? packSuggestion(current, extraction) : { fill: {}, kept: [] }
    setX(extraction); setValues(s.fill); setRead(Object.keys(s.fill) as PackFillField[]); setKept(s.kept); setReadFailed(!extraction)
    setRows(take.map((file, i) => ({ file, kind: extraction?.files[i]?.kind ?? 'other', asOf: extraction?.files[i]?.as_of ?? '', keep: acceptProfileFile(file).ok })))
    setStep('form')
  }, [offer.id, zh])

  const start = useCallback(async () => {
    if (!uid) return
    try {
      const pack = await loadPack(uid)
      setProfile(pack.profile)
      if (carried.length) await readFiles(carried, pack.profile)
      else setStep('pick')
    } catch {
      setStep('failed')
    }
  }, [uid, carried, readFiles])

  // Written from this card already (in this browser): say so; otherwise read the pack, and the files that came with the message — once.
  useEffect(() => {
    if (!uid || !mine || started.current === `${uid}:${offer.id}`) return
    started.current = `${uid}:${offer.id}`
    try {
      const raw = window.localStorage.getItem(packFillDoneKey(uid, offer.id))
      const d = raw ? (JSON.parse(raw) as Done) : null
      if (d && Array.isArray(d.fields)) { setDone(d); setStep('done'); return }
    } catch { /* no storage: the card starts over */ }
    void start()
  }, [uid, mine, offer.id, start])

  if (!uid || !mine) return null

  const set = (k: PackFillField, v: string) => {
    setValues((o) => ({ ...o, [k]: v }))
    setRead((r) => r.filter((f) => f !== k))
  }
  const proposed = PACK_FILL_FIELDS.filter((f) => f in values)
  const patch = packPatch(values)
  const toStore = rows.filter((r) => r.keep && !r.stored)
  const bad = packFillError(values, zh)
  const nothing = Object.keys(patch).length === 0 && toStore.length === 0

  async function confirm() {
    if (bad) { setError(bad); return }
    if (nothing || !uid) return
    acted.current = true
    setError(null); setStep('saving')
    // nothing to write to the row (files only, or a retry after the details went in): the row is not touched
    const fieldsOk = Object.keys(patch).length ? await savePackFields(uid, patch) : true
    if (!fieldsOk) { setError(zh ? '资料没有保存上，什么都没写进去。请再试一次。' : 'The details were not saved, so nothing was written. Please try again.'); setStep('form'); return }
    const next = [...rows]
    let failed = 0
    for (let i = 0; i < next.length; i++) {
      const r = next[i]
      if (!r.keep || r.stored) continue
      const res = await storePackFile(r.file, r.kind, r.asOf || null, zh)
      next[i] = res.ok ? { ...r, stored: true, error: undefined } : { ...r, error: res.message }
      if (!res.ok) failed++
    }
    setRows(next)
    const written = Object.keys(patch) as PackFillField[]
    if (failed) {
      // the details are in; the files that did not go keep their reason and can be retried
      setValues({}); setRead([]); setKept((k) => [...k, ...written])
      setError(zh ? `资料已写进申请包；有 ${failed} 份文件没有存上，原因写在文件旁边，可以再试。` : `The details are in the pack; ${failed} file${failed === 1 ? '' : 's'} could not be stored — the reason is beside each, and you can try again.`)
      setStep('form')
      return
    }
    const d: Done = { fields: written, files: next.filter((r) => r.stored).length, consented: hasCurrentConsent(profile) }
    setDone(d); setStep('done')
    try { window.localStorage.setItem(packFillDoneKey(uid, offer.id), JSON.stringify(d)) } catch { /* no storage */ }
  }

  const label = (f: PackFillField) => (zh ? PACK_FILL_LABEL[f].zh : PACK_FILL_LABEL[f].en)
  const tag = (f: PackFillField) => read.includes(f) && <span data-testid="pack-fill-read" className="ml-1.5 inline-flex items-center rounded-full bg-brand/10 px-1.5 py-[1px] align-middle text-[10.5px] font-semibold leading-[1.5] text-brand">{zh ? 'AI 读出' : 'AI read'}</span>
  const basis = payBasisLine(x?.pay ?? null, zh)
  const otherName = nameDiffers(profile, x)

  return (
    <div ref={boxRef} className="w-full max-w-[460px] scroll-mb-4 scroll-mt-4 rounded-xl border border-line-divider bg-white p-4 text-left" data-testid="pack-fill-card" data-step={step}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#F3EEFF] text-[#7C3AED]" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M8.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M5.5 16a3 3 0 0 1 6 0" /><path d="M14 9h4" /><path d="M14 13h4" /></svg>
        </span>
        <div className="text-[14px] font-bold text-ink">{zh ? '申请包' : 'Application pack'}</div>
        <Link href="/tenant/passport" className="ml-auto text-[12.5px] font-semibold text-brand underline-offset-2 hover:underline">{zh ? '打开租客护照 →' : 'Open the passport →'}</Link>
      </div>

      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700" role="alert" data-testid="pack-fill-error">{error}</div>}

      {step === 'loading' && <div className="py-6 text-center text-[12.5px] text-body-3" role="status" data-testid="pack-fill-loading">{zh ? '正在读你的申请包…' : 'Reading your pack…'}</div>}

      {step === 'failed' && (
        <div className="mt-3" data-testid="pack-fill-failed">
          <p className="text-[12.5px] leading-relaxed text-red-700" role="alert">{zh ? '申请包没有读出来，所以这里先不动它。请重试。' : 'Your pack could not be read, so nothing is touched here. Please try again.'}</p>
          <button type="button" onClick={() => { setStep('loading'); void start() }} className="mt-2 rounded-lg border border-line-divider px-3 py-1.5 text-[12.5px] font-semibold text-body">{zh ? '重试' : 'Retry'}</button>
        </div>
      )}

      {step === 'pick' && (
        <div className="mt-3" data-testid="pack-fill-pick">
          <p className="text-[12.5px] leading-relaxed text-body-2">
            {zh ? '把工资单或在职信加进来（PDF 或照片）。我读出姓名、雇主、职位、入职日期和月收入，只填申请包里还空着的；你核对后才保存。' : 'Add a pay stub or an employment letter (a PDF or a photo). I read the name, employer, job title, start date and monthly income, and fill only what your pack still lacks; nothing is saved until you check it.'}
          </p>
          <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 w-full rounded-lg border-2 border-dashed border-line-divider bg-[#F8FAFC] px-4 py-5 text-center transition hover:border-brand" data-testid="pack-fill-choose">
            <span className="block text-[13.5px] font-bold text-ink">{zh ? '选择文件' : 'Choose files'}</span>
            <span className="mt-0.5 block text-[11.5px] text-body-3">{zh ? `PDF 或照片 · 最多 ${PACK_EXTRACT_MAX_FILES} 个 · 共 10MB` : `PDF or photos · up to ${PACK_EXTRACT_MAX_FILES} files · 10MB total`}</span>
          </button>
          <p className="mt-2.5 text-[12px] text-body-3">{zh ? '电话、现住址、租房历史、同住人和宠物、同意书，在租客护照页自己填。' : 'Phone, current address, rental history, occupants and pets, and the consent are yours to enter on the passport page.'}</p>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        aria-label={zh ? '选择工资单或在职信' : 'Choose a pay stub or an employment letter'}
        data-testid="pack-fill-file"
        onChange={(e) => { const list = Array.from(e.target.files ?? []).slice(0, PACK_EXTRACT_MAX_FILES); e.target.value = ''; if (list.length) void readFiles(list, profile) }}
      />

      {step === 'reading' && (
        <div className="py-7 text-center" data-testid="pack-fill-reading" role="status">
          <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-[#00ACE4] border-t-transparent" />
          <p className="mt-2.5 text-[12.5px] text-body-3">{zh ? '正在读这些文件…' : 'Reading the documents…'}</p>
        </div>
      )}

      {(step === 'form' || step === 'saving') && (
        <div className="mt-1" data-testid="pack-fill-form">
          {otherName && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800" data-testid="pack-fill-name">
              {zh ? `⚠ 文件上的姓名是「${otherName.doc}」，申请包里是「${otherName.pack}」。申请包里的姓名没有动；请确认这些文件是你本人的。` : `⚠ The documents are in the name “${otherName.doc}”; your pack says “${otherName.pack}”. The name in your pack is unchanged — please make sure the documents are yours.`}
            </p>
          )}
          {proposed.length > 0 ? (
            <>
              <p className="mt-2 text-[12px] leading-relaxed text-body-3">
                {zh ? '下面是申请包里还空着、文件上读到的几项。标「AI 读出」的请逐项核对——以你确认的为准。' : 'These are the fields your pack still lacks that the documents show. Check each one marked “AI read” — what you confirm is what counts.'}
              </p>
              <div data-testid="pack-fill-fields">
                {proposed.map((f) => (
                  <div key={f}>
                    <label htmlFor={`${fid}-${f}`} className={LABEL}>{label(f)}{tag(f)}</label>
                    {f === 'employment_status' ? (
                      <select id={`${fid}-${f}`} className={INPUT} value={values[f] ?? ''} disabled={step === 'saving'} onChange={(e) => set(f, e.target.value)} data-testid={`pack-fill-${f}`}>
                        <option value="">{zh ? '不填' : 'Leave blank'}</option>
                        {Object.entries(EMPLOYMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{zh ? v.zh : v.en}</option>)}
                      </select>
                    ) : (
                      <input id={`${fid}-${f}`} className={INPUT} value={values[f] ?? ''} disabled={step === 'saving'} onChange={(e) => set(f, e.target.value)} data-testid={`pack-fill-${f}`}
                        {...(f === 'employment_start_date' ? { type: 'date' } : f === 'monthly_income' ? { inputMode: 'numeric' as const } : f === 'employer_email' ? { type: 'email', autoComplete: 'off' } : f === 'employer_phone' ? { inputMode: 'tel' as const } : {})} />
                    )}
                    {f === 'monthly_income' && basis && read.includes(f) && <p className="mt-1 text-[11.5px] leading-relaxed text-body-3" data-testid="pack-fill-basis">{basis}</p>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-2 text-[12.5px] leading-relaxed text-body-2" data-testid="pack-fill-nothing">
              {readFailed
                ? (zh ? '这些文件我没有读出来。文件仍然可以存进申请包；资料请到租客护照页自己填。' : 'I could not read these documents. They can still go into the pack; please enter the details on the passport page.')
                : kept.length
                  ? (zh ? '文件上读到的几项，申请包里都已经填过了，所以没有可补的。' : 'Everything the documents show is already in your pack, so there is nothing to add.')
                  : (zh ? '这些文件上没有读到申请包要填的资料。' : 'The documents show none of the pack’s fields.')}
            </p>
          )}
          {kept.length > 0 && <p className="mt-2 text-[12px] leading-relaxed text-body-3" data-testid="pack-fill-kept">{zh ? '申请包里已经有、没有动的：' : 'Already in your pack and left as they are: '}{kept.map(label).join(zh ? '、' : ', ')}</p>}

          {rows.length > 0 && (
            <div className="mt-4" data-testid="pack-fill-files">
              <div className="text-[12px] font-semibold text-body-2">{zh ? '文件存进申请包' : 'Files for the pack'}</div>
              <ul className="mt-1.5 space-y-2">
                {rows.map((r, i) => {
                  const ok = acceptProfileFile(r.file).ok
                  return (
                    <li key={`${r.file.name}-${i}`} className={`rounded-lg border px-3 py-2 ${r.keep && !r.stored ? 'border-[#00ACE4] bg-[#F3FBFE]' : 'border-line-divider bg-white'}`} data-testid="pack-fill-file-row" data-keep={r.keep ? '1' : '0'}>
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input type="checkbox" checked={r.keep || !!r.stored} disabled={!ok || !!r.stored || step === 'saving'} onChange={() => setRows((a) => a.map((y, j) => (j === i ? { ...y, keep: !y.keep, error: undefined } : y)))} className="h-[18px] w-[18px] flex-none accent-[#00ACE4]" data-testid="pack-fill-keep" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{r.file.name}</span>
                        {r.stored && <span className="flex-none text-[11.5px] font-semibold text-[#047857]">{zh ? '已存' : 'Stored'}</span>}
                      </label>
                      {r.keep && !r.stored && (
                        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 pl-[28px]">
                          <select value={r.kind} disabled={step === 'saving'} onChange={(e) => setRows((a) => a.map((y, j) => (j === i ? { ...y, kind: e.target.value as ProfileFileKind } : y)))} aria-label={zh ? `${r.file.name} 的类别` : `Kind of ${r.file.name}`} className="min-w-0 rounded-md border border-line-divider bg-white px-2 py-1 text-[13px] text-ink" data-testid="pack-fill-kind">
                            {PROFILE_FILE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{zh ? k.label.zh : k.label.en}</option>)}
                          </select>
                          <input type="date" value={r.asOf} disabled={step === 'saving'} onChange={(e) => setRows((a) => a.map((y, j) => (j === i ? { ...y, asOf: e.target.value } : y)))} aria-label={zh ? `${r.file.name} 上的日期` : `Date on ${r.file.name}`} className="rounded-md border border-line-divider bg-white px-2 py-1 text-[13px] text-ink" data-testid="pack-fill-asof" />
                        </div>
                      )}
                      {!ok && <p className="mt-1 pl-[28px] text-[11.5px] text-body-3">{zh ? '这种文件申请包不收。' : 'The pack does not take this kind of file.'}</p>}
                      {r.error && <p className="mt-1 pl-[28px] text-[12px] text-red-700" role="alert" data-testid="pack-fill-file-error">{r.error}</p>}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <button type="button" onClick={() => void confirm()} disabled={step === 'saving' || nothing} className="mt-4 w-full rounded-lg py-2.5 text-[14px] font-bold text-white transition hover:brightness-95 disabled:opacity-50" style={{ background: '#00ACE4' }} data-testid="pack-fill-confirm">
            {step === 'saving' ? (zh ? '正在写…' : 'Writing…') : (zh ? '确认写进申请包' : 'Confirm & add to my pack')}
          </button>
          <p className="mt-2 text-center text-[11.5px] leading-relaxed text-body-3">
            {zh ? '确认之前什么都不会保存。写进去的仍是你的自述，不是核验结果；同意书要你自己在护照页勾选。' : 'Nothing is saved until you confirm. What is written stays self-declared, not verified; the consent is yours to tick on the passport page.'}
          </p>
        </div>
      )}

      {step === 'done' && done && (
        <div className="mt-3" data-testid="pack-fill-done">
          <div className="text-[13.5px] font-bold text-ink">
            {zh ? `✓ 已写进申请包：${done.fields.length} 项资料、${done.files} 份文件` : `✓ Added to your pack: ${done.fields.length} detail${done.fields.length === 1 ? '' : 's'}, ${done.files} file${done.files === 1 ? '' : 's'}`}
          </div>
          {done.fields.length > 0 && <p className="mt-1 text-[12.5px] leading-relaxed text-body-2">{done.fields.map(label).join(zh ? '、' : ', ')}</p>}
          <p className="mt-1.5 text-[12px] leading-relaxed text-body-3" data-testid="pack-fill-next">
            {done.consented
              ? (zh ? '其余几项（电话、现住址、租房历史、同住人和宠物）在租客护照页补上。申请房源时申请包会自动带入。' : 'The rest — phone, current address, rental history, occupants and pets — is on the passport page. The pack is carried into an application when you apply.')
              : (zh ? '同意书还没有勾选：到租客护照页自己勾选后，才能预览、导出，申请时自动带入。电话、现住址、租房历史等也在那里补。' : 'The consent is not ticked yet: tick it yourself on the passport page to preview, export, or have the pack carried into an application. Phone, address and rental history are entered there too.')}
          </p>
          <Link href="/tenant/passport" className="mt-3 inline-flex min-h-[40px] items-center rounded-lg px-4 text-[13.5px] font-bold text-white transition hover:brightness-95" style={{ background: '#00ACE4' }} data-testid="pack-fill-open">
            {zh ? '打开租客护照 →' : 'Open the passport →'}
          </Link>
        </div>
      )}
    </div>
  )
}
