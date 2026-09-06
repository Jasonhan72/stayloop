'use client'

// Stayloop back-office · admin group management.
// Admins can view members; only superadmins can add/remove/change roles —
// enforced server-side by the admin_* SECURITY DEFINER RPCs.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useAdmin } from '@/lib/useAdmin'
import { useT } from '@/lib/i18n'

type Member = { user_id: string; email: string; role: 'admin' | 'superadmin'; note: string | null; created_at: string }
type RosterRow = {
  user_id: string; email: string | null; is_anonymous: boolean; created_at: string
  last_sign_in_at: string | null; profile_role: string | null; plan: string | null
  screenings: number; is_admin: boolean
}

const ERR_MSG: Record<string, { zh: string; en: string }> = {
  not_superadmin: { zh: '只有 superadmin 可以管理组成员', en: 'Only a superadmin can manage members' },
  invalid_role: { zh: '角色无效', en: 'Invalid role' },
  user_not_found: { zh: '找不到这个邮箱对应的 Stayloop 账号(对方需要先注册)', en: 'No Stayloop account with that email — they need to sign up first' },
  last_superadmin: { zh: '不能移除最后一位 superadmin', en: 'Cannot remove the last superadmin' },
}

export default function AdminUsersPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const { loading, role } = useAdmin()
  const [members, setMembers] = useState<Member[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'superadmin'>('admin')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [showAnon, setShowAnon] = useState(false)

  const load = useCallback(async () => {
    setListLoading(true)
    const { data } = await supabase.rpc('admin_list_members')
    setMembers((data || []) as Member[])
    setListLoading(false)
  }, [])

  useEffect(() => {
    if (role) load()
  }, [role, load])

  // Totals come from admin_user_counts, NOT from the fetched page: the
  // roster is capped (500) and ordered by created_at desc, so deriving
  // counts from the truncated array understated both numbers once
  // anon+real exceeded the cap — while looking authoritative.
  const [totals, setTotals] = useState<{ real: number; anon: number; test: number } | null>(null)
  useEffect(() => {
    if (!role) return
    supabase.rpc('admin_list_users', { p_limit: 500 }).then(({ data }) =>
      setRoster(Array.isArray(data) ? (data as RosterRow[]) : []))
    supabase.rpc('admin_user_counts').then(({ data }) => {
      const d = data as { real?: number; anon?: number; test?: number } | null
      if (d && typeof d.real === 'number') setTotals({ real: d.real, anon: d.anon ?? 0, test: d.test ?? 0 })
    })
  }, [role, msg])

  const runRpc = async (fn: string, args: Record<string, unknown>, okText: string) => {
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc(fn, args)
    const res = data as { ok?: boolean; error?: string } | null
    if (error || !res?.ok) {
      const key = res?.error || ''
      setMsg({ ok: false, text: ERR_MSG[key]?.[lang] || error?.message || (zh ? '操作失败' : 'Operation failed') })
    } else {
      setMsg({ ok: true, text: okText })
      await load()
    }
    setBusy(false)
  }

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
          <Link href={auth.user ? '/' : '/login?redirect=/admin/users'} className="sl-btn-primary mt-6">
            {auth.user ? (zh ? '返回首页' : 'Back home') : (zh ? '去登录' : 'Sign in')}
          </Link>
        </div>
      </Shell>
    )
  }

  const isSuper = role === 'superadmin'

  return (
    <Shell>
      <div className="mx-auto max-w-[860px] px-5 py-10 sm:px-7">
        <Link href="/admin" className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3 hover:text-brand">
          ← STAYLOOP ADMIN
        </Link>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-tight">{zh ? '用户与权限' : 'Users & permissions'}</h1>
        <p className="mt-2 text-[13.5px] text-body-2">
          {zh
            ? '管理组成员拥有后台权限(房源验证等)。superadmin 额外可以管理本页的成员名单。'
            : 'Group members hold back-office permissions (listing verification etc.). Superadmins can additionally manage this member list.'}
        </p>

        {/* Add member — superadmin only */}
        {isSuper && (
          <div className="sl-card mt-7 p-5">
            <div className="text-[14.5px] font-bold">{zh ? '添加成员' : 'Add a member'}</div>
            <p className="mt-1 text-[12.5px] text-body-3">
              {zh ? '输入对方 Stayloop 账号的邮箱(需已注册)。已在组内的成员会被更新为所选角色。' : 'Enter the email of an existing Stayloop account. Existing members are updated to the chosen role.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="sl-input min-w-0 flex-1"
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <select className="sl-input w-auto" value={newRole} onChange={(e) => setNewRole(e.target.value as 'admin' | 'superadmin')}>
                <option value="admin">admin</option>
                <option value="superadmin">superadmin</option>
              </select>
              <button
                className="sl-btn-primary disabled:opacity-50"
                disabled={busy || !email.includes('@')}
                onClick={() => runRpc('admin_add_member', { p_email: email, p_role: newRole }, zh ? `已添加 ${email}` : `Added ${email}`).then(() => setEmail(''))}
              >
                {busy ? '…' : (zh ? '添加' : 'Add')}
              </button>
            </div>
          </div>
        )}

        {msg && (
          <div
            className="mt-4 rounded-lg border px-4 py-3 text-[13px] font-semibold"
            style={msg.ok ? { borderColor: '#04785744', color: '#047857', background: 'rgba(4,120,87,0.06)' } : { borderColor: '#DC262644', color: '#DC2626', background: 'rgba(220,38,38,0.05)' }}
          >
            {msg.text}
          </div>
        )}

        {/* Member list */}
        <div className="mt-6 space-y-2.5">
          {listLoading ? (
            <div className="py-10 text-center text-body-3">{zh ? '加载中…' : 'Loading…'}</div>
          ) : (
            members.map((m) => (
              <div key={m.user_id} className="sl-card flex flex-wrap items-center gap-3 p-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-chip font-bold">
                  {m.email.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold">{m.email}</span>
                    {m.user_id === auth.user?.id && (
                      <span className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-body-3" style={{ background: 'rgba(0,0,0,0.05)' }}>
                        {zh ? '你' : 'YOU'}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-body-3">
                    {m.note ? `${m.note} · ` : ''}{zh ? '加入于' : 'since'} {new Date(m.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span
                  className="rounded-md px-2 py-1 font-mono text-[10.5px] font-bold uppercase"
                  style={m.role === 'superadmin' ? { background: 'rgba(27,27,60,0.10)', color: '#1B1B3C' } : { background: 'rgba(4,120,87,0.08)', color: '#047857' }}
                >
                  {m.role}
                </span>
                {isSuper && (
                  <div className="flex items-center gap-2">
                    {/* Self-demotion hidden: demoting yourself as the only
                        superadmin would lock the whole admin group (the
                        server now also rejects last-superadmin demotion). */}
                    {!(m.user_id === auth.user?.id && m.role === 'superadmin') && (
                    <button
                      className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-[12px] font-semibold text-body-2 hover:border-brand hover:text-brand disabled:opacity-50"
                      disabled={busy}
                      onClick={() =>
                        runRpc(
                          'admin_add_member',
                          { p_email: m.email, p_role: m.role === 'admin' ? 'superadmin' : 'admin' },
                          zh ? '角色已更新' : 'Role updated'
                        )
                      }
                    >
                      {m.role === 'admin' ? (zh ? '升为 superadmin' : 'Make superadmin') : (zh ? '降为 admin' : 'Make admin')}
                    </button>
                    )}
                    <button
                      className="rounded-lg border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                      style={{ borderColor: '#DC2626', color: '#DC2626' }}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(zh ? `确定把 ${m.email} 移出管理组?` : `Remove ${m.email} from the admin group?`)) {
                          runRpc('admin_remove_member', { p_user_id: m.user_id }, zh ? '已移除' : 'Removed')
                        }
                      }}
                    >
                      {zh ? '移除' : 'Remove'}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Full user roster — the registrations view. Real accounts and
            anonymous trial sessions never share a bucket (2026-08-12). */}
        <div className="sl-card mt-8 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-[14.5px] font-bold">{zh ? '全站用户' : 'All users'}</div>
            {roster && (
              <span className="font-mono text-[11px] text-body-3">
                {zh
                  ? `${totals ? totals.real : roster.filter((r) => !r.is_anonymous).length} 真实注册 · ${totals ? totals.anon : roster.filter((r) => r.is_anonymous).length} 匿名会话${totals && totals.test > 0 ? ` · ${totals.test} 测试账号` : ''}${totals && roster.length >= 500 ? '（列表仅显示最近 500 条）' : ''}`
                  : `${totals ? totals.real : roster.filter((r) => !r.is_anonymous).length} real · ${totals ? totals.anon : roster.filter((r) => r.is_anonymous).length} anonymous${totals && totals.test > 0 ? ` · ${totals.test} test` : ''}${totals && roster.length >= 500 ? ' (showing latest 500)' : ''}`}
              </span>
            )}
            <label className="ml-auto flex items-center gap-1.5 text-[12px] text-body-2">
              <input type="checkbox" checked={showAnon} onChange={(e) => setShowAnon(e.target.checked)} />
              {zh ? '显示匿名会话' : 'Show anonymous'}
            </label>
          </div>
          <div className="mt-4 space-y-1.5">
            {roster == null ? (
              <p className="text-[13px] text-body-3">…</p>
            ) : (
              roster
                .filter((r) => showAnon || !r.is_anonymous)
                .map((r) => (
                  <div key={r.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line-divider/60 px-3.5 py-2.5 text-[12.5px]">
                    <span className="min-w-0 flex-1 basis-[14rem] break-all font-semibold">
                      {r.is_anonymous ? (
                        <span className="font-mono text-body-3">{zh ? '匿名会话' : 'anonymous'} · {r.user_id.slice(0, 8)}</span>
                      ) : (
                        r.email
                      )}
                    </span>
                    {r.is_admin && <span className="rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand">ADMIN</span>}
                    {r.profile_role && <span className="rounded bg-surface-chip px-1.5 py-0.5 font-mono text-[10px]">{r.profile_role}</span>}
                    {r.plan && r.plan !== 'free' && <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700">{r.plan.toUpperCase()}</span>}
                    {r.screenings > 0 && <span className="font-mono text-[11px] text-body-3">{r.screenings} {zh ? '单筛查' : 'screenings'}</span>}
                    <span className="font-mono text-[11px] text-body-3">
                      {zh ? '注册' : 'joined'} {new Date(r.created_at).toLocaleDateString()}
                      {r.last_sign_in_at ? ` · ${zh ? '最后登录' : 'last'} ${new Date(r.last_sign_in_at).toLocaleDateString()}` : ''}
                    </span>
                    {isSuper && !r.is_admin && r.user_id !== auth.user?.id && (
                      <button
                        className="font-mono text-[11px] font-bold text-red-500 hover:underline disabled:opacity-50"
                        disabled={busy}
                        onClick={() => {
                          const label = r.email || r.user_id.slice(0, 8)
                          if (window.confirm(zh
                            ? `确定删除用户 ${label}?其账号与关联档案会被移除,筛查记录保留。`
                            : `Delete user ${label}? Account and profile are removed; screening rows remain.`)) {
                            runRpc('admin_delete_user', { p_user_id: r.user_id }, zh ? '已删除' : 'Deleted')
                          }
                        }}
                      >
                        {zh ? '删除' : 'Delete'}
                      </button>
                    )}
                  </div>
                ))
            )}
          </div>
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
