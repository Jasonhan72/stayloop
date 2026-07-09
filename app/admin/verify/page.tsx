'use client'

// Stayloop back-office · listing verification queue.
// Access: members of admin_users only. The client-side gate is UX — the real
// enforcement is RLS (listings_admin_read / listings_admin_update policies).
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { VerificationBadge } from '@/components/ListingBadges'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'

type Row = {
  id: string
  slug: string | null
  address: string
  unit: string | null
  city: string | null
  neighborhood: string | null
  monthly_rent: number | null
  bedrooms: number | null
  property_type: string | null
  source: string | null
  verification_status: string | null
  images: string[] | null
  mls_number: string | null
  created_at: string
  landlord_id: string
}

export default function AdminVerifyPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const [adminRole, setAdminRole] = useState<string | null | 'loading'>('loading')
  const [rows, setRows] = useState<Row[]>([])
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setAdminRole(null); return }
    supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', auth.user.id)
      .maybeSingle()
      .then(({ data }) => setAdminRole(data?.role ?? null))
  }, [auth.loading, auth.user])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('listings')
      .select('id,slug,address,unit,city,neighborhood,monthly_rent,bedrooms,property_type,source,verification_status,images,mls_number,created_at,landlord_id')
      .order('created_at', { ascending: false })
      .limit(100)
    if (tab === 'pending') q = q.eq('verification_status', 'pending')
    const { data } = await q
    setRows((data || []) as Row[])
    setLoading(false)
  }, [tab])

  useEffect(() => {
    if (adminRole && adminRole !== 'loading') load()
  }, [adminRole, load])

  const decide = async (id: string, status: 'verified' | 'rejected') => {
    setBusy(id)
    const { error } = await supabase
      .from('listings')
      .update({ verification_status: status, verified_at: status === 'verified' ? new Date().toISOString() : null })
      .eq('id', id)
    if (!error) await load()
    setBusy(null)
  }

  if (auth.loading || adminRole === 'loading') {
    return (
      <Shell>
        <div className="flex min-h-[50vh] items-center justify-center text-body-3">{zh ? '加载中…' : 'Loading…'}</div>
      </Shell>
    )
  }

  if (!auth.user || !adminRole) {
    return (
      <Shell>
        <div className="mx-auto max-w-[520px] py-24 text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">STAYLOOP ADMIN</div>
          <h1 className="mt-3 text-[26px] font-extrabold tracking-tight">{zh ? '无访问权限' : 'No access'}</h1>
          <p className="mt-3 text-[14px] text-body-2">
            {!auth.user
              ? (zh ? '请先登录,并使用属于 Stayloop 管理组的账号。' : 'Sign in with a Stayloop admin-group account first.')
              : (zh ? '这个账号不在 Stayloop 后台管理组里。' : 'This account is not in the Stayloop admin group.')}
          </p>
          <Link href={auth.user ? '/' : '/login?redirect=/admin/verify'} className="sl-btn-primary mt-6">
            {auth.user ? (zh ? '返回首页' : 'Back home') : (zh ? '去登录' : 'Sign in')}
          </Link>
        </div>
      </Shell>
    )
  }

  const pendingCount = rows.filter((r) => r.verification_status === 'pending').length

  return (
    <Shell>
      <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7">
        <Link href="/admin" className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3 hover:text-brand">
          ← STAYLOOP ADMIN
        </Link>
        <div className="mt-2 font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
          {adminRole === 'superadmin' ? 'SUPERADMIN' : 'ADMIN'}
        </div>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-tight">{zh ? '房源验证' : 'Listing verification'}</h1>
        <p className="mt-2 text-[13.5px] text-body-2">
          {zh
            ? '房东发布的房源需人工验证后才公开展示并获得 VERIFIED 标;Realtor.ca 来源的房源无需验证即已上线(带来源标)。'
            : 'Landlord-published listings go public with a VERIFIED badge only after review; Realtor.ca-sourced listings are already live with a source badge.'}
        </p>

        <div className="mt-6 flex gap-2">
          {(['pending', 'all'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-4 py-2 text-[13px] font-bold transition ${
                tab === k ? 'bg-ink text-white' : 'border border-line-strong bg-white text-body-2'
              }`}
            >
              {k === 'pending' ? (zh ? `待审核${tab === 'pending' ? ` · ${rows.length}` : ''}` : 'Pending') : (zh ? '全部' : 'All')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-body-3">{zh ? '加载中…' : 'Loading…'}</div>
        ) : rows.length === 0 ? (
          <div className="sl-card mt-6 p-10 text-center text-[14px] text-body-3">
            {tab === 'pending' ? (zh ? '没有待审核的房源 🎉' : 'Queue is clear 🎉') : (zh ? '暂无房源' : 'No listings')}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="sl-card flex flex-wrap items-center gap-4 p-4">
                <div
                  className="h-16 w-24 flex-shrink-0 rounded-lg bg-surface-chip"
                  style={
                    Array.isArray(r.images) && r.images[0]
                      ? { backgroundImage: `url(${r.images[0]})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : undefined
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-bold">{r.address}{r.unit ? ` · ${r.unit}` : ''}</span>
                    <VerificationBadge listing={r} variant="admin-row" />
                    <span
                      className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white"
                      style={{ background: r.verification_status === 'verified' ? '#047857' : r.verification_status === 'rejected' ? '#DC2626' : '#A16207' }}
                    >
                      {(r.verification_status || 'pending').toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11.5px] text-body-3">
                    ${r.monthly_rent?.toLocaleString() ?? '—'}/mo · {r.bedrooms ?? '—'}B · {r.property_type || '—'} · {[r.neighborhood, r.city].filter(Boolean).join(', ')}
                    {r.mls_number ? ` · MLS ${r.mls_number}` : ''} · {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.slug && (
                    <Link href={`/listings/${r.slug}`} target="_blank" className="rounded-lg border border-line-strong bg-white px-3 py-2 text-[12.5px] font-semibold text-body-2 hover:border-brand hover:text-brand">
                      {zh ? '查看' : 'View'}
                    </Link>
                  )}
                  {r.verification_status !== 'verified' && (
                    <button
                      onClick={() => decide(r.id, 'verified')}
                      disabled={busy === r.id}
                      className="rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
                      style={{ background: '#047857' }}
                    >
                      {busy === r.id ? '…' : (zh ? '通过 ✓' : 'Approve ✓')}
                    </button>
                  )}
                  {r.verification_status !== 'rejected' && (
                    <button
                      onClick={() => decide(r.id, 'rejected')}
                      disabled={busy === r.id}
                      className="rounded-lg border px-4 py-2 text-[12.5px] font-bold disabled:opacity-50"
                      style={{ borderColor: '#DC2626', color: '#DC2626' }}
                    >
                      {busy === r.id ? '…' : (zh ? '驳回' : 'Reject')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-nav text-body">
      <Header />
      {children}
    </div>
  )
}
