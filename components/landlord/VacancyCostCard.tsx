'use client'
// 「留人让步 vs 空置成本」(2026-10-26): a small calculator under the renewal-letter
// card. Every number is the landlord's own; the arithmetic is lib/landlord/
// vacancyMath. It never says which option to pick.
import { useState } from 'react'
import { DAYS_PER_MONTH, vacancyCost } from '@/lib/landlord/vacancyMath'

const money = (v: number) => `$${Math.round(v).toLocaleString()}`

export default function VacancyCostCard({ zh, monthlyRent }: { zh: boolean; monthlyRent?: number | null }) {
  const [open, setOpen] = useState(false)
  const [rent, setRent] = useState(monthlyRent && monthlyRent > 0 ? String(monthlyRent) : '')
  const [days, setDays] = useState('30')
  const [turnover, setTurnover] = useState('')
  const [concession, setConcession] = useState('')
  const out = vacancyCost({ monthlyRent: Number(rent), vacantDays: Number(days), turnoverCost: Number(turnover), concessionPerMonth: Number(concession) })
  const ready = Number(rent) > 0
  const cls = 'sl-input !w-full text-[13px]'
  return (
    <div className="mt-4 rounded-xl border border-line-divider bg-surface-chip/40 p-3" data-testid="vacancy-cost-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="text-[13px] font-semibold">{zh ? '算一下：留人让步 vs 空置成本' : 'Compare: a concession vs an empty unit'}</span>
        <span className="text-[12px] text-body-3">{open ? (zh ? '收起' : 'Hide') : (zh ? '展开' : 'Show')}</span>
      </button>
      {open && (
        <div className="mt-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block text-[12px] text-body-2">{zh ? '月租' : 'Monthly rent'}<input type="number" inputMode="decimal" min={0} className={cls} value={rent} onChange={(e) => setRent(e.target.value)} data-testid="vacancy-rent" /></label>
            <label className="block text-[12px] text-body-2">{zh ? '预计空置天数' : 'Expected vacant days'}<input type="number" inputMode="numeric" min={0} className={cls} value={days} onChange={(e) => setDays(e.target.value)} data-testid="vacancy-days" /></label>
            <label className="block text-[12px] text-body-2">{zh ? '周转支出（清洁、修补、拍照）' : 'Turnover costs (cleaning, repairs, photos)'}<input type="number" inputMode="decimal" min={0} className={cls} value={turnover} onChange={(e) => setTurnover(e.target.value)} /></label>
            <label className="block text-[12px] text-body-2">{zh ? '留人让步（每月）' : 'Concession to stay (per month)'}<input type="number" inputMode="decimal" min={0} className={cls} value={concession} onChange={(e) => setConcession(e.target.value)} data-testid="vacancy-concession" /></label>
          </div>
          {ready && (
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2" data-testid="vacancy-result">
              <div className="flex justify-between border-b border-line-divider py-1"><dt className="text-body-2">{zh ? '空一天少收' : 'Each empty day'}</dt><dd className="font-semibold">{money(out.perDay)}</dd></div>
              <div className="flex justify-between border-b border-line-divider py-1"><dt className="text-body-2">{zh ? `空 ${Number(days) || 0} 天` : `${Number(days) || 0} empty days`}</dt><dd className="font-semibold">{money(out.vacancy)}</dd></div>
              <div className="flex justify-between border-b border-line-divider py-1"><dt className="text-body-2">{zh ? '换租合计（空置 + 周转）' : 'Turnover in all (vacancy + costs)'}</dt><dd className="font-semibold text-brand">{money(out.turnoverTotal)}</dd></div>
              <div className="flex justify-between border-b border-line-divider py-1"><dt className="text-body-2">{zh ? '让步 12 个月合计' : 'Concession over 12 months'}</dt><dd className="font-semibold text-brand">{money(out.concessionTotal)}</dd></div>
            </dl>
          )}
          {ready && (
            <p className="mt-2 text-[12.5px] leading-relaxed" data-testid="vacancy-summary">
              {out.breakEvenDays != null && (zh
                ? `按这些数，空置超过 ${Math.ceil(out.breakEvenDays)} 天，换租就比让步贵。`
                : `On these numbers, turnover costs more than the concession once the unit sits empty for more than ${Math.ceil(out.breakEvenDays)} days.`)}
            </p>
          )}
          <p className="mt-2 text-[11.5px] leading-relaxed text-body-3">
            {zh ? `全是你自己填的假设：一天 = 月租 ÷ ${DAYS_PER_MONTH.toFixed(2)}。安省在租租客的涨幅仍受指导比例限制；这里不做建议。` : `All your own assumptions: one day = rent ÷ ${DAYS_PER_MONTH.toFixed(2)}. Increases for a sitting tenant in Ontario stay within the guideline; nothing here is a recommendation.`}
          </p>
        </div>
      )}
    </div>
  )
}
