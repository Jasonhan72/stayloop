'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useT, LanguageToggle, type DictKey } from '@/lib/i18n'
import type { ApplicationFile } from '@/types'

type FileKind = ApplicationFile['kind']
const FILE_KINDS: { kind: FileKind; labelKey: DictKey; hintKey: DictKey }[] = [
  { kind: 'id', labelKey: 'apply.filekind.id.label', hintKey: 'apply.filekind.id.hint' },
  { kind: 'paystub', labelKey: 'apply.filekind.paystub.label', hintKey: 'apply.filekind.paystub.hint' },
  { kind: 'bank_statement', labelKey: 'apply.filekind.bank.label', hintKey: 'apply.filekind.bank.hint' },
  { kind: 'employment_letter', labelKey: 'apply.filekind.employment.label', hintKey: 'apply.filekind.employment.hint' },
]
const MAX_BYTES = 10 * 1024 * 1024

export default function ApplyPage() {
  const { t } = useT()
  const params = useParams<{ slug: string }>()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [files, setFiles] = useState<Record<FileKind, File[]>>({
    id: [], paystub: [], bank_statement: [], employment_letter: [], other: [],
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

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  function addFiles(kind: FileKind, fileList: FileList | null) {
    if (!fileList) return
    const incoming = Array.from(fileList)
    for (const f of incoming) {
      if (f.size > MAX_BYTES) { setError(t('apply.fileTooBig', { name: f.name })); return }
    }
    setError(null)
    setFiles(prev => ({ ...prev, [kind]: [...prev[kind], ...incoming] }))
  }
  function removeFile(kind: FileKind, idx: number) {
    setFiles(prev => ({ ...prev, [kind]: prev[kind].filter((_, i) => i !== idx) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.consent_screening) { setError(t('apply.consentRequired')); return }
    setError(null)
    setLoading(true)

    const { data: listing } = await supabase
      .from('listings')
      .select('id')
      .eq('slug', params.slug)
      .single()

    if (!listing) { setError(t('apply.listingNotFound')); setLoading(false); return }

    const { data: inserted, error: insertError } = await supabase
      .from('applications')
      .insert({
        listing_id: listing.id,
        ...form,
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
      setError(t('apply.submitError'))
      return
    }

    const uploaded: ApplicationFile[] = []
    const allEntries: { kind: FileKind; file: File }[] = []
    ;(Object.keys(files) as FileKind[]).forEach(k => files[k].forEach(f => allEntries.push({ kind: k, file: f })))

    for (let i = 0; i < allEntries.length; i++) {
      const { kind, file } = allEntries[i]
      setUploadProgress(t('apply.uploadProgress', { i: i + 1, n: allEntries.length, name: file.name }))
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${inserted.id}/${kind}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage
        .from('tenant-files')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) {
        setLoading(false)
        setUploadProgress(null)
        setError(t('apply.uploadFailed', { name: file.name, err: upErr.message }))
        return
      }
      uploaded.push({
        kind, path, name: file.name, size: file.size, mime: file.type || 'application/octet-stream',
      })
    }

    if (uploaded.length > 0) {
      await supabase
        .from('applications')
        .update({ files: uploaded })
        .eq('id', inserted.id)
    }

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
      <div className="min-h-screen flex items-center justify-center p-6 text-slate-100">
        <div className="glass rounded-2xl p-10 max-w-md text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 pointer-events-none" />
          <div className="relative">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-3xl">✓</div>
            <h2 className="text-2xl font-bold mb-2">{t('apply.submitted.title')}</h2>
            <p className="text-sm text-slate-400">{t('apply.submitted.sub')}</p>
          </div>
        </div>
      </div>
    )
  }

  const Section = ({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) => (
    <section className="glass rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="mono text-xs text-cyan-400">{tag}</div>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )

  const Input = (props: any) => <input {...props} className="input" />
  const Select = ({ value, onChange, options }: any) => (
    <select value={value} onChange={onChange} className="input">
      {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <div className="min-h-screen py-10 px-4 text-slate-100">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-end mb-4">
          <LanguageToggle />
        </div>
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">S</div>
            <span className="text-base font-bold">Stayloop</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{t('apply.title')}</h1>
          <p className="text-sm text-slate-400 mono">{t('apply.tagline')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Section tag="// 01" title={t('apply.sec.personal')}>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('apply.f.firstName')}><Input required value={form.first_name} onChange={(e: any) => set('first_name', e.target.value)} /></Field>
              <Field label={t('apply.f.lastName')}><Input required value={form.last_name} onChange={(e: any) => set('last_name', e.target.value)} /></Field>
              <Field label={t('apply.f.email')}><Input required type="email" value={form.email} onChange={(e: any) => set('email', e.target.value)} /></Field>
              <Field label={t('apply.f.phone')}><Input type="tel" value={form.phone} onChange={(e: any) => set('phone', e.target.value)} /></Field>
              <Field label={t('apply.f.dob')}><Input type="date" value={form.date_of_birth} onChange={(e: any) => set('date_of_birth', e.target.value)} /></Field>
            </div>
            <div className="mt-4">
              <Field label={t('apply.f.currentAddress')}><Input value={form.current_address} onChange={(e: any) => set('current_address', e.target.value)} /></Field>
            </div>
          </Section>

          <Section tag="// 02" title={t('apply.sec.employment')}>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('apply.f.status')}>
                <Select value={form.employment_status} onChange={(e: any) => set('employment_status', e.target.value)}
                  options={['Full-time employed','Part-time employed','Self-employed','Student','Retired','Other']} />
              </Field>
              <Field label={t('apply.f.employer')}><Input required value={form.employer_name} onChange={(e: any) => set('employer_name', e.target.value)} /></Field>
              <Field label={t('apply.f.jobTitle')}><Input value={form.job_title} onChange={(e: any) => set('job_title', e.target.value)} /></Field>
              <Field label={t('apply.f.monthlyIncome')}><Input required type="number" value={form.monthly_income} onChange={(e: any) => set('monthly_income', e.target.value)} /></Field>
              <Field label={t('apply.f.startDate')}><Input type="date" value={form.employment_start_date} onChange={(e: any) => set('employment_start_date', e.target.value)} /></Field>
              <Field label={t('apply.f.employerPhone')}><Input type="tel" value={form.employer_phone} onChange={(e: any) => set('employer_phone', e.target.value)} /></Field>
            </div>
          </Section>

          <Section tag="// 03" title={t('apply.sec.rental')}>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('apply.f.prevLandlord')}><Input value={form.prev_landlord_name} onChange={(e: any) => set('prev_landlord_name', e.target.value)} /></Field>
              <Field label={t('apply.f.landlordPhone')}><Input type="tel" value={form.prev_landlord_phone} onChange={(e: any) => set('prev_landlord_phone', e.target.value)} /></Field>
              <Field label={t('apply.f.prevRent')}><Input type="number" value={form.prev_rent} onChange={(e: any) => set('prev_rent', e.target.value)} /></Field>
              <Field label={t('apply.f.reasonLeaving')}><Input value={form.reason_for_leaving} onChange={(e: any) => set('reason_for_leaving', e.target.value)} /></Field>
            </div>
            <div className="mt-4">
              <Field label={t('apply.f.prevAddress')}><Input value={form.prev_address} onChange={(e: any) => set('prev_address', e.target.value)} /></Field>
            </div>
          </Section>

          <Section tag="// 04" title={t('apply.sec.household')}>
            <div className="grid grid-cols-3 gap-4">
              <Field label={t('apply.f.occupants')}><Input type="number" min="1" value={form.num_occupants} onChange={(e: any) => set('num_occupants', e.target.value)} /></Field>
              <Field label={t('apply.f.pets')}>
                <Select value={form.has_pets} onChange={(e: any) => set('has_pets', e.target.value)} options={['false','true']} />
              </Field>
              <Field label={t('apply.f.smoker')}>
                <Select value={form.is_smoker} onChange={(e: any) => set('is_smoker', e.target.value)} options={['false','true']} />
              </Field>
              <Field label={t('apply.f.moveIn')}><Input type="date" value={form.move_in_date} onChange={(e: any) => set('move_in_date', e.target.value)} /></Field>
            </div>
          </Section>

          <Section tag="// 05" title={t('apply.sec.docs')}>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              {t('apply.docs.intro')}
            </p>
            <div className="space-y-4">
              {FILE_KINDS.map(({ kind, labelKey, hintKey }) => (
                <div key={kind} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <div className="text-sm font-medium text-slate-100">{t(labelKey)}</div>
                      <div className="mono text-[10px] text-slate-500">{t(hintKey)}</div>
                    </div>
                    <label className="text-xs px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 cursor-pointer hover:bg-cyan-500/15 mono">
                      {t('apply.addFile')}
                      <input
                        type="file"
                        multiple
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        onChange={e => { addFiles(kind, e.target.files); e.target.value = '' }}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {files[kind].length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {files[kind].map((f, i) => (
                        <li key={i} className="flex items-center justify-between text-xs mono text-slate-300 bg-black/30 rounded-md px-2 py-1">
                          <span className="truncate pr-2">{f.name} <span className="text-slate-500">· {(f.size / 1024).toFixed(0)} KB</span></span>
                          <button type="button" onClick={() => removeFile(kind, i)} className="text-red-400 hover:text-red-300">{t('apply.remove')}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <div className="glass rounded-2xl p-6 border-amber-500/30">
            <div className="mono text-xs text-amber-400 mb-2">{t('apply.consent.tag')}</div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              {t('apply.consent.body')}
            </p>
            <label className="flex items-start gap-2 mb-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.consent_screening} onChange={e => set('consent_screening', e.target.checked)} className="mt-1 accent-cyan-500" />
              <span>{t('apply.consent.check1')}</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.consent_credit_check} onChange={e => set('consent_credit_check', e.target.checked)} className="mt-1 accent-cyan-500" />
              <span>{t('apply.consent.check2')}</span>
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">{error}</div>
          )}

          {uploadProgress && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-xs px-3 py-2 mono">{uploadProgress}</div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full text-base py-3.5">
            {loading ? (uploadProgress ? t('apply.uploading') : t('apply.submitting')) : t('apply.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
