'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ApplyPage() {
  const params = useParams<{ slug: string }>()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.consent_screening) { setError('Please provide consent to proceed.'); return }
    setError(null)
    setLoading(true)

    const { data: listing } = await supabase
      .from('listings')
      .select('id')
      .eq('slug', params.slug)
      .single()

    if (!listing) { setError('Listing not found.'); setLoading(false); return }

    const { error: insertError } = await supabase.from('applications').insert({
      listing_id: listing.id,
      ...form,
      monthly_income: parseInt(form.monthly_income) || null,
      prev_rent: parseInt(form.prev_rent) || null,
      num_occupants: parseInt(form.num_occupants) || 1,
      has_pets: form.has_pets === 'true',
      is_smoker: form.is_smoker === 'true',
    })

    setLoading(false)
    if (!insertError) setSubmitted(true)
    else setError('Error submitting application. Please try again.')
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-slate-100">
        <div className="glass rounded-2xl p-10 max-w-md text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 pointer-events-none" />
          <div className="relative">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-3xl">✓</div>
            <h2 className="text-2xl font-bold mb-2">Application submitted</h2>
            <p className="text-sm text-slate-400">The landlord will review your application and be in touch soon.</p>
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
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">S</div>
            <span className="text-base font-bold">Stayloop</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Rental application</h1>
          <p className="text-sm text-slate-400 mono">encrypted · pipeda compliant · ontario</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Section tag="// 01" title="Personal information">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name *"><Input required value={form.first_name} onChange={(e: any) => set('first_name', e.target.value)} /></Field>
              <Field label="Last name *"><Input required value={form.last_name} onChange={(e: any) => set('last_name', e.target.value)} /></Field>
              <Field label="Email *"><Input required type="email" value={form.email} onChange={(e: any) => set('email', e.target.value)} /></Field>
              <Field label="Phone"><Input type="tel" value={form.phone} onChange={(e: any) => set('phone', e.target.value)} /></Field>
              <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(e: any) => set('date_of_birth', e.target.value)} /></Field>
            </div>
            <div className="mt-4">
              <Field label="Current address"><Input value={form.current_address} onChange={(e: any) => set('current_address', e.target.value)} /></Field>
            </div>
          </Section>

          <Section tag="// 02" title="Employment & income">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Status">
                <Select value={form.employment_status} onChange={(e: any) => set('employment_status', e.target.value)}
                  options={['Full-time employed','Part-time employed','Self-employed','Student','Retired','Other']} />
              </Field>
              <Field label="Employer *"><Input required value={form.employer_name} onChange={(e: any) => set('employer_name', e.target.value)} /></Field>
              <Field label="Job title"><Input value={form.job_title} onChange={(e: any) => set('job_title', e.target.value)} /></Field>
              <Field label="Gross monthly income $ *"><Input required type="number" value={form.monthly_income} onChange={(e: any) => set('monthly_income', e.target.value)} /></Field>
              <Field label="Start date"><Input type="date" value={form.employment_start_date} onChange={(e: any) => set('employment_start_date', e.target.value)} /></Field>
              <Field label="Employer phone"><Input type="tel" value={form.employer_phone} onChange={(e: any) => set('employer_phone', e.target.value)} /></Field>
            </div>
          </Section>

          <Section tag="// 03" title="Rental history">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Previous landlord"><Input value={form.prev_landlord_name} onChange={(e: any) => set('prev_landlord_name', e.target.value)} /></Field>
              <Field label="Landlord phone"><Input type="tel" value={form.prev_landlord_phone} onChange={(e: any) => set('prev_landlord_phone', e.target.value)} /></Field>
              <Field label="Monthly rent paid $"><Input type="number" value={form.prev_rent} onChange={(e: any) => set('prev_rent', e.target.value)} /></Field>
              <Field label="Reason for leaving"><Input value={form.reason_for_leaving} onChange={(e: any) => set('reason_for_leaving', e.target.value)} /></Field>
            </div>
            <div className="mt-4">
              <Field label="Previous address"><Input value={form.prev_address} onChange={(e: any) => set('prev_address', e.target.value)} /></Field>
            </div>
          </Section>

          <Section tag="// 04" title="Household">
            <div className="grid grid-cols-3 gap-4">
              <Field label="Occupants"><Input type="number" min="1" value={form.num_occupants} onChange={(e: any) => set('num_occupants', e.target.value)} /></Field>
              <Field label="Pets?">
                <Select value={form.has_pets} onChange={(e: any) => set('has_pets', e.target.value)} options={['false','true']} />
              </Field>
              <Field label="Smoker?">
                <Select value={form.is_smoker} onChange={(e: any) => set('is_smoker', e.target.value)} options={['false','true']} />
              </Field>
              <Field label="Desired move-in"><Input type="date" value={form.move_in_date} onChange={(e: any) => set('move_in_date', e.target.value)} /></Field>
            </div>
          </Section>

          <div className="glass rounded-2xl p-6 border-amber-500/30">
            <div className="mono text-xs text-amber-400 mb-2">// CONSENT — PIPEDA</div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              By submitting, you authorize the landlord and Stayloop to verify your information, contact references, search publicly available LTB and Ontario court records, and obtain a credit report. Data retained 90 days then deleted. Compliant with the Ontario Human Rights Code.
            </p>
            <label className="flex items-start gap-2 mb-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.consent_screening} onChange={e => set('consent_screening', e.target.checked)} className="mt-1 accent-cyan-500" />
              <span>I agree to the above authorization and confirm all information is accurate. *</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.consent_credit_check} onChange={e => set('consent_credit_check', e.target.checked)} className="mt-1 accent-cyan-500" />
              <span>I consent to a credit check being performed on my behalf.</span>
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">{error}</div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full text-base py-3.5">
            {loading ? 'Submitting...' : 'Submit application →'}
          </button>
        </form>
      </div>
    </div>
  )
}
