'use client'

// Stayloop back-office · agent (RECO registrant) verification queue.
// Access: admin_users. The admin opens registrantsearch.reco.on.ca (from a
// Canadian IP — the register geo-blocks and forbids automated use), searches
// by RECO ID, and compares name / category / brokerage / status / expiry /
// discipline. RLS: agent_profiles_admin_all; the guard trigger lets admins
// write status / verified_* that self-service cannot.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { RECO_REGISTER_URL, categoryLabel, statusLabel, type AgentProfile, type AgentStatus } from '@/lib/agentProfile'

export default function AdminAgentsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const [adminRole, setAdminRole] = useState<string | null | 'loading'>('loading')
  const [rows, setRows] = useState<AgentProfile[]>([])
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setAdminRole(null); return }
    supabase.from('admin_users').select('role').eq('user_id', auth.user.id).maybeSingle().then(({ data }) => setAdminRole(data?.role ?? null))
  }, [auth.loading, auth.user])

  const load = useCallback(async () => {
    let q = supabase.from('agent_profiles').select('*').order('created_at', { ascending: false }).limit(200)
    if (tab === 'pending') q = q.in('status', ['pending', 'renewal_due'])
    const { data } = await q
    setRows((data || []) as AgentProfile[])
  }, [tab])
  useEffect(() => { if (adminRole && adminRole !== 'loading') load() }, [adminRole, load])

  async function decide(a: AgentProfile, status: AgentStatus) {
    if (!auth.user) return
    setBusy(a.auth_id)
    const note = (notes[a.auth_id] || '').trim() || null
    const { error } = await supabase.from('agent_profiles').update({
      status, review_note: note,
      verified_at: status === 'verified' ? new Date().toISOString() : null,
      verified_by: status === 'verified' ? auth.user.id : null,
    }).eq('auth_id', a.auth_id)
    if (!error) {
      await supabase.from('agent_verification_events').insert({ agent_auth_id: a.auth_id, action: status, actor: auth.user.id, note })
      await load()
    }
    setBusy(null)
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="mx-auto max-w-[1100px] px-5 py-8">{children}</main>
    </div>
  )

  if (auth.loading || adminRole === 'loading') return <Shell><div className="text-body-3">{zh ? '加载中…' : 'Loading…'}</div></Shell>
  if (!auth.user || !adminRole) return <Shell><div className="rounded-xl border border-line-divider bg-white p-6 text-[14px]">{zh ? '仅限后台管理员。' : 'Admins only.'} <Link href="/admin" className="underline">{zh ? '返回后台' : 'Back'}</Link></div></Shell>

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">Stayloop admin</div>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-tight">{zh ? '经纪认证队列' : 'Agent verification queue'}</h1>
          <p className="mt-1 text-[13px] text-body-2">
            {zh ? '打开 RECO 注册库（需加拿大 IP），按 RECO ID 查，逐项对照姓名 / 类别 / 经纪公司 / 状态 REGISTERED / 到期日 / 处分记录。' : 'Open the RECO register (Canadian IP needed), search by RECO ID, compare name / category / brokerage / status REGISTERED / expiry / discipline.'}
            {' '}<a href={RECO_REGISTER_URL} target="_blank" rel="noopener noreferrer" className="underline">registrantsearch.reco.on.ca ↗</a>
          </p>
        </div>
        <div className="flex gap-2">
          {(['pending', 'all'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="rounded-full border px-3 py-1.5 text-[12.5px] font-bold" style={tab === t ? { background: '#1B1B3C', color: '#fff', borderColor: '#1B1B3C' } : { background: '#fff', borderColor: '#D3E3EF' }}>
              {t === 'pending' ? (zh ? '待核验' : 'Pending') : (zh ? '全部' : 'All')}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {rows.length === 0 && <div className="rounded-xl border border-line-divider bg-white p-6 text-[13px] text-body-3">{zh ? '没有记录。' : 'Nothing here.'}</div>}
        {rows.map(a => (
          <div key={a.auth_id} className="rounded-2xl border border-line-divider bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[15px] font-bold">{a.legal_name} <span className="font-mono text-[12px] text-body-3">#{a.reco_number}</span></div>
                <div className="text-[12.5px] text-body-2">{categoryLabel(a.category, lang as 'zh' | 'en')} · {a.brokerage_name}{a.crea_member ? ' · CREA' : ''}{a.expires_at ? ` · ${zh ? '到期' : 'expires'} ${a.expires_at}` : ''}</div>
                <div className="text-[11.5px] text-body-3">{a.business_email || '—'} · {a.business_phone || '—'} · {zh ? '提交于' : 'submitted'} {new Date(a.created_at).toLocaleDateString('en-CA')}{a.trade_name ? ` · ${zh ? '常用名' : 'trade name'} ${a.trade_name}` : ''}</div>
              </div>
              <span className="rounded-full px-2 py-[2px] text-[11px] font-bold" style={a.status === 'verified' ? { background: '#E4EEE3', color: '#065F46' } : a.status === 'rejected' || a.status === 'expired' ? { background: '#FEF2F2', color: '#B91C1C' } : { background: '#FEF3E2', color: '#B45309' }}>
                {statusLabel(a.status, lang as 'zh' | 'en')}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input value={notes[a.auth_id] ?? a.review_note ?? ''} onChange={e => setNotes({ ...notes, [a.auth_id]: e.target.value })} placeholder={zh ? '核验备注（拒绝原因 / 处分记录有无）' : 'Review note (reason / discipline yes-no)'} className="min-w-[220px] flex-1 rounded-lg border border-line-divider px-3 py-2 text-[13px]" />
              <button disabled={busy === a.auth_id} onClick={() => decide(a, 'verified')} className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-white" style={{ background: '#047857' }}>{zh ? '核验通过' : 'Verify'}</button>
              <button disabled={busy === a.auth_id} onClick={() => decide(a, 'rejected')} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[12.5px] font-bold text-red-700">{zh ? '不通过' : 'Reject'}</button>
              <button disabled={busy === a.auth_id} onClick={() => decide(a, 'expired')} className="rounded-lg border border-line-divider bg-white px-3 py-2 text-[12.5px] text-body-3">{zh ? '标为过期' : 'Mark expired'}</button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  )
}
