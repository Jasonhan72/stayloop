'use client'

// /admin/verify · Realtor.ca freshness. Imported listings used to be read on an
// hourly rotation (/api/cron/realtor-freshness); a listing whose Realtor.ca page
// said "no longer exists" twice in a row went offline on its own.
//
// STOPPED 2026-10-13: PropTx / CREA rules forbid third-party and AI use of MLS
// data, so Stayloop no longer reads Realtor.ca. REALTOR_LIVE_READS is false,
// the imported rows were archived, the hourly sweep is unscheduled and the
// "check a batch now" button is gone. The card still shows the counts for the
// historical rows (what the rotation found, what it took down).
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { summarize, type RealtorCheck, type FreshnessSummary } from '@/lib/listings/realtorFreshness'
import { REALTOR_LIVE_READS } from '@/lib/listings/externalSources'

type Row = {
  id: string
  slug: string | null
  address: string
  unit: string | null
  mls_number: string | null
  source_url: string | null
  is_active: boolean
  realtor_check: RealtorCheck | null
}

function when(iso: string | null | undefined, zh: boolean): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(zh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function RealtorFreshnessCard({ zh }: { zh: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('id,slug,address,unit,mls_number,source_url,is_active,realtor_check')
      .eq('source', 'realtor')
      .limit(2000)
    setRows((data || []) as Row[])
  }, [])
  useEffect(() => { load() }, [load])

  const runNow = async () => {
    setRunning(true)
    setNote(null)
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch('/api/cron/realtor-freshness', {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.session?.access_token ?? ''}` },
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setNote(zh ? `检查失败（${res.status}）` : `Check failed (${res.status})`)
      else setNote(zh
        ? `已检查 ${j.checked} 套 · 下架 ${j.delisted?.length ?? 0} · 调价 ${j.repriced?.length ?? 0}`
        : `Checked ${j.checked} · delisted ${j.delisted?.length ?? 0} · repriced ${j.repriced?.length ?? 0}`)
      await load()
    } finally {
      setRunning(false)
    }
  }

  if (!rows) return null
  const active = rows.filter((r) => r.is_active)
  const autoDelisted = rows
    .filter((r) => !r.is_active && r.realtor_check?.delisted_at)
    .sort((a, b) => (b.realtor_check!.delisted_at! > a.realtor_check!.delisted_at! ? 1 : -1))
  const s: FreshnessSummary = summarize(active, autoDelisted.length)
  const attention = active.filter((r) => !r.source_url || (r.realtor_check && (r.realtor_check.gone_streak > 0 || r.realtor_check.miss_streak >= 3)))

  const Stat = ({ n, label, tone }: { n: number; label: string; tone?: string }) => (
    <div className="rounded-lg border border-line bg-white px-3 py-2">
      <div className="sl-type-num text-[20px] font-semibold" style={tone ? { color: tone } : undefined}>{n}</div>
      <div className="text-[11.5px] text-body-3">{label}</div>
    </div>
  )

  return (
    <section className="sl-card mt-6 p-5" data-testid="realtor-freshness">
      {!REALTOR_LIVE_READS && (
        <div
          role="status"
          data-testid="realtor-reads-stopped"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900"
        >
          {zh
            ? 'Realtor.ca 读取已于 2026-10-13 停止（PropTx / CREA 规则不允许第三方平台与 AI 使用 MLS 数据）。导入的房源已全部归档，每小时的在架检查已停用；下面的数字只是历史记录。'
            : 'Realtor.ca reads stopped on 2026-10-13 (PropTx / CREA rules do not allow third-party platforms or AI to use MLS data). The imported listings were archived and the hourly sweep is disabled; the counts below are historical.'}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">{zh ? 'Realtor.ca 房源在架检查' : 'Realtor.ca listing freshness'}</h2>
          <p className="mt-1 text-[12.5px] text-body-3">
            {REALTOR_LIVE_READS
              ? (zh
                ? `每小时轮流读 20 套房源的 Realtor.ca 原页；连续两次显示已不存在就自动下架，挂牌价变了就同步。最近一次：${when(s.lastRun, zh)}`
                : `Reads 20 listings' Realtor.ca pages every hour; two "no longer exists" readings in a row take a listing offline, and price changes are synced. Last run: ${when(s.lastRun, zh)}`)
              : (zh
                ? `停用前每小时轮流读 20 套房源的 Realtor.ca 原页；连续两次显示已不存在就自动下架。最后一次：${when(s.lastRun, zh)}`
                : `Before it was disabled, it read 20 listings' Realtor.ca pages every hour; two "no longer exists" readings in a row took a listing offline. Last run: ${when(s.lastRun, zh)}`)}
          </p>
        </div>
        {REALTOR_LIVE_READS && (
          <button
            onClick={runNow}
            disabled={running}
            className="rounded-lg border border-line-strong bg-white px-3 py-2 text-[12.5px] font-semibold text-body-2 hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {running ? (zh ? '检查中…（约 1 分钟）' : 'Checking… (~1 min)') : (zh ? '现在检查一批' : 'Check a batch now')}
          </button>
        )}
      </div>
      {note && <div className="mt-2 text-[12.5px] text-body-2">{note}</div>}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat n={s.total} label={zh ? '在架' : 'Active'} />
        <Stat n={s.live} label={zh ? '已确认仍在挂牌' : 'Confirmed listed'} tone="#047857" />
        <Stat n={s.never} label={zh ? '还没检查过' : 'Not checked yet'} />
        <Stat n={s.suspect + s.stale + s.noUrl} label={zh ? '需要留意' : 'Needs a look'} tone={s.suspect + s.stale + s.noUrl ? '#A16207' : undefined} />
        <Stat n={s.delisted} label={zh ? '已自动下架' : 'Auto-delisted'} tone={s.delisted ? '#DC2626' : undefined} />
      </div>

      {attention.length > 0 && (
        <div className="mt-4">
          <div className="text-[12.5px] font-semibold text-body-2">{zh ? '需要留意' : 'Needs a look'}</div>
          <ul className="mt-1 divide-y divide-line text-[12.5px]">
            {attention.map((r) => {
              const c = r.realtor_check
              const why = !r.source_url
                ? (zh ? '没有 Realtor.ca 原页链接，无法自动检查' : 'No Realtor.ca link — cannot be checked')
                : c && c.gone_streak > 0
                  ? (zh ? '原页显示已不存在，等第二次确认' : 'Page says gone — awaiting a second reading')
                  : (zh ? `连续 ${c?.miss_streak} 次读不出结果（被拦或页面改版）` : `${c?.miss_streak} readings in a row inconclusive (blocked or layout change)`)
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1 font-medium">{r.unit ? `${r.unit} - ` : ''}{r.address}{r.mls_number ? ` · ${r.mls_number}` : ''}</span>
                  <span className="text-body-3">{why}</span>
                  {r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{zh ? '原页 ↗' : 'Source ↗'}</a>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {autoDelisted.length > 0 && (
        <div className="mt-4">
          <div className="text-[12.5px] font-semibold text-body-2">{zh ? '最近自动下架' : 'Recently auto-delisted'}</div>
          <ul className="mt-1 divide-y divide-line text-[12.5px]">
            {autoDelisted.slice(0, 10).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 font-medium">{r.unit ? `${r.unit} - ` : ''}{r.address}{r.mls_number ? ` · ${r.mls_number}` : ''}</span>
                <span className="text-body-3">{zh ? `下架于 ${when(r.realtor_check?.delisted_at, zh)} · Realtor.ca 显示已不存在` : `Delisted ${when(r.realtor_check?.delisted_at, zh)} · gone from Realtor.ca`}</span>
                {r.slug && <Link href={`/listings/${r.slug}`} target="_blank" className="text-brand hover:underline">{zh ? '查看' : 'View'}</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
