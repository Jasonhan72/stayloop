'use client'

// Stayloop back-office · AI usage & cost dashboard.
// Reads admin_ai_usage_stats(p_days) (SECURITY DEFINER, admin-gated) — the
// aggregate over public.ai_usage written by lib/llmChat.ts on every model call.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useAdmin } from '@/lib/useAdmin'
import { useT } from '@/lib/i18n'

type Stats = {
  since: string
  totals: { calls: number; cost_usd: number; input_tokens: number; output_tokens: number; unpriced_calls: number; errors: number }
  today: { calls: number; cost_usd: number }
  daily: Array<{ day: string; calls: number; cost_usd: number }>
  by_model: Array<{ model: string; provider: string; calls: number; cost_usd: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; unpriced: number; avg_latency_ms: number | null }>
  by_slot: Array<{ slot: string; calls: number; cost_usd: number }>
  per_screening: { screenings: number; avg_cost_usd: number; p50_cost_usd: number; max_cost_usd: number }
  top_users: Array<{ user_id: string; calls: number; cost_usd: number }>
}

const usd = (n: number | null | undefined) => `$${Number(n || 0).toFixed(n && n < 1 ? 4 : 2)}`
const fmt = (n: number | null | undefined) => Number(n || 0).toLocaleString()

export default function AdminUsagePage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const { loading, role } = useAdmin()
  const [days, setDays] = useState(30)
  const [stats, setStats] = useState<Stats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('admin_ai_usage_stats', { p_days: days })
    if (error) setErr(error.message)
    else setStats(data as Stats)
    setBusy(false)
  }, [days])
  useEffect(() => { if (role) load() }, [role, load])

  if (auth.loading || loading) return <Shell><div className="flex min-h-[50vh] items-center justify-center text-body-3">{zh ? '加载中…' : 'Loading…'}</div></Shell>
  if (!auth.user || !role) {
    return (
      <Shell>
        <div className="mx-auto max-w-[520px] py-24 text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">STAYLOOP ADMIN</div>
          <h1 className="mt-3 text-[26px] font-extrabold tracking-tight">{zh ? '无访问权限' : 'No access'}</h1>
          <Link href={auth.user ? '/' : '/login?redirect=/admin/usage'} className="sl-btn-primary mt-6">{auth.user ? (zh ? '返回首页' : 'Back home') : (zh ? '去登录' : 'Sign in')}</Link>
        </div>
      </Shell>
    )
  }

  const maxDaily = Math.max(0.000001, ...(stats?.daily || []).map((d) => Number(d.cost_usd)))

  return (
    <Shell>
      <div className="mx-auto max-w-[1040px] px-5 py-10 sm:px-7">
        <Link href="/admin" className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3 hover:text-brand">← STAYLOOP ADMIN</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[30px] font-extrabold tracking-tight">{zh ? 'AI 用量与成本' : 'AI usage & cost'}</h1>
            <p className="mt-2 text-[13.5px] text-body-2">{zh ? '每一次模型调用（对话、筛查评分、一致性审查、分类、取证、OCR）的 token 与按目录单价折算的美元成本。成本为估算值，以各厂商账单为准。' : 'Tokens and USD cost (from catalogue list prices) for every model call — turns, scoring, coherence review, classification, forensics, OCR. Estimates; provider invoices are authoritative.'}</p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={'rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold ' + (days === d ? 'border-brand text-brand' : 'border-line-divider text-body-2')}>{d}{zh ? ' 天' : 'd'}</button>
            ))}
            <button onClick={load} disabled={busy} className="rounded-lg border border-line-divider px-3 py-1.5 text-[12.5px] text-body-2 disabled:opacity-50">{busy ? '…' : (zh ? '刷新' : 'Refresh')}</button>
          </div>
        </div>
        {err && <div className="mt-4 rounded-lg border px-4 py-3 text-[13px] font-semibold" style={{ borderColor: '#DC262644', color: '#DC2626', background: 'rgba(220,38,38,0.05)' }}>{err}</div>}

        {stats && (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <Kpi label={zh ? `近 ${days} 天成本` : `Cost · ${days}d`} value={usd(stats.totals.cost_usd)} sub={zh ? `${fmt(stats.totals.calls)} 次调用` : `${fmt(stats.totals.calls)} calls`} />
              <Kpi label={zh ? '今日' : 'Today'} value={usd(stats.today.cost_usd)} sub={zh ? `${fmt(stats.today.calls)} 次调用` : `${fmt(stats.today.calls)} calls`} />
              <Kpi label={zh ? '单次筛查均价' : 'Avg per screening'} value={usd(stats.per_screening.avg_cost_usd)} sub={zh ? `中位 ${usd(stats.per_screening.p50_cost_usd)} · 最高 ${usd(stats.per_screening.max_cost_usd)} · ${fmt(stats.per_screening.screenings)} 次` : `p50 ${usd(stats.per_screening.p50_cost_usd)} · max ${usd(stats.per_screening.max_cost_usd)} · ${fmt(stats.per_screening.screenings)} screenings`} />
              <Kpi label={zh ? 'Token（入 / 出）' : 'Tokens (in / out)'} value={`${(Number(stats.totals.input_tokens) / 1e6).toFixed(2)}M / ${(Number(stats.totals.output_tokens) / 1e6).toFixed(2)}M`} sub={(stats.totals.unpriced_calls > 0 ? (zh ? `${fmt(stats.totals.unpriced_calls)} 次未定价 · ` : `${fmt(stats.totals.unpriced_calls)} unpriced · `) : '') + (zh ? `${fmt(stats.totals.errors)} 次失败` : `${fmt(stats.totals.errors)} errors`)} warn={stats.totals.unpriced_calls > 0} />
            </div>

            <h2 className="mt-8 text-[16px] font-extrabold tracking-tight">{zh ? '每日成本' : 'Daily cost'}</h2>
            <div className="mt-3 flex h-[140px] items-end gap-[3px] rounded-xl border border-line-divider bg-white p-3">
              {stats.daily.length === 0 && <div className="text-[12px] text-body-3">{zh ? '暂无数据' : 'No data yet'}</div>}
              {stats.daily.map((d) => (
                <div key={d.day} className="flex-1" title={`${d.day} · ${usd(d.cost_usd)} · ${d.calls} calls`}>
                  <div className="w-full rounded-t" style={{ height: `${Math.max(2, (Number(d.cost_usd) / maxDaily) * 110)}px`, background: '#7C3AED' }} />
                </div>
              ))}
            </div>
            {stats.daily.length > 0 && <div className="mt-1 flex justify-between font-mono text-[10px] text-body-3"><span>{stats.daily[0].day}</span><span>{stats.daily[stats.daily.length - 1].day}</span></div>}

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div>
                <h2 className="text-[16px] font-extrabold tracking-tight">{zh ? '按模型' : 'By model'}</h2>
                <Table head={[zh ? '模型' : 'Model', zh ? '调用' : 'Calls', zh ? '成本' : 'Cost', zh ? 'Token 入/出/缓存' : 'Tokens in/out/cached', zh ? '均延迟' : 'Avg ms']}
                  rows={stats.by_model.map((m) => [
                    <span key="m"><span className="font-mono text-[11.5px]">{m.model}</span>{m.unpriced > 0 && <span className="ml-1 text-[10px]" style={{ color: '#B45309' }}>{zh ? `未定价 ${m.unpriced}` : `${m.unpriced} unpriced`}</span>}</span>,
                    fmt(m.calls), usd(m.cost_usd), `${fmt(m.input_tokens)} / ${fmt(m.output_tokens)} / ${fmt(m.cache_read_tokens)}`, fmt(m.avg_latency_ms)])} />
              </div>
              <div>
                <h2 className="text-[16px] font-extrabold tracking-tight">{zh ? '按槽位' : 'By slot'}</h2>
                <Table head={[zh ? '槽位' : 'Slot', zh ? '调用' : 'Calls', zh ? '成本' : 'Cost']} rows={stats.by_slot.map((s) => [<span key="s" className="font-mono text-[11.5px]">{s.slot}</span>, fmt(s.calls), usd(s.cost_usd)])} />
                <h2 className="mt-6 text-[16px] font-extrabold tracking-tight">{zh ? '用量最高的用户' : 'Top users'}</h2>
                <Table head={[zh ? '用户' : 'User', zh ? '调用' : 'Calls', zh ? '成本' : 'Cost']} rows={stats.top_users.map((u) => [<Link key="u" href={`/admin/users?u=${u.user_id}`} className="font-mono text-[11px] text-brand hover:underline">{u.user_id.slice(0, 8)}…</Link>, fmt(u.calls), usd(u.cost_usd)])} />
              </div>
            </div>
            <p className="mt-6 text-[11.5px] text-body-3">{zh ? '单价来自 /admin/models 的模型目录（内置模型按官方价预填；Qwen / GLM / OCR 未定价，请补充）。缓存读取按 10% 输入价、缓存写入按输入价计（Anthropic 按官方 1.25×）。' : 'Prices come from the /admin/models catalogue (builtins prefilled with list prices; Qwen / GLM / OCR unpriced — please fill in). Cache reads priced at 10% of input, cache writes at input price (Anthropic 1.25×).'}</p>
          </>
        )}
      </div>
    </Shell>
  )
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="sl-card p-4">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{label}</div>
      <div className="mt-1 text-[24px] font-extrabold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px]" style={{ color: warn ? '#B45309' : undefined }}>{sub}</div>}
    </div>
  )
}
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-line-divider bg-white">
      <table className="w-full text-[12.5px]">
        <thead><tr className="border-b border-line-divider text-left font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">{head.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td className="px-3 py-3 text-body-3" colSpan={head.length}>—</td></tr>}
          {rows.map((r, i) => <tr key={i} className="border-b border-line-divider last:border-0">{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-surface-nav text-body"><Header />{children}</div>
}
