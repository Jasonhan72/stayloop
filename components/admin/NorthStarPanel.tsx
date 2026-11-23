'use client'

// /admin · the four numbers over real accounts (V0.9, 2026-11-22) — lib/admin/northStar.ts.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { normalizeNorthStar, northStarTiles, screeningBreakdown, type NorthStar } from '@/lib/admin/northStar'

export default function NorthStarPanel({ zh, enabled }: { zh: boolean; enabled: boolean }) {
  const [data, setData] = useState<NorthStar | 'error' | null>(null)

  useEffect(() => {
    if (!enabled) return
    let on = true
    supabase.rpc('admin_north_star').then(({ data: raw, error }) => {
      if (!on) return
      const s = error ? null : normalizeNorthStar(raw)
      setData(s ?? 'error')
    })
    return () => { on = false }
  }, [enabled])

  const peak = data && data !== 'error' ? Math.max(1, ...data.signupsByWeek.map((w) => w.n)) : 1

  return (
    <div className="mt-5 rounded-2xl border border-line-divider bg-white p-6" data-testid="north-star">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-body-3">
        {zh ? '四个数 · 只算真实账号' : 'Four numbers · real accounts only'}
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-body-3">
        {zh
          ? '不含管理员、测试号、@stayloop.ai 邮箱和匿名会话。这四个数涨，才说明有外面的人在用。'
          : 'Admins, test accounts, @stayloop.ai addresses and anonymous sessions are left out. These four going up is what outside use looks like.'}
      </p>
      {data === 'error' ? (
        <p className="mt-3 text-[13px] text-red-600" data-testid="north-star-error">{zh ? '指标加载失败' : 'Stats failed to load'}</p>
      ) : data == null ? (
        <p className="mt-3 text-[13px] text-body-3">…</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {northStarTiles(data, zh).map((t) => (
              <div key={t.key} data-testid={`north-star-${t.key}`}>
                <div className="font-mono text-[24px] font-extrabold leading-none">{t.value}</div>
                <div className="mt-1 text-[12px] font-semibold text-body-2">{t.label}</div>
                <div className="text-[11px] text-body-3">{t.sub}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-body-3" data-testid="north-star-breakdown">{screeningBreakdown(data, zh)}</p>

          <div className="mt-5 border-t border-line-divider pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[12px] font-semibold text-body-2">{zh ? '每周新增真实账号 · 近 8 周' : 'New real accounts per week · last 8 weeks'}</div>
              <div className="font-mono text-[11px] text-body-3" data-testid="north-star-accounts">
                {zh ? `真实账号共 ${data.realAccounts} 个 · 近 30 天 +${data.realAccounts30d}` : `${data.realAccounts} real accounts · +${data.realAccounts30d} in 30 days`}
              </div>
            </div>
            <div className="mt-3 flex items-end gap-2" data-testid="north-star-weeks">
              {data.signupsByWeek.map((w) => (
                <div key={w.week} className="min-w-0 flex-1 text-center" title={zh ? `${w.week} 起的一周：${w.n} 个` : `Week of ${w.week}: ${w.n}`}>
                  <div className="font-mono text-[11px] font-bold text-body-2">{w.n}</div>
                  <div className="mx-auto mt-1 flex h-10 w-full max-w-[36px] items-end rounded-sm bg-surface-chip">
                    <div className="w-full rounded-sm bg-brand" style={{ height: `${Math.round((w.n / peak) * 100)}%` }} />
                  </div>
                  <div className="mt-1 truncate font-mono text-[9.5px] text-body-4">{w.week.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
