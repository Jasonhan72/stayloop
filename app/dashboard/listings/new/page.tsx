'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT, LanguageToggle } from '@/lib/i18n'
import AppHeader from '@/components/AppHeader'

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

export default function NewListingPage() {
  const { t } = useT()
  const router = useRouter()
  const { user: landlord, loading: authLoading } = useUser({ redirectIfMissing: true })
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
        landlord_id: landlord.profileId,
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
    if (insertError || !data) { setError(insertError?.message || t('newListing.failed')); return }
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
    <div className="min-h-screen">
      <AppHeader
        back="/dashboard"
        title="New listing"
        titleZh="新建房源"
      />

      <div className="max-w-2xl mx-auto px-6 py-12 fade-up">
        <div className="chip chip-accent mono mb-4">{t('newListing.tag')}</div>
        <h1 className="h-hero mb-2">{t('newListing.title')}</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
          {t('newListing.sub')}
        </p>

        <form onSubmit={handleSubmit} className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label className="label">{t('newListing.street')}</label>
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
              <label className="label">{t('newListing.unit')}</label>
              <input type="text" value={form.unit} onChange={e => update('unit', e.target.value)} placeholder="Suite 1502" className="input" />
            </div>
            <div>
              <label className="label">{t('newListing.city')}</label>
              <input required type="text" value={form.city} onChange={e => update('city', e.target.value)} className="input" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">{t('newListing.rent')}</label>
              <input required type="number" min="0" value={form.monthly_rent} onChange={e => update('monthly_rent', e.target.value)} placeholder="2800" className="input" />
            </div>
            <div>
              <label className="label">{t('newListing.bedrooms')}</label>
              <input type="number" min="0" value={form.bedrooms} onChange={e => update('bedrooms', e.target.value)} placeholder="2" className="input" />
            </div>
            <div>
              <label className="label">{t('newListing.bathrooms')}</label>
              <input type="number" min="0" step="0.5" value={form.bathrooms} onChange={e => update('bathrooms', e.target.value)} placeholder="1.5" className="input" />
            </div>
          </div>

          <div>
            <label className="label">{t('newListing.availableFrom')}</label>
            <input type="date" value={form.available_date} onChange={e => update('available_date', e.target.value)} className="input" />
          </div>

          {error && (
            <div style={{ borderRadius: 10, border: '1px solid rgba(244, 63, 94, 0.35)', background: 'rgba(244, 63, 94, 0.08)', color: '#FDA4AF', fontSize: 13, padding: '10px 14px' }}>{error}</div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 6 }}>
            <Link href="/dashboard" className="btn btn-ghost">{t('newListing.cancel')}</Link>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? t('newListing.creating') : t('newListing.create') + ' →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
