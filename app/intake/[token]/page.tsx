'use client'


// /intake/[token] — an applicant hands their documents to a RECO agent for a
// landlord client's unit (V1.0 阶段 2 · 丙 #13, 2026-10-16). Public page, no
// account: the token is the credential. It shows the issuing agent the way
// O. Reg. 567/05 s.12.1 requires (registered name · descriptor · brokerage),
// says what the material is for, collects name / email / move-in + files, and
// takes the versioned authorisation (lib/agent/intakeLinks.ts) before anything
// is submitted. Uploads go straight to tenant-files/agent-intake/<link_id>/…
// (bucket policy: only while the link is live); the submission then goes to
// POST /api/agent-intake/<token>, which creates the agent's screening.
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { prepareUploads } from '@/lib/screening/prepareUpload'
import { RECO_REGISTER_URL } from '@/lib/agentProfile'
import { INTAKE_FILE_KINDS, INTAKE_MAX_FILES, agentIntakeConsentText, intakeFilePath, type IntakeFileKind, type IntakeManifestFile } from '@/lib/agent/intakeLinks'

type Peek = {
  state: 'ok' | 'revoked' | 'expired' | 'agent_not_live'
  link: { id: string; label: string | null; expires_at: string }
  agent: { legal_name: string; reco_number: string; brokerage_name: string; category: string; category_zh: string; category_en: string } | null
  consent_version: string
  personal_record_lookups: boolean
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-white"><Header variant="transparent" /><div className="mx-auto w-full max-w-[680px] flex-1 px-5 py-10">{children}</div><Footer /></div>
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function AgentIntakePage() {
  const params = useParams()
  const token = String(params?.token || '')
  const { lang } = useT()
  const zh = lang === 'zh'
  const [peek, setPeek] = useState<Peek | 'loading' | 'missing'>('loading')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [moveIn, setMoveIn] = useState('')
  const [files, setFiles] = useState<Record<IntakeFileKind, File[]>>(() => Object.fromEntries(INTAKE_FILE_KINDS.map((k) => [k.kind, [] as File[]])) as unknown as Record<IntakeFileKind, File[]>)
  const [agree, setAgree] = useState(false)
  const [signature, setSignature] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/agent-intake/${encodeURIComponent(token)}`, { cache: 'no-store' })
    if (res.status === 404) { setPeek('missing'); return }
    const j = (await res.json().catch(() => null)) as Peek | null
    setPeek(j && j.link ? j : 'missing')
  }, [token])
  useEffect(() => { if (token) void load() }, [token, load])

  const total = Object.values(files).reduce((n, arr) => n + arr.length, 0)
  function addFiles(kind: IntakeFileKind, list: FileList | null) {
    if (!list) return
    setFiles((prev) => ({ ...prev, [kind]: [...prev[kind], ...Array.from(list)] }))
  }
  function removeFile(kind: IntakeFileKind, idx: number) {
    setFiles((prev) => ({ ...prev, [kind]: prev[kind].filter((_, i) => i !== idx) }))
  }

  async function submit() {
    if (peek === 'loading' || peek === 'missing' || peek.state !== 'ok') return
    setErr(null)
    if (!name.trim()) { setErr(zh ? '请填写姓名。' : 'Please enter your name.'); return }
    if (!EMAIL_RE.test(email.trim())) { setErr(zh ? '邮箱格式不对。' : 'That email does not look right.'); return }
    if (total === 0) { setErr(zh ? '请至少上传一份材料。' : 'Please upload at least one document.'); return }
    if (total > INTAKE_MAX_FILES) { setErr(zh ? `最多 ${INTAKE_MAX_FILES} 个文件。` : `At most ${INTAKE_MAX_FILES} files.`); return }
    if (!agree || signature.trim().length < 2) { setErr(zh ? '请阅读授权内容、勾选同意并输入全名。' : 'Please read the authorisation, tick agree and type your full name.'); return }
    setBusy(true)
    const manifest: IntakeManifestFile[] = []
    let i = 0
    const entries = (Object.keys(files) as IntakeFileKind[]).flatMap((k) => files[k].map((f) => ({ kind: k, file: f })))
    for (const { kind, file: raw } of entries) {
      i += 1
      setProgress(zh ? `正在上传 ${i} / ${entries.length}：${raw.name}` : `Uploading ${i} / ${entries.length}: ${raw.name}`)
      // Same preparation as the screening and application uploads: big photos are downscaled, PDFs are not re-encoded.
      const prep = await prepareUploads([raw])
      if (!prep.accepted.length && prep.rejected[0]) {
        setBusy(false); setProgress(null)
        setErr(zh ? `${raw.name} 无法处理到 25 MB 以内，请换一份。` : `${raw.name} cannot be brought under 25 MB — please use a smaller file.`)
        return
      }
      const out = prep.accepted.length ? prep.accepted.map((a) => a.file) : [raw]
      for (const [n, file] of out.entries()) {
        const path = intakeFilePath(peek.link.id, kind, file.name, n)
        const { error: upErr } = await supabase.storage.from('tenant-files').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
        if (upErr) {
          setBusy(false); setProgress(null)
          setErr(zh ? `${file.name} 上传失败：${upErr.message}` : `${file.name} upload failed: ${upErr.message}`)
          return
        }
        manifest.push({ path, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', kind })
      }
    }
    setProgress(zh ? '正在提交…' : 'Submitting…')
    const res = await fetch(`/api/agent-intake/${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicant_name: name.trim(), applicant_email: email.trim(), move_in_date: moveIn || null, consent_version: peek.consent_version, consent_name: signature.trim(), files: manifest }),
    })
    const j = (await res.json().catch(() => ({}))) as { error?: string; files?: number }
    setBusy(false); setProgress(null)
    if (!res.ok) {
      const e = j.error || ''
      setErr(e === 'rate_limited' ? (zh ? '提交太频繁，请一小时后再试。' : 'Too many submissions — try again in an hour.')
        : e === 'expired' || e === 'revoked' || e === 'agent_not_live' ? (zh ? '这个链接已失效，请联系经纪重新发一条。' : 'This link is no longer valid; ask the agent for a new one.')
          : e === 'no_documents' ? (zh ? '没有收到任何文件，请重试上传。' : 'No files were received; please upload again.')
            : (zh ? `提交没有成功（${e || `HTTP ${res.status}`}）。` : `The submission did not go through (${e || `HTTP ${res.status}`}).`))
      return
    }
    setDone(j.files ?? manifest.length)
  }

  if (peek === 'loading') return <Shell><div className="py-20 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" /></div></Shell>
  if (peek === 'missing') return <Shell><div className="py-16 text-center"><h1 className="text-[20px] font-extrabold">{zh ? '链接无效' : 'This link is not valid'}</h1><p className="mt-2 text-[13px] text-body-3">{zh ? '请联系发给你链接的经纪。' : 'Please contact the agent who sent it to you.'}</p></div></Shell>
  const consent = agentIntakeConsentText(lang === 'zh' ? 'zh' : 'en', peek.personal_record_lookups)
  const agent = peek.agent
  const input = 'rounded-md border border-line-divider bg-white px-3 py-2 text-[14px] w-full'
  return (
    <Shell>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '租赁申请材料 · 经纪代收' : 'RENTAL APPLICATION DOCUMENTS · VIA YOUR AGENT'}</div>
      <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">{zh ? '把申请材料交给经纪' : 'Hand your application documents to the agent'}</h1>
      <div className="mt-4 rounded-2xl border border-line-divider bg-white p-5 text-[13.5px]" data-testid="intake-agent">
        {agent ? (
          <>
            <div className="font-bold">{agent.legal_name} <span className="font-normal text-body-2">· {zh ? agent.category_zh : agent.category_en}</span></div>
            <div className="text-[12.5px] text-body-2">{agent.brokerage_name} · RECO #{agent.reco_number}</div>
            <a className="text-[11.5px] text-body-3 underline" href={RECO_REGISTER_URL} target="_blank" rel="noopener noreferrer">{zh ? '在 RECO 公开注册库核对 ↗' : 'Check on the RECO public register ↗'}</a>
          </>
        ) : <div className="text-body-3">—</div>}
        {peek.link.label && <div className="mt-2 text-[12.5px]"><span className="font-mono text-[10.5px] font-bold uppercase text-body-3">{zh ? '房源 / 单元' : 'Unit'}</span> {peek.link.label}</div>}
        <p className="mt-3 text-[12.5px] leading-relaxed text-body-3">{zh ? '材料只用于这位经纪代表的房东做租赁申请评估；由经纪代表的房东本人决定录取与否。不向你收取任何费用。' : 'Your documents are used only so the landlord this agent represents can assess your rental application; the landlord decides. Nothing is charged to you.'}</p>
      </div>

      {peek.state !== 'ok' ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13.5px] text-amber-900" data-testid="intake-closed">{zh ? '这个链接已失效（已撤回、已过期或经纪注册状态变化）。请联系经纪重新发一条。' : 'This link is no longer valid (withdrawn, expired, or the agent’s registration changed). Ask the agent for a new one.'}</div>
      ) : done !== null ? (
        <div className="mt-4 rounded-xl border border-success/30 bg-success/5 p-4 text-[13.5px]" data-testid="intake-done">✓ {zh ? `已提交 ${done} 份材料。经纪会收到通知；录取与否由房东本人决定并通知你。按《消费者报告法》s.10(7)，收到不利决定后 60 天内你可索取评估所依据的信息性质与来源（privacy@stayloop.ai）。` : `${done} document(s) submitted. The agent has been notified; the landlord makes the decision and will let you know. Under the Consumer Reporting Act s.10(7) you may, within 60 days of an adverse decision, request the nature and sources of the information it was based on (privacy@stayloop.ai).`}</div>
      ) : (
        <form className="mt-5 space-y-5" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] text-body-3">{zh ? '姓名（与证件一致）*' : 'Full name (as on your ID) *'}<input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
            <label className="text-[12px] text-body-3">{zh ? '邮箱 *' : 'Email *'}<input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
            <label className="text-[12px] text-body-3">{zh ? '期望入住日' : 'Preferred move-in'}<input className={input} type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} /></label>
          </div>
          <div>
            <div className="text-[13px] font-bold">{zh ? '材料（身份 · 收入 · 租史）' : 'Documents (identity · income · rental history)'}</div>
            <p className="mt-0.5 text-[12px] text-body-3">{zh ? `单个文件 ≤ 25 MB（大照片会自动压缩）· 最多 ${INTAKE_MAX_FILES} 个。` : `Each file ≤ 25 MB (large photos are compressed) · at most ${INTAKE_MAX_FILES}.`}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {INTAKE_FILE_KINDS.map((k) => (
                <div key={k.kind} className="rounded-xl border border-line-divider p-3" data-testid={`intake-kind-${k.kind}`}>
                  <div className="text-[13px] font-semibold">{zh ? k.label.zh : k.label.en}</div>
                  <div className="text-[11.5px] text-body-3">{zh ? k.hint.zh : k.hint.en}</div>
                  <input type="file" multiple accept="application/pdf,image/*,.heic,.heif" className="mt-2 block w-full text-[12px]" aria-label={zh ? k.label.zh : k.label.en} onChange={(e) => { addFiles(k.kind, e.target.files); e.target.value = '' }} />
                  {files[k.kind].length > 0 && (
                    <ul className="mt-1.5 space-y-1 text-[12px]">
                      {files[k.kind].map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{f.name}</span><button type="button" onClick={() => removeFile(k.kind, i)} className="flex-none text-body-3 underline">{zh ? '移除' : 'Remove'}</button></li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-line-divider bg-surface-chip/40 p-5" data-testid="intake-consent" data-consent-version={peek.consent_version}>
            <div className="text-[14px] font-bold">{consent.title}</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-body-2">{consent.intro}</p>
            <dl className="mt-3 space-y-2">
              {consent.items.map((it) => <div key={it.h}><dt className="text-[12.5px] font-semibold">{it.h}</dt><dd className="text-[12.5px] leading-relaxed text-body-2">{it.p}</dd></div>)}
            </dl>
            <label className="mt-4 flex items-start gap-2 text-[13px]"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" /><span>{consent.ack}</span></label>
            <label className="mt-3 block text-[12px] text-body-3">{consent.typedNameLabel}<input className={input} value={signature} onChange={(e) => setSignature(e.target.value)} autoComplete="off" /></label>
            <p className="mt-2 font-mono text-[10.5px] text-body-3">{zh ? '授权文本版本' : 'Authorisation version'} {peek.consent_version}</p>
          </div>
          {err && <p role="alert" className="text-[12.5px] text-danger">⚠ {err}</p>}
          {progress && <p className="text-[12.5px] text-body-3">{progress}</p>}
          <button type="submit" disabled={busy} className="sl-btn-primary disabled:opacity-50" data-testid="intake-submit">{busy ? '…' : consent.button}</button>
        </form>
      )}
    </Shell>
  )
}
