// 入住前费用一览 — a deterministic card from rent + deposit, no new columns
// (2026-09-22, EliseAI benchmark item E). Ontario fixes the legal move-in
// charges (RTA s.105–106) and keeps its card below unchanged. A listing in
// another province gets the same card shape from that province's verified
// facts (lib/provinces moveInRules) — never Ontario law (2026-10-02 · user:
// 「外省的要查外省的法规，不要用安省的法规和说法」).
import { ListingSection } from '@/components/listing/ListingSection'
import { moveInRules, provinceName, rulesFor, type MoveInRules, type ProvinceCode } from '@/lib/provinces'

export function MoveInCosts({ zh, province, rent, deposit }: { zh: boolean; province: ProvinceCode; rent: number; deposit: number | null }) {
  if (!rent || rent <= 0) return null
  if (province !== 'ON') return <ProvinceMoveInCosts zh={zh} province={province} rent={rent} deposit={deposit} />
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`
  const dep = deposit != null && deposit > 0 ? deposit : null
  const overCap = dep != null && dep > rent + 0.5
  const total = rent + (dep ?? 0)
  const banned = zh
    ? ['申请费', '信用检查费', '宠物押金', '清洁押金', '最后一月以外的预付租金']
    : ['application fee', 'credit-check fee', 'pet deposit', 'cleaning deposit', 'prepaid rent beyond the last month']
  return (
    <ListingSection zh={zh} title={zh ? '入住前费用一览' : 'Move-in costs'} eyebrow="MOVE-IN COSTS">
      <div className="overflow-hidden rounded-xl border border-line-divider">
        <dl className="text-[13.5px]">
          <Row k={zh ? '首月租金' : 'First month’s rent'} v={fmt(rent)} />
          <Row
            k={zh ? '租金押金（不超过一个月，只抵最后一月租金）' : 'Rent deposit (max one month, applied to the last month only)'}
            v={dep != null ? fmt(dep) : (zh ? '房东未设置' : 'Not set by landlord')}
            warn={overCap}
          />
          <Row k={zh ? '钥匙押金（不超过更换成本，退租时退还）' : 'Key deposit (no more than replacement cost, refundable)'} v={zh ? '以租约为准' : 'Per lease'} muted />
          <Row k={zh ? '第一笔款合计' : 'First payment total'} v={fmt(total)} strong />
        </dl>
        {overCap && (
          <div className="border-t border-line-divider bg-red-50 px-4 py-2.5 text-[12.5px] text-red-800">
            {zh
              ? '此房源标注的押金高于一个月租金。安省 RTA s.106 规定租金押金不得超过一个月租金，请与房东确认。'
              : 'The listed deposit exceeds one month’s rent. Under RTA s.106 a rent deposit cannot exceed one month’s rent — confirm with the landlord.'}
          </div>
        )}
        <div className="border-t border-line-divider bg-surface-chip px-4 py-2.5 text-[12px] leading-relaxed text-body-3">
          {zh ? '安省不允许收取：' : 'Not permitted in Ontario: '}
          {banned.map((b, i) => (
            <span key={b}>
              <s className="decoration-red-700/70">{b}</s>
              {i < banned.length - 1 ? ' · ' : ''}
            </span>
          ))}
          {zh ? '。押金每年按指导比例付息（RTA s.105–106）。' : '. Deposits earn annual interest at the guideline rate (RTA s.105–106).'}
        </div>
      </div>
    </ListingSection>
  )
}

// ── Outside Ontario ─────────────────────────────────────────────────────────
// Every label and sentence below is a verified fact of the listing's province
// (lib/provinces/rules.ts) or a plain description of a number; a topic with no
// fact is left out. Pure helpers so the policies grid and tests share them.

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`

/** "半个月" / "half a month’s" — the deposit caps the facts use (½, ¾, 1 month). */
export function monthsText(m: number, zh: boolean): string {
  if (m === 0.5) return zh ? '半个月' : 'half a month’s'
  if (m === 0.75) return zh ? '四分之三个月' : 'three quarters of a month’s'
  if (m === 1) return zh ? '一个月' : 'one month’s'
  return zh ? `${m} 个月` : `${m} months’`
}

/** The citation a fact ends with: "…（《魁北克民法典》第 1904、1893 条）。" → "《魁北克民法典》第 1904、1893 条". */
export function factCitation(text: string | null | undefined): string | null {
  // Balanced from the end: citations carry their own brackets ("第 19(1)、20 条", "ss. 19(1), 20").
  const s = String(text ?? '').trim().replace(/[。.]$/, '')
  if (!/[)）]$/.test(s)) return null
  let depth = 0
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i]
    if (c === ')' || c === '）') depth++
    else if (c === '(' || c === '（') {
      depth--
      if (depth === 0) return s.slice(i + 1, -1).trim() || null
    }
  }
  return null
}

