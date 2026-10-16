'use client'

// /agent/checklist — offer / lease-points checklist for agents (V1.0 stage 2 · 丙 #14).
// Paste the points of an offer written elsewhere; lib/agent/offerCheck.ts marks
// deterministically what the RTA would not allow and what the standard lease will
// still need. Nothing here is stored: the text lives in component state only, no
// request leaves the page. It is an information tool, so it stays open before RECO
// verification (WorkspaceShell exempts this route from the agent-only lock).
// It does not draft, rewrite or produce any OREA form: negotiating terms is the
// registrant's own work (Law Society Act s.1(6) 4).
import { useMemo, useState } from 'react'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useT } from '@/lib/i18n'
import { checkOfferText, summarize, type OfferFinding } from '@/lib/agent/offerCheck'
import { PROVINCE_CODES, provinceName, type ProvinceCode } from '@/lib/provinces/detect'

const TONE: Record<OfferFinding['severity'], { bg: string; fg: string; border: string; zh: string; en: string }> = {
  block: { bg: '#FEF2F2', fg: '#9F1239', border: '#FECDD3', zh: '不允许', en: 'Not allowed' },
  warn: { bg: '#FFFBEB', fg: '#B45309', border: '#FDE68A', zh: '要核对', en: 'Check' },
  info: { bg: '#F3F8FC', fg: '#4A4A6A', border: '#E3F2FC', zh: '说明', en: 'Note' },
}

