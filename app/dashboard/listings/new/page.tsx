'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

export default function NewListingPage() {
  const router = useRouter()
  const { landlord, loading: authLoading } = useLandlord()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    address: '', unit: '', city: 'Toronto', province: 'ON',
    monthly_rent: '', bedrooms: '', bathrooms: '', available_date: '',
  })

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!landlord) return
    setSubmitting(true)
    setError(null)

    const baseSlug = slugify(`${form.address}-${form.unit || ''}-${form.city}`)
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`

    const { data, error: insertError } = await supabase
      .from('listings')
      .insert({
        landlord_id: landlord.landlordId,
        address: form.address,
        unit: form.unit || null,
        city: form.city,
        province: form.province,
        monthly_rent: parseInt(form.monthly_rent, 10),
        bedrooms: form.bedrooms ? parseInt(form.bedrooms, 10) : null,
        bathrooms: form.bathrooms ? parseFloat(form.bathrooms) : null,
        available_date: form.available_date || null,
        slug,
        is_active: true,
      })
      .select()
      .single()

    setSubmitting(false)
    if (insertError || !data) { setError(insertError?.message || 'Failed to create listing'); return }
    router.push(`/dashboard?created=${data.slug}`)
  }

  if (authLoading || !landlord) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen text-slate-100">
      <nav className="sticky top-0 z-20 backdrop-blur-xl bg-[#060814]/60 border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">S</div>
            <div className="text-base font-bold tracking-tight">Stayloop</div>
          </Link>
          <Link href="/dashboard" className="mono text-xs text-slate-400 hover:text-slate-200">← back to dashboard</Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mono text-xs text-cyan-400 mb-2">// NEW LISTING</div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Create a listing</h1>
        <p className="text-sm text-slate-400 mb-8">
          You&apos;ll get a unique application link to share with prospective tenants.
        </p>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-7 space-y-5">
          <div>
            <label className="label">Street address *</label>
            <input
              required
              type="text"
              value={form.address}
              onChange={e => update('address', e.target.value)}
              placeholder="123 Bloor St W"
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Unit (optional)</label>
              <input type="text" value={form.unit} onChange={e => update('unit', e.target.value)} placeholder="Suite 1502" className="input" />
            </div>
            <div>
              <label className="label">City *</label>
              <input required type="text" value={form.city} onChange={e => update('city', e.target.value)} className="input" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Monthly rent CAD *</label>
              <input required type="number" min="0" value={form.monthly_rent} onChange={e => update('monthly_rent', e.target.value)} placeholder="2800" className="input" />
            </div>
            <div>
              <label className="label">Bedrooms</label>
              <input type="number" min="0" value={form.bedrooms} onChange={e => update('bedrooms', e.target.value)} placeholder="2" className="input" />
            </div>
            <div>
              <label className="label">Bathrooms</label>
              <input type="number" min="0" step="0.5" value={form.bathrooms} onChange={e => update('bathrooms', e.target.value)} placeholder="1.5" className="input" />
            </div>
          </div>

          <div>
            <label className="label">Available from</label>
            <input type="date" value={form.available_date} onChange={e => update('available_date', e.target.value)} className="input" />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">{error}</div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/dashboard" className="btn-ghost">Cancel</Link>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Creating...' : 'Create listing →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
