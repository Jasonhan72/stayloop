'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ApplyPage() {
  const params = useParams<{ slug: string }>()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
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
    if (!form.consent_screening) return alert('Please provide consent to proceed.')
    setLoading(true)

    // Find listing by slug
    const { data: listing } = await supabase
      .from('listings')
      .select('id')
      .eq('slug', params.slug)
      .single()

    if (!listing) {
      alert('Listing not found.')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('applications').insert({
      listing_id: listing.id,
      ...form,
      monthly_income: parseInt(form.monthly_income) || null,
      prev_rent: parseInt(form.prev_rent) || null,
      num_occupants: parseInt(form.num_occupants) || 1,
      has_pets: form.has_pets === 'true',
      is_smoker: form.is_smoker === 'true',
    })

    setLoading(false)
    if (!error) setSubmitted(true)
    else alert('Error submitting application. Please try again.')
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 max-w-md text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-green-600 mb-2">Application Submitted!</h2>
          <p className="text-gray-500">Your application has been received. The landlord will be in touch shortly.</p>
        </div>
      </div>
    )
  }

  const Field = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )

  const Input = (props: any) => (
    <input {...props} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
  )

  const Select = ({ value, onChange, options }: any) => (
    <select value={value} onChange={onChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      {options.map((o: string) => <option key={o}>{o}</option>)}
    </select>
  )

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-2xl p-6 text-white">
          <h1 className="text-2xl font-bold mb-1">Rental Application</h1>
          <p className="opacity-80 text-sm">Powered by Stayloop · Your data is encrypted and secure</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-b-2xl border border-t-0 border-gray-200 p-6 space-y-8">

          {/* Personal */}
          <section>
            <h2 className="text-blue-600 font-bold mb-4 pb-2 border-b border-gray-100">Personal Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name *"><Input required value={form.first_name} onChange={(e: any) => set('first_name', e.target.value)} /></Field>
              <Field label="Last Name *"><Input required value={form.last_name} onChange={(e: any) => set('last_name', e.target.value)} /></Field>
              <Field label="Email *"><Input required type="email" value={form.email} onChange={(e: any) => set('email', e.target.value)} /></Field>
              <Field label="Phone"><Input type="tel" value={form.phone} onChange={(e: any) => set('phone', e.target.value)} /></Field>
              <Field label="Date of Birth"><Input type="date" value={form.date_of_birth} onChange={(e: any) => set('date_of_birth', e.target.value)} /></Field>
            </div>
            <div className="mt-4">
              <Field label="Current Address"><Input value={form.current_address} onChange={(e: any) => set('current_address', e.target.value)} /></Field>
            </div>
          </section>

          {/* Employment */}
          <section>
            <h2 className="text-blue-600 font-bold mb-4 pb-2 border-b border-gray-100">Employment & Income</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Employment Status">
                <Select value={form.employment_status} onChange={(e: any) => set('employment_status', e.target.value)}
                  options={['Full-time employed','Part-time employed','Self-employed','Student','Retired','Other']} />
              </Field>
              <Field label="Employer / Company *"><Input required value={form.employer_name} onChange={(e: any) => set('employer_name', e.target.value)} /></Field>
              <Field label="Job Title"><Input value={form.job_title} onChange={(e: any) => set('job_title', e.target.value)} /></Field>
              <Field label="Gross Monthly Income ($) *"><Input required type="number" value={form.monthly_income} onChange={(e: any) => set('monthly_income', e.target.value)} /></Field>
              <Field label="Start Date"><Input type="date" value={form.employment_start_date} onChange={(e: any) => set('employment_start_date', e.target.value)} /></Field>
              <Field label="Employer Phone"><Input type="tel" value={form.employer_phone} onChange={(e: any) => set('employer_phone', e.target.value)} /></Field>
            </div>
          </section>

          {/* Rental History */}
          <section>
            <h2 className="text-blue-600 font-bold mb-4 pb-2 border-b border-gray-100">Rental History</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Previous Landlord Name"><Input value={form.prev_landlord_name} onChange={(e: any) => set('prev_landlord_name', e.target.value)} /></Field>
              <Field label="Previous Landlord Phone"><Input type="tel" value={form.prev_landlord_phone} onChange={(e: any) => set('prev_landlord_phone', e.target.value)} /></Field>
              <Field label="Monthly Rent Paid ($)"><Input type="number" value={form.prev_rent} onChange={(e: any) => set('prev_rent', e.target.value)} /></Field>
              <Field label="Reason for Leaving"><Input value={form.reason_for_leaving} onChange={(e: any) => set('reason_for_leaving', e.target.value)} /></Field>
            </div>
            <div className="mt-4">
              <Field label="Previous Address"><Input value={form.prev_address} onChange={(e: any) => set('prev_address', e.target.value)} /></Field>
            </div>
          </section>

          {/* Household */}
          <section>
            <h2 className="text-blue-600 font-bold mb-4 pb-2 border-b border-gray-100">Household Details</h2>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Number of Occupants"><Input type="number" min="1" value={form.num_occupants} onChange={(e: any) => set('num_occupants', e.target.value)} /></Field>
              <Field label="Pets?">
                <Select value={form.has_pets} onChange={(e: any) => set('has_pets', e.target.value)} options={['false','true']} />
              </Field>
              <Field label="Smoker?">
                <Select value={form.is_smoker} onChange={(e: any) => set('is_smoker', e.target.value)} options={['false','true']} />
              </Field>
              <Field label="Desired Move-in Date"><Input type="date" value={form.move_in_date} onChange={(e: any) => set('move_in_date', e.target.value)} /></Field>
            </div>
          </section>

          {/* Consent */}
          <section className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="font-bold text-amber-800 mb-2">⚖️ Authorization & Consent (PIPEDA)</h3>
            <p className="text-xs text-gray-600 mb-3">By submitting, you authorize the landlord and Stayloop to verify your information, contact references, search publicly available LTB/Ontario court records, and obtain a credit report. Data retained 90 days then deleted. Compliant with the Ontario Human Rights Code.</p>
            <label className="flex items-start gap-2 mb-2 cursor-pointer">
              <input type="checkbox" checked={form.consent_screening} onChange={e => set('consent_screening', e.target.checked)} className="mt-1 accent-blue-600" />
              <span className="text-sm">I agree to the above authorization and confirm all information is accurate. *</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={form.consent_credit_check} onChange={e => set('consent_credit_check', e.target.checked)} className="mt-1 accent-blue-600" />
              <span className="text-sm">I consent to a credit check being performed on my behalf.</span>
            </label>
          </section>

          <button type="submit" disabled={loading}
            className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-base hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  )
}