export default function AgentChecklistPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [text, setText] = useState('')
  const [province, setProvince] = useState<ProvinceCode>('ON')
  const [checked, setChecked] = useState<{ text: string; province: ProvinceCode } | null>(null)

  const result = useMemo(() => (checked ? checkOfferText(checked.text, { province: checked.province }) : null), [checked])
  const counts = result ? summarize(result.findings) : null
  const stale = !!checked && (checked.text !== text || checked.province !== province)

  return (
    <WorkspaceShell role="agent" hideAside>
      <div className="mx-auto max-w-[1100px]">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '核对清单' : 'Checklist'}</div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight sm:text-[28px]">{zh ? '要约 / 租约要点核对' : 'Offer / lease-points check'}</h1>
        <p className="mt-2 max-w-[760px] text-[13.5px] leading-relaxed text-body-2" data-testid="checklist-disclaimer">
          {zh
            ? '这是确定性核对，不是法律意见；条款谈判是经纪本人的事（《法律协会法》s.1(6)），Stayloop 不替你谈，也不起草或改写要约。贴进来的文字只在这个页面里用，不会保存。'
            : 'This is a deterministic check, not legal advice. Negotiating the terms is the registrant’s own work (Law Society Act s.1(6)); Stayloop does not negotiate for you and does not draft or rewrite the offer. What you paste is used on this page only and is never stored.'}
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* Left: input */}
          <div className="sl-card">
            <label htmlFor="offer-text" className="block text-[12.5px] font-semibold text-body-2">
              {zh ? '把要约 / 租约要点贴进来（不要贴申请人的证件号、SIN）' : 'Paste the offer / lease points (no applicant ID numbers, no SIN)'}
            </label>
            <textarea
              id="offer-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              spellCheck={false}
              placeholder={zh
                ? '例：Unit 1207, 100 King St W · 月租 $2,800，每月 1 日付 · 押金一个月 · 租期 2026-11-01 至 2027-10-31 · 水暖含，电网租客付 · 附加条款：……'
                : 'e.g. Unit 1207, 100 King St W · rent $2,800 per month, due on the first · deposit one month · term 2026-11-01 to 2027-10-31 · heat and water included, hydro and internet extra · additional terms: …'}
              className="sl-input mt-2 w-full resize-y font-mono text-[13px] leading-relaxed"
            />
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="block text-[12px] font-semibold text-body-3">{zh ? '房源所在省份' : 'Province of the home'}</span>
                <select value={province} onChange={(e) => setProvince(e.target.value as ProvinceCode)} className="sl-input mt-1 text-[13px]" aria-label={zh ? '省份' : 'Province'}>
                  {PROVINCE_CODES.map((c) => <option key={c} value={c}>{provinceName(c, zh)} · {c}</option>)}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setChecked({ text, province })}
                disabled={!text.trim()}
                className="sl-btn-primary px-5 py-2 text-[13.5px] disabled:opacity-50"
              >
                {zh ? '核对' : 'Check'}
              </button>
              {text && (
                <button type="button" onClick={() => { setText(''); setChecked(null) }} className="text-[12.5px] text-body-3 underline-offset-2 hover:underline">
                  {zh ? '清空' : 'Clear'}
                </button>
              )}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-body-3">
              {zh
                ? '查的是：押金是否超过一个月、押金用途、向租客收的费用、钥匙押金、禁宠与禁装空调条款、自动涨租与超指导比例、预开支票 / 自动扣款是否被设为条件、提前解约罚金，以及标准租约必填而要约没写的项。外省房源只提示按该省规则核对。'
                : 'It checks: deposit over one month, what the deposit is for, fees charged to the tenant, key deposit, pet and air-conditioner bans, automatic or above-guideline rent increases, post-dated cheques / automatic debit set as a condition, early-termination penalties, and the standard-lease items the offer leaves out. Outside Ontario it only reminds you to check that province’s rules.'}
            </p>
          </div>

          {/* Right: results */}
          <div className="sl-card min-w-0" aria-live="polite">
            {!result ? (
              <div className="py-10 text-center text-[13.5px] text-body-3">{zh ? '贴好要点后点「核对」。' : 'Paste the points and press “Check”.'}</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-semibold text-body">
                    {result.findings.length === 0
                      ? (zh ? '没有发现问题，也没有缺项。' : 'Nothing flagged and nothing missing.')
                      : zh
                        ? `${counts!.block} 条不允许 · ${counts!.warn} 条要核对 · ${counts!.info} 条说明`
                        : `${counts!.block} not allowed · ${counts!.warn} to check · ${counts!.info} notes`}
                  </span>
                  {stale && <span className="rounded-full bg-amber-50 px-2 py-[2px] text-[11.5px] font-semibold text-amber-700">{zh ? '文字已改动，再点一次「核对」' : 'Text changed — press “Check” again'}</span>}
                </div>
                <ul className="mt-3 space-y-2" data-testid="checklist-findings">
                  {result.findings.map((f) => {
                    const tone = TONE[f.severity]
                    return (
                      <li key={f.id} data-severity={f.severity} className="rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: tone.bg, borderColor: tone.border }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full px-2 py-[2px] text-[11px] font-bold" style={{ background: '#FFFFFF', color: tone.fg }}>{zh ? tone.zh : tone.en}</span>
                          {(f.rule || f.statute) && <code className="font-mono text-[11px] text-body-3">{f.rule ?? f.statute}</code>}
                        </div>
                        <p className="mt-1.5 text-body">{zh ? f.zh : f.en}</p>
                        <Link href={f.href} className="mt-1 inline-block text-[12px] font-semibold text-brand hover:underline" target="_blank" rel="noopener noreferrer">
                          {zh ? '规则原文 →' : 'The rule →'} <span className="font-mono font-normal text-body-3">{f.href}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-line-divider bg-white px-4 py-3 text-[13px] leading-relaxed text-body-2" data-testid="checklist-next-step">
          {zh ? (
            <>下一步：标准租约由房东在 <Link href="/landlord/leases/new" className="font-semibold text-brand hover:underline">/landlord/leases/new</Link> 起草（委托后经纪可协助）；要约本身在你自己的表单工具里改，这里不代写。</>
          ) : (
            <>Next step: the standard lease is drafted by the landlord at <Link href="/landlord/leases/new" className="font-semibold text-brand hover:underline">/landlord/leases/new</Link> (an agent may assist under a delegation); the offer itself is edited in your own forms tool — nothing is drafted here.</>
          )}
        </div>
      </div>
    </WorkspaceShell>
  )
}
