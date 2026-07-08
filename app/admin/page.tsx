'use client'

// Stayloop back-office console — the single admin entry point.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useAdmin } from '@/lib/useAdmin'
import { useT } from '@/lib/i18n'

export default function AdminHomePage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const { loading, role } = useAdmin()
  const [pending, setPending] = useState<number | null>(null)
  const [members, setMembers] = useState<number | null>(null)

  useEffect(() => {
    if (!role) return
    supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'pending')
      .then(({ count }) => setPending(count ?? 0))
    supabase.rpc('admin_list_members').then(({ data }) => setMembers(Array.isArray(data) ? data.length : null))
  }, [role])

  if (auth.loading || loading) {
    return <Shell><div className="flex min-h-[50vh] items-center justify-center text-body-3">{zh ? '加载中…' : 'Loading…'}</div></Shell>
  }

  if (!auth.user || !role) {
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
          <Link href={auth.user ? '/' : '/login?redirect=/admin'} className="sl-btn-primary mt-6">
            {auth.user ? (zh ? '返回首页' : 'Back home') : (zh ? '去登录' : 'Sign in')}
          </Link>
        </div>
      </Shell>
    )
  }

  const cards = [
    {
      href: '/admin/verify',
      icon: '🏠',
      title: zh ? '房源验证' : 'Listing verification',
      desc: zh ? '审核房东发布的房源:通过后公开并打 VERIFIED 标。' : 'Review landlord listings — approved ones go public with a VERIFIED badge.',
      stat: pending == null ? '…' : zh ? `${pending} 条待审` : `${pending} pending`,
      hot: (pending ?? 0) > 0,
    },
    {
      href: '/admin/users',
      icon: '👥',
      title: zh ? '用户与权限' : 'Users & permissions',
      desc: zh ? '管理后台管理组成员:添加、移除、调整 admin / superadmin 角色。' : 'Manage the admin group — add or remove members, set admin / superadmin roles.',
      stat: members == null ? '…' : zh ? `${members} 位成员` : `${members} members`,
      hot: false,
    },
  ]

  return (
    <Shell>
      <div className="mx-auto max-w-[1000px] px-5 py-10 sm:px-7">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
          STAYLOOP ADMIN · {role === 'superadmin' ? 'SUPERADMIN' : 'ADMIN'}
        </div>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-tight">{zh ? '后台管理' : 'Back office'}</h1>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="sl-card group p-6 transition hover:shadow-card">
              <div className="flex items-start justify-between">
                <span className="text-[26px]">{c.icon}</span>
                <span
                  className="rounded-md px-2 py-1 font-mono text-[10.5px] font-bold"
                  style={c.hot ? { background: 'rgba(180,83,9,0.12)', color: '#B45309' } : { background: 'rgba(4,120,87,0.08)', color: '#047857' }}
                >
                  {c.stat}
                </span>
              </div>
              <h2 className="mt-4 text-[18px] font-extrabold tracking-tight group-hover:text-brand">{c.title} →</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">{c.desc}</p>
            </Link>
          ))}
        </div>
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