export type DepositIssue = { kind: 'not_allowed' } | { kind: 'over_cap'; cap: number; months: number }

/** A listed deposit that breaks the province's rule; null for Ontario (its card checks itself), no deposit, or none broken. */
export function depositIssue(province: ProvinceCode, rent: number, deposit: number | null | undefined): DepositIssue | null {
  const r = moveInRules(province)
  const dep = deposit != null && Number(deposit) > 0 ? Number(deposit) : null
  if (!r || dep == null) return null
  if (!r.deposit.allowed) return { kind: 'not_allowed' }
  const cap = r.deposit.maxMonths * (Number(rent) || 0)
  return rent > 0 && dep > cap + 0.5 ? { kind: 'over_cap', cap, months: r.deposit.maxMonths } : null
}

/** One short line for the deposit fact in the listing's policies grid; null when nothing is broken. */
export function depositNote(province: ProvinceCode, rent: number, deposit: number | null | undefined, zh: boolean): string | null {
  const issue = depositIssue(province, rent, deposit)
  if (!issue) return null
  const name = provinceName(province, zh)
  if (issue.kind === 'not_allowed') return zh ? `${name}不允许收取押金` : `${name} does not allow a deposit`
  return zh ? `超过${name}的上限（${monthsText(issue.months, true)}租金）` : `Above ${name}’s cap (${monthsText(issue.months, false)} rent)`
}

export type MoveInRow = { k: string; v: string; strong?: boolean; muted?: boolean; warn?: boolean }

export type MoveInView = { rows: MoveInRow[]; warning: string | null; notPermittedLead: string | null; notPermitted: string[]; footnote: string | null }

/** The card for a listing outside Ontario; null for Ontario or no rent. */
export function provinceMoveIn(province: ProvinceCode, rent: number, deposit: number | null | undefined, zh: boolean): MoveInView | null {
  const r: MoveInRules | null = moveInRules(province)
  const facts = rulesFor(province)
  if (!r || !facts || !rent || rent <= 0) return null
  const lang = zh ? 'zh' : 'en'
  const name = provinceName(province, zh)
  const dep = deposit != null && Number(deposit) > 0 ? Number(deposit) : null
  const issue = depositIssue(province, rent, deposit)
  const rows: MoveInRow[] = []

  rows.push({
    k: r.advanceRentMonths === 1
      ? (zh ? '首月租金（只能预收第一个月）' : 'First month’s rent (only the first month may be collected in advance)')
      : r.advanceRentMonths === 0
        ? (zh ? '首月租金（到期时支付）' : 'First month’s rent (paid when due)')
        : (zh ? '首月租金' : 'First month’s rent'),
    v: fmtMoney(rent),
  })

  if (!r.deposit.allowed) {
    const all = r.keyDeposit.allowed === false && !r.petDeposit.allowed
    rows.push({
      k: all ? (zh ? '押金（含钥匙押金、宠物押金）' : 'Deposit (key and pet deposits included)') : (zh ? '押金' : 'Deposit'),
      v: dep != null ? fmtMoney(dep) : (zh ? '不得收取' : 'Not permitted'),
      warn: dep != null,
      muted: dep == null,
    })
  } else {
    rows.push({
      k: zh ? `押金（最多${monthsText(r.deposit.maxMonths, true)}租金）` : `Deposit (max ${monthsText(r.deposit.maxMonths, false)} rent)`,
      v: dep != null ? fmtMoney(dep) : (zh ? '房东未设置' : 'Not set by landlord'),
      warn: issue?.kind === 'over_cap',
    })
    if (r.petDeposit.allowed) {
      rows.push(r.petDeposit.combinedWithDeposit
        ? { k: zh ? '宠物押金' : 'Pet deposit', v: zh ? '计入押金上限' : 'Counts toward the deposit cap', muted: true }
        : {
            k: zh ? `宠物押金（只在养宠物时，最多${monthsText(r.petDeposit.maxMonths, true)}租金）` : `Pet deposit (only with a pet; max ${monthsText(r.petDeposit.maxMonths, false)} rent)`,
            v: zh ? '以租约为准' : 'Per lease',
            muted: true,
          })
    }
    if (r.keyDeposit.countsTowardDeposit) {
      rows.push({ k: zh ? '钥匙押金' : 'Key deposit', v: zh ? '计入押金上限' : 'Counts toward the deposit cap', muted: true })
    } else if (r.keyDeposit.allowed === false) {
      rows.push({ k: zh ? '钥匙押金' : 'Key deposit', v: zh ? '不得收取' : 'Not permitted', muted: true })
    } else if (r.keyDeposit.allowed === true) {
      rows.push({ k: zh ? '钥匙或门禁卡费（可退，不超过更换成本）' : 'Key or fob fee (refundable, no more than replacement cost)', v: zh ? '以租约为准' : 'Per lease', muted: true })
    }
  }

  // A deposit the province does not allow is not part of what the tenant owes.
  const total = rent + (r.deposit.allowed && dep != null ? dep : 0)
  rows.push({ k: zh ? '第一笔款合计' : 'First payment total', v: fmtMoney(total), strong: true })

  const cite = factCitation(facts.deposit[lang])
  const tail = cite ? (zh ? `（${cite}）` : ` (${cite})`) : ''
  const warning = !issue
    ? null
    : issue.kind === 'not_allowed'
      ? (zh ? `此房源标注了押金，但${name}不允许收取任何押金${tail}。请与房东确认。` : `This listing states a deposit, but ${name} does not allow any deposit${tail}. Confirm with the landlord.`)
      : (zh
          ? `此房源标注的押金 ${fmtMoney(dep ?? 0)} 高于${name}允许的上限：${monthsText(issue.months, true)}租金（${fmtMoney(issue.cap)}）${tail}。请与房东确认。`
          : `The listed deposit of ${fmtMoney(dep ?? 0)} exceeds ${name}’s cap of ${monthsText(issue.months, false)} rent (${fmtMoney(issue.cap)})${tail}. Confirm with the landlord.`)

  const notPermitted = r.notPermitted.map((x) => x[lang])
  return {
    rows,
    warning,
    notPermittedLead: notPermitted.length ? (zh ? `${name}不允许：` : `Not permitted in ${name}: `) : null,
    notPermitted,
    footnote: r.footnote ? r.footnote[lang] : null,
  }
}

