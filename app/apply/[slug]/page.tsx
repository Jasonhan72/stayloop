'use client'

export const runtime = 'edge'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import type { ApplicationFile, FileKind } from '@/types'

const FILE_KINDS: { kind: FileKind; label: string; hint: string }[] = [
  { kind: 'id',                 label: '政府证件',     hint: '驾照、护照或 PR 卡' },
  { kind: 'paystub',            label: '近期工资单',   hint: '过去 2-3 个月 (PDF 或图片)' },
  { kind: 'bank_statement',     label: '银行对账单',   hint: '最新一份，能看到工资到账' },
  { kind: 'employment_letter',  label: '在职证明信',   hint: '可选 — 来自雇主' },
]
const MAX_BYTES = 10 * 1024 * 1024

export default function ApplyPage() {
  const params = useParams<{ slug: string }>()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [files, setFiles] = useState<Record<FileKind, File[]>>({
    id: [],
    paystub: [],
    bank_statement: [],
    employment_letter: [],
    other: [],
  })
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    date_of_birth: '', current_address: '',
    employment_status: 'Full-time employed', employer_name: '',
    job_title: '', monthly_income: '', employment_start_date: '',
    employer_phone: '', employer_email: '',
    prev_landlord_name: '', prev_landlord_phone: '',
    prev_address: '', prev_rent: '', prev_move_in: '', prev_move_out: '',
    reason_for_leaving: '',
    num_occupants: '1', has_pets: 'false', pet_details: '',
    is_smoker: 'false', move_in_date: '', additional_notes: '',
    consent_screening: false, consent_credit_check: false,
  })

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  function addFiles(kind: FileKind, fileList: FileList | null) {
    if (!fileList) return
    const incoming = Array.from(fileList)
    for (const f of incoming) {
      if (f.size > MAX_BYTES) {
        setError(`${f.name} 超过 10 MB。`)
        return
      }
    }
    setError(null)
    setFiles((prev) => ({ ...prev, [kind]: [...prev[kind], ...incoming] }))
  }
  function removeFile(kind: FileKind, idx: number) {
    setFiles((prev) => ({ ...prev, [kind]: prev[kind].filter((_, i) => i !== idx) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.consent_screening) {
      setError('请勾选授权同意以继续。')
      return
    }
    setError(null)
    setLoading(true)

    const { data: listing } = await supabase
      .from('listings')
      .select('id')
      .eq('slug', params.slug)
      .single()

    if (!listing) {
      setError('找不到对应房源。')
      setLoading(false)
      return
    }

    const { data: inserted, error: insertError } = await supabase
      .from('applications')
      .insert({
        listing_id: listing.id,
        ...form,
        full_name: `${form.first_name} ${form.last_name}`.trim(),
        monthly_income: parseInt(form.monthly_income) || null,
        prev_rent: parseInt(form.prev_rent) || null,
        num_occupants: parseInt(form.num_occupants) || 1,
        has_pets: form.has_pets === 'true',
        is_smoker: form.is_smoker === 'true',
        files: [],
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      setLoading(false)
      setError('提交失败,请稍后再试。')
      return
    }

    // Upload files
    const uploaded: ApplicationFile[] = []
    const allEntries: { kind: FileKind; file: File }[] = []
    ;(Object.keys(files) as FileKind[]).forEach((k) =>
      files[k].forEach((f) => allEntries.push({ kind: k, file: f }))
    )

    for (let i = 0; i < allEntries.length; i++) {
      const { kind, file } = allEntries[i]
      setUploadProgress(`正在上传 ${i + 1} / ${allEntries.length}: ${file.name}`)
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${inserted.id}/${kind}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage
        .from('tenant-files')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) {
        setLoading(false)
        setUploadProgress(null)
        setError(`${file.name} 上传失败: ${upErr.message}`)
        return
      }
      uploaded.push({
        kind,
        type: kind,
        path,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        uploaded_at: new Date().toISOString(),
      })
    }

    if (uploaded.length > 0) {
      await supabase.from('applications').update({ files: uploaded }).eq('id', inserted.id)
    }

    // Notify landlord (fire-and-forget)
    try {
      await fetch('/api/notify-landlord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: inserted.id }),
      })
    } catch (err) {
      console.warn('notify-landlord failed', err)
    }

    setUploadProgress(null)
    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <>
        <Header />
        <main className="bg-surface">
          <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-12">
            <div className="sl-card p-10 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-[28px] text-brand">
                ✓
              </span>
              <h2 className="mt-5 text-[24px] font-bold tracking-tight">申请已提交</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-body-2">
                房东会尽快审阅你的申请并联系你。我们也会通过 Luna 通知你进度。
              </p>
              <Link href="/listings" className="sl-btn-secondary mt-6 inline-flex">
                继续浏览房源
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-7">
          <div className="text-center">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              RENTAL APPLICATION · ENCRYPTED · PIPEDA
            </div>
            <h1 className="mt-3 text-[32px] font-extrabold tracking-tight sm:text-[40px]">
              提交申请
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-body-2">
              所有字段都加密存储 · 房东只看到你授权的内容 · Toronto / Ontario 合规
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            <Section tag="01" title="个人信息">
              <Grid>
                <Field label="名 *"><Input required value={form.first_name} onChange={(e: any) => set('first_name', e.target.value)} /></Field>
                <Field label="姓 *"><Input required value={form.last_name} onChange={(e: any) => set('last_name', e.target.value)} /></Field>
                <Field label="邮箱 *"><Input required type="email" value={form.email} onChange={(e: any) => set('email', e.target.value)} /></Field>
                <Field label="电话"><Input type="tel" value={form.phone} onChange={(e: any) => set('phone', e.target.value)} /></Field>
                <Field label="出生日期"><Input type="date" value={form.date_of_birth} onChange={(e: any) => set('date_of_birth', e.target.value)} /></Field>
              </Grid>
              <div className="mt-4">
                <Field label="现住地址">
                  <Input value={form.current_address} onChange={(e: any) => set('current_address', e.target.value)} />
                </Field>
              </div>
            </Section>

            <Section tag="02" title="工作 + 收入">
              <Grid>
                <Field label="状态">
                  <Select
                    value={form.employment_status}
                    onChange={(e: any) => set('employment_status', e.target.value)}
                    options={['Full-time employed', 'Part-time employed', 'Self-employed', 'Student', 'Retired', 'Other']}
                  />
                </Field>
                <Field label="雇主 *"><Input required value={form.employer_name} onChange={(e: any) => set('employer_name', e.target.value)} /></Field>
                <Field label="职位"><Input value={form.job_title} onChange={(e: any) => set('job_title', e.target.value)} /></Field>
                <Field label="月毛收入 (CAD) *"><Input required type="number" value={form.monthly_income} onChange={(e: any) => set('monthly_income', e.target.value)} /></Field>
                <Field label="入职日期"><Input type="date" value={form.employment_start_date} onChange={(e: any) => set('employment_start_date', e.target.value)} /></Field>
                <Field label="雇主电话"><Input type="tel" value={form.employer_phone} onChange={(e: any) => set('employer_phone', e.target.value)} /></Field>
              </Grid>
            </Section>

            <Section tag="03" title="租房历史">
              <Grid>
                <Field label="上家房东"><Input value={form.prev_landlord_name} onChange={(e: any) => set('prev_landlord_name', e.target.value)} /></Field>
                <Field label="上家电话"><Input type="tel" value={form.prev_landlord_phone} onChange={(e: any) => set('prev_landlord_phone', e.target.value)} /></Field>
                <Field label="上家月租 $"><Input type="number" value={form.prev_rent} onChange={(e: any) => set('prev_rent', e.target.value)} /></Field>
                <Field label="离开原因"><Input value={form.reason_for_leaving} onChange={(e: any) => set('reason_for_leaving', e.target.value)} /></Field>
              </Grid>
              <div className="mt-4">
                <Field label="上家地址"><Input value={form.prev_address} onChange={(e: any) => set('prev_address', e.target.value)} /></Field>
              </div>
            </Section>

            <Section tag="04" title="家庭">
              <Grid cols="grid-cols-2 sm:grid-cols-3">
                <Field label="入住人数"><Input type="number" min="1" value={form.num_occupants} onChange={(e: any) => set('num_occupants', e.target.value)} /></Field>
                <Field label="是否养宠物?"><Select value={form.has_pets} onChange={(e: any) => set('has_pets', e.target.value)} options={['false', 'true']} /></Field>
                <Field label="是否吸烟?"><Select value={form.is_smoker} onChange={(e: any) => set('is_smoker', e.target.value)} options={['false', 'true']} /></Field>
                <Field label="期望入住"><Input type="date" value={form.move_in_date} onChange={(e: any) => set('move_in_date', e.target.value)} /></Field>
              </Grid>
            </Section>

            <Section tag="05" title="证明文件 (建议上传)">
              <p className="mb-4 text-[12.5px] leading-relaxed text-body-2">
                上传文件可让房东用 AI 即时核验你的资料。PDF / JPG / PNG · 单个最大 10 MB。
              </p>
              <div className="space-y-3">
                {FILE_KINDS.map(({ kind, label, hint }) => (
                  <div key={kind} className="rounded-xl border border-line-divider bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[14px] font-bold">{label}</div>
                        <div className="font-mono text-[10.5px] text-body-3">{hint}</div>
                      </div>
                      <label className="cursor-pointer rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-brand hover:bg-brand/10">
                        + 添加
                        <input
                          type="file"
                          multiple
                          accept="application/pdf,image/png,image/jpeg,image/webp"
                          onChange={(e) => {
                            addFiles(kind, e.target.files)
                            e.target.value = ''
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {files[kind].length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {files[kind].map((f, i) => (
                          <li
                            key={i}
                            className="flex items-center justify-between rounded-md bg-surface-chip px-2 py-1 font-mono text-[12px]"
                          >
                            <span className="truncate pr-2">
                              {f.name}{' '}
                              <span className="text-body-3">· {(f.size / 1024).toFixed(0)} KB</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFile(kind, i)}
                              className="text-danger hover:underline"
                            >
                              移除
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <div className="rounded-2xl border border-warning/40 bg-warning/5 p-5 sm:p-6">
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-warning">
                CONSENT · PIPEDA
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
                提交即代表你授权房东和 Stayloop 核实信息、联系上家、查询 Ontario 公开法庭记录，以及（如勾选）拉取你的信用报告。
                数据保留 90 天后销毁，遵守 Ontario Human Rights Code。
              </p>
              <label className="mt-4 flex cursor-pointer items-start gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={form.consent_screening}
                  onChange={(e) => set('consent_screening', e.target.checked)}
                  className="mt-[3px] h-4 w-4 accent-brand"
                />
                <span>我同意上述授权并确认所有信息真实准确。 *</span>
              </label>
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={form.consent_credit_check}
                  onChange={(e) => set('consent_credit_check', e.target.checked)}
                  className="mt-[3px] h-4 w-4 accent-brand"
                />
                <span>我同意房东对我进行信用查询。</span>
              </label>
            </div>

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
                {error}
              </div>
            )}
            {uploadProgress && (
              <div className="rounded-lg border border-info/30 bg-info/10 px-4 py-3 font-mono text-[12px] text-info">
                {uploadProgress}
              </div>
            )}

            <button type="submit" disabled={loading} className="sl-btn-primary w-full !py-[16px] !text-[15px]">
              {loading ? (uploadProgress ? '上传中…' : '提交中…') : '提交申请 →'}
            </button>
          </form>
        </div>
      </main>
      <Footer />
    </>
  )
}

function Section({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  return (
    <section className="sl-card p-5 sm:p-7">
      <div className="mb-5 flex items-center gap-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
          // {tag}
        </span>
        <h2 className="text-[18px] font-bold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="sl-eyebrow">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Grid({ children, cols = 'grid-cols-1 sm:grid-cols-2' }: { children: React.ReactNode; cols?: string }) {
  return <div className={`grid gap-4 ${cols}`}>{children}</div>
}

function Input(props: any) {
  return <input {...props} className="sl-input" style={{ fontSize: 16 }} />
}

function Select({ value, onChange, options }: any) {
  return (
    <select value={value} onChange={onChange} className="sl-input" style={{ fontSize: 16 }}>
      {options.map((o: string) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}
