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
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card-hero fade-up" style={{ padding: 40, maxWidth: 440, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 18px', borderRadius: 16, background: 'rgba(16, 185, 129, 0.14)', border: '1px solid rgba(16, 185, 129, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34D399', fontSize: 28 }}>✓</div>
          <h2 className="h-section" style={{ marginBottom: 8 }}>{t('apply.submitted.title')}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{t('apply.submitted.sub')}</p>
        </div>
      </div>
    )
  }

  const Section = ({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) => (
    <section className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div className="chip chip-accent mono" style={{ fontSize: 10 }}>{tag}</div>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
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
    <div className="min-h-screen">
      <nav className="nav-bar">
        <div className="nav-brand">
          <div className="nav-logo">S</div>
          <div className="nav-title">Stayloop</div>
        </div>
        <div className="nav-actions"><LanguageToggle /></div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10 fade-up">
        <div className="text-center" style={{ marginBottom: 32 }}>
          <div className="chip chip-accent mono mb-4">{t('apply.tagline')}</div>
          <h1 className="h-hero" style={{ marginBottom: 8 }}>{t('apply.title')}</h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {FILE_KINDS.map(({ kind, labelKey, hintKey }) => (
                <div key={kind} style={{ borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'rgba(148, 163, 184, 0.04)', padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{t(labelKey)}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{t(hintKey)}</div>
                    </div>
                    <label className="mono" style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(20, 184, 166, 0.3)', background: 'rgba(20, 184, 166, 0.1)', color: '#5EEAD4', cursor: 'pointer' }}>
                      + {t('apply.addFile')}
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
                    <ul style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, listStyle: 'none', padding: 0 }}>
                      {files[kind].map((f, i) => (
                        <li key={i} className="mono" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '6px 10px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name} <span style={{ color: 'var(--text-faint)' }}>· {(f.size / 1024).toFixed(0)} KB</span></span>
                          <button type="button" onClick={() => removeFile(kind, i)} style={{ color: '#F87171', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>{t('apply.remove')}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <div className="card" style={{ padding: 24, borderColor: 'rgba(251, 191, 36, 0.28)' }}>
            <div className="chip mono mb-3" style={{ background: 'rgba(251, 191, 36, 0.1)', borderColor: 'rgba(251, 191, 36, 0.3)', color: '#FCD34D', fontSize: 10 }}>{t('apply.consent.tag')}</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.65 }}>
              {t('apply.consent.body')}
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={form.consent_screening} onChange={e => set('consent_screening', e.target.checked)} style={{ marginTop: 3, accentColor: '#14B8A6' }} />
              <span>{t('apply.consent.check1')}</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={form.consent_credit_check} onChange={e => set('consent_credit_check', e.target.checked)} style={{ marginTop: 3, accentColor: '#14B8A6' }} />
              <span>{t('apply.consent.check2')}</span>
            </label>
          </div>

          {error && (
            <div style={{ borderRadius: 10, border: '1px solid rgba(244, 63, 94, 0.35)', background: 'rgba(244, 63, 94, 0.08)', color: '#FDA4AF', fontSize: 13, padding: '10px 14px' }}>{error}</div>
          )}

          {uploadProgress && (
            <div className="mono" style={{ borderRadius: 10, border: '1px solid rgba(34, 211, 238, 0.3)', background: 'rgba(34, 211, 238, 0.08)', color: '#67E8F9', fontSize: 11, padding: '10px 14px' }}>{uploadProgress}</div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary btn-lg" style={{ width: '100%' }}>
            {loading ? (uploadProgress ? t('apply.uploading') : t('apply.submitting')) : t('apply.submit') + ' →'}
          </button>
        </form>
      </div>
    </div>
  )
}