function ProvinceMoveInCosts({ zh, province, rent, deposit }: { zh: boolean; province: ProvinceCode; rent: number; deposit: number | null }) {
  const view = provinceMoveIn(province, rent, deposit, zh)
  if (!view) return null
  return (
    <ListingSection zh={zh} title={zh ? '入住前费用一览' : 'Move-in costs'} eyebrow="MOVE-IN COSTS">
      <div className="overflow-hidden rounded-xl border border-line-divider" data-testid="move-in-costs" data-province={province}>
        <dl className="text-[13.5px]">
          {view.rows.map((row) => <Row key={row.k} {...row} />)}
        </dl>
        {view.warning && (
          <div className="border-t border-line-divider bg-red-50 px-4 py-2.5 text-[12.5px] text-red-800">{view.warning}</div>
        )}
        {(view.notPermittedLead || view.footnote) && (
          <div className="border-t border-line-divider bg-surface-chip px-4 py-2.5 text-[12px] leading-relaxed text-body-3">
            {view.notPermittedLead && (
              <>
                {view.notPermittedLead}
                {view.notPermitted.map((b, i) => (
                  <span key={b}>
                    <s className="decoration-red-700/70">{b}</s>
                    {i < view.notPermitted.length - 1 ? ' · ' : ''}
                  </span>
                ))}
                {zh ? '。' : '. '}
              </>
            )}
            {view.footnote}
          </div>
        )}
      </div>
    </ListingSection>
  )
}

function Row({ k, v, strong, muted, warn }: { k: string; v: string; strong?: boolean; muted?: boolean; warn?: boolean }) {
  return (
    <div className={'flex items-baseline justify-between gap-4 px-4 py-2.5 [&+&]:border-t [&+&]:border-line-divider ' + (strong ? 'bg-surface font-bold text-body' : '')}>
      <dt className={'min-w-0 ' + (strong ? '' : 'text-body-2')}>{k}</dt>
      <dd className={'flex-none ' + (warn ? 'font-semibold text-red-700' : muted ? 'text-body-3' : strong ? '' : 'font-semibold text-body')}>{v}</dd>
    </div>
  )
}
