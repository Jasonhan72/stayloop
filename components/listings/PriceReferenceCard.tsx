'use client'
// 「定价参考」(2026-10-27 · report review batch 3, site part): the public
// benchmark (CMHC survey / StatCan asking, Ontario only) next to the landlord's
// own listings of the same size, and how the asking rent sits against the
// benchmark. Public statistics plus the landlord's own records — never another
// landlord's data, never a competitor pool, never a recommendation (RealPage
// red line; the rules page says so). The landlord types the rent; this only
// shows where it lands.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RentBenchmarkOut } from '@/lib/api/v1Core'

type Props = { zh: boolean; province?: string | null; city?: string | null; neighborhood?: string | null; bedrooms: number | null; propertyType?: string | null; rent: number | null; landlordId?: string | null }
type Own = { min: number; max: number; count: number }

const bench = (type: string | null | undefined): 'apartment' | 'condo' | 'townhouse' | 'house' =>
  type === 'condo' || type === 'townhouse' || type === 'house' ? type : 'apartment'

export default function PriceReferenceCard({ zh, province = 'ON', city, neighborhood, bedrooms, propertyType, rent, landlordId }: Props) {
  const [out, setOut] = useState<RentBenchmarkOut | null>(null)
  const [own, setOwn] = useState<Own | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'none' | 'ok'>('idle')
  const area = (neighborhood || city || '').trim()
  const type = bench(propertyType)

  useEffect(() => {
    if (province !== 'ON' || bedrooms == null) { setOut(null); setState('idle'); return }
    let on = true
    setState('loading')
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ province: 'ON', bedrooms: String(Math.max(0, Math.min(10, bedrooms))), type })
        if (area) q.set('area', area)
        const r = await fetch(`/api/v1/rent-benchmark?${q.toString()}`)
        const j = await r.json().catch(() => null)
        if (!on) return
        if (!r.ok || !j || j.error) { setOut(null); setState('none'); return }
        setOut(j as RentBenchmarkOut); setState('ok')
      } catch { if (on) { setOut(null); setState('none') } }
    }, 500)
    return () => { on = false; clearTimeout(t) }
  }, [province, bedrooms, type, area])

  useEffect(() => {
    if (!landlordId || bedrooms == null) { setOwn(null); return }
    let on = true
    void (async () => {
      const { data } = await supabase.from('listings').select('monthly_rent').eq('landlord_id', landlordId).eq('bedrooms', bedrooms).neq('status', 'archived').limit(50)
      if (!on) return
      const rents = ((data ?? []) as { monthly_rent: number | null }[]).map((r) => Number(r.monthly_rent)).filter((n) => Number.isFinite(n) && n > 0)
      setOwn(rents.length ? { min: Math.min(...rents), max: Math.max(...rents), count: rents.length } : null)
    })()
    return () => { on = false }
  }, [landlordId, bedrooms])

  if (province !== 'ON' || bedrooms == null) return null
  const delta = out && rent && rent > 0 ? ((rent - out.benchmark.avg) / out.benchmark.avg) * 100 : null
  const pct = (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(1)}%`
  return (
    <div className="rounded-xl border border-line-divider bg-surface-chip/40 p-3 text-[12.5px]" data-testid="price-reference">
      <div className="font-semibold">{zh ? '定价参考' : 'Price reference'}</div>
      {state === 'loading' && <div className="mt-1 text-body-3">{zh ? '查公开基准中…' : 'Looking up the public benchmark…'}</div>}
      {state === 'none' && <div className="mt-1 text-body-3">{zh ? '这个区域和户型暂时没有公开基准。' : 'No public benchmark for this area and size yet.'}</div>}
      {out && (
        <div className="mt-1 space-y-0.5">
          <div>{zh ? out.benchmark.label.zh : out.benchmark.label.en}: <b>${Math.round(out.benchmark.avg).toLocaleString()}</b>{zh ? '/月' : '/mo'}{out.asking ? ` · ${zh ? 'StatCan 挂牌均价' : 'StatCan asking'} $${Math.round(out.asking.avg).toLocaleString()}` : ''}</div>
          {delta != null && <div data-testid="price-delta">{zh ? `你的要价 $${rent!.toLocaleString()} 比基准${delta >= 0 ? '高' : '低'} ${pct(Math.abs(delta)).replace('+', '')}` : `Your asking rent $${rent!.toLocaleString()} is ${pct(delta)} against the benchmark`}</div>}
          <div className="text-[11.5px] text-body-3">{zh ? out.attribution.zh : out.attribution.en}</div>
        </div>
      )}
      {own && (
        <div className="mt-1" data-testid="price-own">{zh ? `你自己同卧室数的房源：${own.count} 套，$${own.min.toLocaleString()}${own.max !== own.min ? `–$${own.max.toLocaleString()}` : ''}` : `Your own listings with the same bedrooms: ${own.count}, $${own.min.toLocaleString()}${own.max !== own.min ? `–$${own.max.toLocaleString()}` : ''}`}</div>
      )}
      <div className="mt-1 text-[11.5px] text-body-3">{zh ? '只是公开统计和你自己的记录，不是定价建议；在租租客的涨幅仍受指导比例限制。' : 'Public statistics and your own records only, not a pricing recommendation; increases for a sitting tenant stay within the guideline.'}</div>
    </div>
  )
}
