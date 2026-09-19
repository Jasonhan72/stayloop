'use client'

// Side-by-side table under a commercial shortlist (lib/agent/commercialSearch.ts).
// A commercial tenant compares a set — area, clear height, net rate, TMI,
// all-in annual cost, zoning, possession — not six cards at a time. Every
// number is the listing's own or arithmetic on it; shortfalls found by
// assessFit render red. Mobile: the wrapper scrolls horizontally and the
// table keeps a min width (see CLAUDE.md 手机端 rules).
import { useT } from '@/lib/i18n'
import type { ListingCard } from '@/lib/agent/types'

const money = (n?: number) => (n != null && n > 0 ? `$${Math.round(n).toLocaleString()}` : '—')

export default function CommercialCompareTable({ listings }: { listings: ListingCard[] }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const rows = listings.filter((l) => l.kind === 'commercial')
  if (rows.length < 2) return null
  const hasTmi = rows.some((l) => l.tmi_psf != null)
  const h = (z: string, e: string) => (zh ? z : e)
  return (
    <div className="mb-2 min-w-0 overflow-x-auto rounded-xl border border-line-divider bg-white">
      <table className="min-w-[860px] w-full border-collapse text-[12px] leading-snug">
        <thead>
          <tr className="bg-surface-chip text-left font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">{h('物业 / 城市', 'Property / city')}</th>
            <th className="px-3 py-2 text-right">{h('面积', 'Area')}</th>
            <th className="px-3 py-2 text-right">{h('净高', 'Clear')}</th>
            <th className="px-3 py-2 text-right">{h('报价', 'Ask')}</th>
            {hasTmi && <th className="px-3 py-2 text-right">TMI</th>}
            <th className="px-3 py-2 text-right">{h('年成本(估)', 'Annual (est.)')}</th>
            <th className="px-3 py-2">Zoning</th>
            <th className="px-3 py-2">{h('交付', 'Possession')}</th>
            <th className="px-3 py-2">{h('标记', 'Flags')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => {
            const ask = l.rate_psf != null ? `$${l.rate_psf}/sqft` : l.price_basis === 'monthly' ? `${money(l.price)}/${zh ? '月' : 'mo'}` : '—'
            const annualLabel = l.annual_cost != null ? money(l.annual_cost) + (!l.annual_all_in ? (zh ? ' 净' : ' net') : '') : '—'
            const bad = (l.fit_tier ?? 0) >= 3
            return (
              <tr key={l.id} className="border-t border-line-divider align-top" style={bad ? { background: 'rgba(220,38,38,0.04)' } : undefined}>
                <td className="px-3 py-2 text-body-3">{i + 1}</td>
                <td className="px-3 py-2">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:underline">
                    {l.address}
                  </a>
                  <div className="text-[11px] text-body-3">
                    {[l.city, zh ? l.property_type : l.property_type_en || l.property_type, l.mls ? `MLS ${l.mls}` : null].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{l.sqft ? l.sqft.toLocaleString() : l.sqft_min != null ? `${l.sqft_min.toLocaleString()}+` : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={l.warn_codes?.includes('clear_short') ? { color: '#B91C1C', fontWeight: 600 } : undefined}>
                  {l.clear_ft != null ? `${l.clear_ft}'` : h('需确认', 'TBC')}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {ask}
                  {l.lease_type && <div className="text-[10.5px] text-body-3">{l.lease_type}</div>}
                </td>
                {hasTmi && <td className="px-3 py-2 text-right tabular-nums">{l.tmi_psf != null ? (l.tmi_psf === 0 ? h('全包', 'incl.') : `$${l.tmi_psf}`) : '—'}</td>}
                <td className="px-3 py-2 text-right tabular-nums">{annualLabel}</td>
                <td className="px-3 py-2">{l.zoning || '—'}</td>
                <td className="px-3 py-2">
                  {l.possession === 'immediate' ? h('即可入驻', 'Immediate') : l.possession || '—'}
                  {l.sublease && <div className="text-[10.5px]" style={{ color: '#B45309' }}>{h('转租', 'Sublease')}</div>}
                </td>
                <td className="px-3 py-2">
                  {l.specs_warn?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {((zh ? l.specs_warn : l.specs_warn_en || l.specs_warn) || []).map((w) => (
                        <span key={w} className="rounded-md px-1.5 py-0.5 font-mono text-[10px]" style={{ background: 'rgba(220,38,38,0.08)', color: '#B91C1C' }}>
                          {w}
                        </span>
                      ))}
                    </div>
                  ) : (l.fit_tier ?? 0) === 3 ? (
                    <span className="font-mono text-[10px]" style={{ color: '#B45309' }}>{h('面积待确认', 'area TBC')}</span>
                  ) : (l.fit_tier ?? 0) === 1 && l.clear_ft == null ? (
                    <span className="font-mono text-[10px]" style={{ color: '#B45309' }}>{h('净高待确认', 'clear TBC')}</span>
                  ) : (
                    <span className="font-mono text-[10px] text-success">{h('匹配', 'fits')}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="border-t border-line-divider px-3 py-2 text-[11px] leading-snug text-body-3">
        {zh
          ? '年成本 = (净租 + 挂牌自报 TMI) × 面积；gross 报价视为全包；无 TMI 的行只算净租。净高、交付、转租引自房源文字，请以详情页与实地为准；zoning 是否允许你的用途需向市府书面确认。'
          : 'Annual = (net rate + listed TMI) × area; gross asks count as all-in; rows without TMI show net only. Clear height, possession and sublease are quoted from the listing; confirm zoning for your use with the municipality.'}
      </div>
    </div>
  )
}
