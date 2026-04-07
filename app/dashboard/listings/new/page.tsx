'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export default function NewListingPage() {
  const router = useRouter()
  const { landlord, loading: authLoading } = useLandlord()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    address: '',
    unit: '',
    city: 'Toronto',
    province: 'ON',
    monthly_rent: '',
    bedrooms: '',
    bathrooms: '',
    available_date: '',
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

    if (insertError || !data) {
      setError(insertError?.message || 'Failed to create listing')
      return
    }

    router.push(`/dashboard?created=${data.slug}`)
  }

  if (authLoading || !landlord) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">S</div>
          <span className="text-lg font-bold text-blue-600">Stayloop</span>
        </Link>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Back to dashboard</Link>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Create a new listing</h1>
        <p className="text-sm text-gray-500 mb-6">Once created, you&apos;ll get a unique application link to share with prospective tenants.</p>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Street address *</label>
            <input
              required
              type="text"
              value={form.address}
              onChange={e => update('address', e.target.value)}
              placeholder="123 Bloor St W"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit (optional)</label>
              <input
                type="text"
                value={form.unit}
                onChange={e => update('unit', e.target.value)}
                placeholder="Suite 1502"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input
                required
                type="text"
                value={form.city}
                onChange={e => update('city', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly rent (CAD) *</label>
              <input
                required
                type="number"
                min="0"
                value={form.monthly_rent}
                onChange={e => update('monthly_rent', e.target.value)}
                placeholder="2800"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
              <input
                type="number"
                min="0"
                value={form.bedrooms}
                onChange={e => update('bedrooms', e.target.value)}
                placeholder="2"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.bathrooms}
                onChange={e => update('bathrooms', e.target.value)}
                placeholder="1.5"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Available from</label>
            <input
              type="date"
              value={form.available_date}
              onChange={e => update('available_date', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/dashboard" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg"
            >
              {submitting ? 'Creating...' : 'Create listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
