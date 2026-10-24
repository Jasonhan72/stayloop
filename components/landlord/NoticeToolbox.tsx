'use client'

// N 表工具箱 / Notice toolbox (V1.0 阶段 3 · 甲 #5). Five steps on one page:
// pick a lease → pick a form → fill the values (lease values marked
// 「来自租约」, typed values 「你填写」, every change recomputed) → open our
// own fill-in sheet and the official LTB PDF → record that the official form
// was served. The arithmetic is lib/ontario/noticeForms.ts (pure); this file
// is reading, state and rendering.
//
// Boundary (LSA s.1(5)): the four forms sit side by side at equal weight,
// nothing here suggests a form, a service method or whether to serve;
// the service-method select is neutral and only moves the deemed-service
// date. Official PDFs are linked, never fetched or embedded. Outside Ontario
// the page only points at that province's tribunal — no arithmetic.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOnChange } from '@/lib/ui/useOnChange'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { SectionCard, StatusPill } from '@/components/workspace'
import { writeAuditEvent } from '@/lib/agent/audit'
import { isoDate, parseDateOnly, todayUtc } from '@/lib/dates'
import { torontoDate, torontoDateTime } from '@/lib/household/ledger'
import { ledgerStart, rentLedger, type LedgerRow } from '@/lib/household/ledger'
import { rentSchedule } from '@/lib/household/schedule'
import { useT } from '@/lib/i18n'
import { isLeaseInForce, LEASE_STATE_LABEL, leaseDisplayState, type LeaseLike } from '@/lib/matters/states'
import {
  computeL1, computeN1, computeN12, computeN4, deemedServedOn, dueDayFromText, fillSheet,
  LTB_FORMS_INDEX, moneyText, N12_COMPENSATION_LABEL, N12_WHO_LABEL, noticeForm, NOTICE_FORMS,
  SERVICE_CITATION, SERVICE_METHODS, serviceMethodLabel, SHEET_BOUNDARY,
  type ComputeResult, type Flag, type N12Compensation, type N12Who, type NoticeCode, type ServiceMethod, type SheetField,
} from '@/lib/ontario/noticeForms'
import { ruleById } from '@/lib/ontario/rules'
import { provinceName, type ProvinceCode, type ProvinceRow } from '@/lib/provinces/detect'
import { leaseProvince, unitTermsOf } from '@/lib/provinces/lease'
import { rulesFor } from '@/lib/provinces/rules'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

type DbLease = {
  id: string; status: string | null; tenant_name: string | null; tenant_email: string | null; unit_label: string | null
  monthly_rent: number | string | null; start_date: string | null; end_date: string | null; terms: unknown; listing_id: string | null; landlord_id: string | null
}
type DbHousehold = { id: string; current_lease_id: string | null; previous_lease_id: string | null; rent_due_day: number | null; address: string | null; unit: string | null; city: string | null; monthly_rent: number | string | null; start_date: string | null }
type DbRent = { id: string; lease_id: string | null; due_date: string; status: string | null; paid_at: string | null; amount: number | string | null }
type ServiceRecord = { id: string; form: string; served_on: string; method: string; deemed_served_on: string; key_date: string | null; created_at: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ENDED_GRACE_DAYS = 90

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return n != null && Number.isFinite(n) ? n : 0
}

/** Leases a notice can be about: signed / in force / just ended (≤ 90 days), in-force first. */
export function orderLeasesForNotices(rows: DbLease[], today: Date = todayUtc()): DbLease[] {
  const rank = (l: DbLease): number => {
    const st = leaseDisplayState(l as LeaseLike, today)
    if (st === 'active') return 0
    if (st === 'upcoming') return 1
    if (st === 'ended') {
      const end = parseDateOnly(l.end_date)
      if (end && (today.getTime() - end.getTime()) / 86_400_000 <= ENDED_GRACE_DAYS) return 2
      return -1
    }
    return -1
  }
  return rows
    .map((l) => ({ l, r: rank(l) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || (a.l.end_date ?? '').localeCompare(b.l.end_date ?? ''))
    .map((x) => x.l)
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6" data-step={n}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-landlord">{String(n).padStart(2, '0')}</span>
        <h2 className="text-[15px] font-bold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

const FLAG_CLASS: Record<Flag['level'], string> = {
  block: 'border-red-300 bg-red-50 text-red-800',
  warn: 'border-amber-300 bg-amber-50 text-amber-800',
  info: 'border-line-divider bg-surface text-body-2',
}

function FlagList({ flags, zh }: { flags: Flag[]; zh: boolean }) {
  if (!flags.length) return null
  return (
    <ul className="mt-3 space-y-1.5" data-testid="notice-flags">
      {flags.map((f, i) => (
        <li key={i} className={`rounded-[8px] border px-3 py-2 text-[12.5px] leading-relaxed ${FLAG_CLASS[f.level]}`} data-level={f.level}>
          <b className="mr-1">{f.level === 'block' ? (zh ? '不符合' : 'Fails') : f.level === 'warn' ? (zh ? '请核对' : 'Check') : (zh ? '说明' : 'Note')}</b>
          {f[zh ? 'zh' : 'en']}
          {f.rule && <span className="ml-1 font-mono text-[10.5px] opacity-75">{ruleById(f.rule)?.statute ?? f.rule}</span>}
        </li>
      ))}
    </ul>
  )
}

const inputCls = 'sl-input w-full'
const SOURCE_TAG: Record<SheetField['source'], { zh: string; en: string; cls: string }> = {
  lease: { zh: '来自租约', en: 'From the lease', cls: 'bg-landlord/10 text-landlord' },
  input: { zh: '你填写', en: 'Entered by you', cls: 'bg-surface text-body-3' },
  computed: { zh: '按规则算出', en: 'Computed', cls: 'bg-surface text-body-3' },
}
function Field({ label, source, zh, children }: { label: string; source: SheetField['source']; zh: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-body">
        {label}
        <span className={`rounded-full px-1.5 py-px text-[10px] font-medium ${SOURCE_TAG[source].cls}`}>{SOURCE_TAG[source][zh ? 'zh' : 'en']}</span>
      </span>
      {children}
    </label>
  )
}

export default function NoticeToolbox() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const params = useSearchParams()
  const preselect = params.get('lease')

  const [leases, setLeases] = useState<DbLease[] | null>(null)
  const [households, setHouseholds] = useState<DbHousehold[]>([])
  const [listings, setListings] = useState<Record<string, ProvinceRow>>({})
  const [leaseId, setLeaseId] = useState<string | null>(null)
  const [form, setForm] = useState<NoticeCode | null>(null)
  const [rents, setRents] = useState<DbRent[]>([])
  const [records, setRecords] = useState<ServiceRecord[]>([])
  const [recording, setRecording] = useState(false)
  const [recordMsg, setRecordMsg] = useState<string | null>(null)

  // Toronto calendar day, not UTC: after 8 pm the UTC date is already tomorrow (site test 2026-10-17, D-F-01).
  const today = torontoDate()

  // ── Reads (caller's RLS client) ───────────────────────────────────────
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let cancelled = false
    ;(async () => {
      const [{ data: ls }, { data: hh }] = await Promise.all([
        supabase.from('lease_documents').select('id, status, tenant_name, tenant_email, unit_label, monthly_rent, start_date, end_date, terms, listing_id, landlord_id').limit(300),
        supabase.from('households').select('id, current_lease_id, previous_lease_id, rent_due_day, address, unit, city, monthly_rent, start_date').limit(300),
      ])
      if (cancelled) return
      const rows = orderLeasesForNotices(((ls ?? []) as DbLease[]))
      const listingIds = Array.from(new Set(rows.map((l) => l.listing_id).filter((x): x is string => !!x)))
      const { data: lst } = listingIds.length
        ? await supabase.from('listings').select('id, address, city, postal_code, province').in('id', listingIds)
        : { data: [] as (ProvinceRow & { id: string })[] }
      if (cancelled) return
      const byId: Record<string, ProvinceRow> = {}
      for (const r of (lst ?? []) as (ProvinceRow & { id: string })[]) byId[r.id] = r
      setListings(byId)
      setHouseholds((hh ?? []) as DbHousehold[])
      setLeases(rows)
      if (preselect && UUID_RE.test(preselect) && rows.some((l) => l.id === preselect)) setLeaseId(preselect)
    })()
    return () => { cancelled = true }
  }, [auth.loading, auth.user, preselect])

  const lease = useMemo(() => leases?.find((l) => l.id === leaseId) ?? null, [leases, leaseId])
  const household = useMemo(() => (lease ? households.find((h) => h.current_lease_id === lease.id || h.previous_lease_id === lease.id) ?? null : null), [households, lease])
  const province: ProvinceCode = useMemo(() => lease
    ? leaseProvince({ listing: lease.listing_id ? listings[lease.listing_id] ?? null : null, household, unit: unitTermsOf(lease.terms), unit_label: lease.unit_label })
    : 'ON', [lease, household, listings])
  const termsRent = (lease?.terms as { rent?: { due_day?: unknown; amount?: unknown } } | null)?.rent
  const dueDayKnown = household?.rent_due_day ?? dueDayFromText(termsRent?.due_day) ?? null
  const dueDay = dueDayKnown ?? 1
  const monthlyRent = num(lease?.monthly_rent) || num(household?.monthly_rent) || num(termsRent?.amount as number | string | null)
  const address = household ? [household.address, household.unit, household.city].filter(Boolean).join(' · ') : (lease?.unit_label ?? '')

  const loadLeaseData = useCallback(async (lid: string) => {
    const [{ data: rp }, { data: rec }] = await Promise.all([
      supabase.from('rent_payments').select('id, lease_id, due_date, status, paid_at, amount').eq('lease_id', lid).limit(120),
      supabase.from('notice_service_records').select('id, form, served_on, method, deemed_served_on, key_date, created_at').eq('lease_id', lid).order('created_at', { ascending: false }).limit(100),
    ])
    setRents((rp ?? []) as DbRent[])
    setRecords((rec ?? []) as ServiceRecord[])
  }, [])
  useOnChange(leaseId, () => { setRents([]); setRecords([]); setForm(null); setRecordMsg(null) })
  useEffect(() => {
    if (leaseId) void loadLeaseData(leaseId)
  }, [leaseId, loadLeaseData])

  // ── Per-form inputs ────────────────────────────────────────────────────
  const [servedOn, setServedOn] = useState(today)
  const [method, setMethod] = useState<ServiceMethod>('hand')
  const [n1, setN1] = useState({ newRent: '', effectiveOn: '', lastIncreaseOn: '', exempt: false })
  const [n4, setN4] = useState<{ terminationOn: string; picked: Record<string, boolean>; amounts: Record<string, string> }>({ terminationOn: '', picked: {}, amounts: {} })
  const [n12, setN12] = useState<{ terminationOn: string; who: N12Who; compensation: N12Compensation }>({ terminationOn: '', who: 'landlord', compensation: 'one_month' })
  const [l1, setL1] = useState({ n4TerminationOn: '', totalOwing: '' })
  useOnChange(`${form ?? ''}|${leaseId ?? ''}|${today}`, () => {
    setServedOn(today); setMethod('hand')
    setN1({ newRent: '', effectiveOn: '', lastIncreaseOn: '', exempt: false })
    setN4({ terminationOn: '', picked: {}, amounts: {} })
    setN12({ terminationOn: '', who: 'landlord', compensation: 'one_month' })
    setL1({ n4TerminationOn: '', totalOwing: '' })
  })

  // N4: periods the ledger says are unrecorded, from the same schedule the hub uses.
  const unpaid = useMemo(() => {
    if (!lease) return [] as { due: string; amount: number }[]
    const start = ledgerStart(household?.start_date, lease.start_date)
    const schedule = rentSchedule(start, dueDay, parseDateOnly(today)!, 0)
    const ledger = rentLedger(schedule, rents as LedgerRow[])
    const amountOf = new Map(rents.map((r) => [r.due_date.slice(0, 10), num(r.amount)]))
    return ledger.missed.map((due) => ({ due, amount: amountOf.get(due) || monthlyRent }))
  }, [lease, household, rents, dueDay, monthlyRent, today])

  const result: ComputeResult | null = useMemo(() => {
    if (!lease || !form) return null
    if (form === 'N1') {
      return computeN1({
        currentRent: monthlyRent, newRent: Number(n1.newRent) || 0, servedOn, method, effectiveOn: n1.effectiveOn,
        lastIncreaseOn: n1.lastIncreaseOn || null, leaseStart: lease.start_date, firstOccupiedAfter2018: n1.exempt, dueDay: dueDayKnown,
      })
    }
    if (form === 'N4') {
      const periods = unpaid.filter((p) => n4.picked[p.due]).map((p) => ({ due: p.due, amountOwed: n4.amounts[p.due] !== undefined && n4.amounts[p.due] !== '' ? Number(n4.amounts[p.due]) || 0 : p.amount }))
      return computeN4({ dueDay: dueDayKnown, monthlyRent, unpaidPeriods: periods, servedOn, method, terminationOn: n4.terminationOn })
    }
    if (form === 'N12') return computeN12({ servedOn, method, terminationOn: n12.terminationOn, dueDay: dueDayKnown, who: n12.who, compensationOffered: n12.compensation })
    return computeL1({ n4TerminationOn: l1.n4TerminationOn, today, totalOwing: l1.totalOwing === '' ? null : Number(l1.totalOwing) })
  }, [lease, form, monthlyRent, n1, n4, n12, l1, servedOn, method, dueDayKnown, unpaid, today])

  const l1Term = parseDateOnly(l1.n4TerminationOn)
  const keyDate = form === 'N1' ? n1.effectiveOn : form === 'N4' ? n4.terminationOn : form === 'N12' ? n12.terminationOn : l1Term ? isoDate(new Date(l1Term.getTime() + 86_400_000)) : ''
  const hasBlock = !!result?.flags.some((f) => f.level === 'block')
  const datesReady = !!keyDate && (form === 'L1' || !!servedOn)

  /** Lease-row fields (address, tenant, rent, due day) that head every sheet. */
  const leaseFields = (): SheetField[] => {
    if (!lease) return []
    const f: SheetField[] = [
      { key: 'unit', label: { zh: '出租单位地址', en: 'Address of the rental unit' }, value: address, source: 'lease' },
      { key: 'tenant', label: { zh: '租客姓名', en: 'Tenant name(s)' }, value: lease.tenant_name ?? '', source: 'lease' },
    ]
    if (form !== 'L1') f.push({ key: 'rent', label: { zh: '当前月租', en: 'Current monthly rent' }, value: monthlyRent ? moneyText(monthlyRent) : '', source: 'lease' })
    f.push({ key: 'due_day', label: { zh: '交租日', en: 'Rent due day' }, value: dueDayKnown ? (zh ? `每月 ${dueDayKnown} 号` : `the ${dueDayKnown} of each month`) : (zh ? '租约未写明（按 1 号计算）' : 'not stated on the lease (computed as the 1st)'), source: dueDayKnown ? 'lease' : 'computed' })
    return f
  }
  const sheetFields = (): SheetField[] => {
    if (!result) return []
    const translated = result.fields.map((f) => f.key === 'method' ? { ...f, value: serviceMethodLabel(f.value as ServiceMethod, lang) }
      : f.key === 'who' ? { ...f, value: N12_WHO_LABEL[f.value as N12Who][lang] }
      : f.key === 'compensation' ? { ...f, value: N12_COMPENSATION_LABEL[f.value as N12Compensation][lang] }
      : f)
    return [...leaseFields(), ...translated]
  }

  const openSheet = () => {
    if (!form || !result) return
    const html = fillSheet(noticeForm(form), sheetFields(), result.flags, lang, today)
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const win = window.open(url, '_blank')
    if (!win) window.location.assign(url)
  }

  const recordService = async () => {
    if (!lease || !form || !result || !auth.user || recording) return
    setRecording(true); setRecordMsg(null)
    const deemed = deemedServedOn(servedOn, method)
    const values = Object.fromEntries(sheetFields().map((f) => [f.key, f.value]))
    const { data, error } = await supabase.from('notice_service_records').insert({
      landlord_auth_id: auth.user.id, lease_id: lease.id, form, served_on: servedOn, method, deemed_served_on: deemed, key_date: keyDate || null,
      values, flags: result.flags,
    }).select('id').maybeSingle()
    if (error || !data) {
      setRecordMsg(zh ? `没能记录：${error?.message ?? 'unknown'}` : `Could not record: ${error?.message ?? 'unknown'}`)
      setRecording(false)
      return
    }
    await writeAuditEvent(supabase, {
      actorId: auth.user.id, action: 'notice_served_recorded', targetType: 'notice_service_record', targetId: data.id, actingRole: 'landlord',
      metadata: { lease_id: lease.id, form, served_on: servedOn, method, deemed_served_on: deemed, key_date: keyDate || null },
    })
    setRecordMsg(zh ? '已记录。送达记录只能追加，不能修改或删除。' : 'Recorded. Service records are append-only: they cannot be edited or deleted.')
    setRecording(false)
    await loadLeaseData(lease.id)
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const stateLabel = (l: DbLease) => LEASE_STATE_LABEL[leaseDisplayState(l as LeaseLike)][zh ? 'shortZh' : 'shortEn']
  const provRules = province !== 'ON' ? rulesFor(province) : null

  return (
    <div className="mx-auto max-w-[960px]">
      <div className="rounded-[10px] border border-line-divider bg-white px-4 py-3 text-[12.5px] leading-relaxed text-body-2" data-testid="notice-boundary">
        {SHEET_BOUNDARY[lang]}{' '}
        {zh ? <>四张表并列、同等对待：选哪张、怎么送达、要不要发，都由你决定。送达方式按 {SERVICE_CITATION} 列出，只影响日期算术。</> : <>The four forms are listed side by side at equal weight: which one, how to serve it and whether to serve it are your decisions. Service methods are listed per {SERVICE_CITATION} and only change the date arithmetic.</>}{' '}
        <a href={LTB_FORMS_INDEX} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">{zh ? 'LTB 表格索引 ↗' : 'LTB forms index ↗'}</a>
      </div>

      <Step n={1} title={zh ? '选租约' : 'Pick a lease'}>
        {leases === null ? (
          <div className="text-[12.5px] text-body-3">…</div>
        ) : leases.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-line-strong bg-white px-4 py-6 text-center text-[12.5px] text-body-3">
            {zh ? '还没有已签或生效中的租约。' : 'No signed or in-force lease yet.'}{' '}
            <Link href="/landlord/leases" className="font-semibold text-brand hover:underline">{zh ? '去租约页 →' : 'Go to leases →'}</Link>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={zh ? '选租约' : 'Pick a lease'}>
            {leases.map((l) => {
              const h = households.find((x) => x.current_lease_id === l.id || x.previous_lease_id === l.id)
              const sel = l.id === leaseId
              return (
                <button key={l.id} type="button" role="radio" aria-checked={sel} onClick={() => setLeaseId(l.id)}
                  className={`rounded-[10px] border bg-white px-3 py-2.5 text-left transition ${sel ? 'border-landlord ring-2 ring-landlord/20' : 'border-line-divider hover:border-landlord/50'}`} data-testid="notice-lease-option">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-[13px] font-semibold">{h ? [h.address, h.unit].filter(Boolean).join(' · ') : (l.unit_label || '—')}</div>
                    <StatusPill tone={isLeaseInForce(l as LeaseLike) ? 'ok' : 'neutral'}>{stateLabel(l)}</StatusPill>
                  </div>
                  <div className="mt-0.5 text-[12px] text-body-2">{l.tenant_name || '—'} · {num(l.monthly_rent) ? moneyText(num(l.monthly_rent)) : '—'}{zh ? '/月' : '/mo'}</div>
                  <div className="mt-0.5 text-[11.5px] text-body-3">{l.start_date ?? '—'} → {l.end_date ?? (zh ? '月租' : 'monthly')} · {zh ? '交租日' : 'due'} {h?.rent_due_day ?? dueDayFromText((l.terms as { rent?: { due_day?: unknown } } | null)?.rent?.due_day) ?? '—'}</div>
                </button>
              )
            })}
          </div>
        )}
      </Step>

      {lease && province !== 'ON' && (
        <div className="mt-6 rounded-[10px] border border-line-divider bg-white px-4 py-4 text-[13px] text-body" data-testid="notice-province-note">
          <div className="font-semibold">{provinceName(province, zh)}</div>
          <p className="mt-1 text-body-2">
            {zh ? `这份租约的房源在${provinceName(province, true)}。该省的通知须用该省的表格与规则；本页的安省表格与日期算术不适用。` : `This lease is for a home in ${provinceName(province, false)}. Notices there use that province's forms and rules; the Ontario forms and date arithmetic on this page do not apply.`}
          </p>
          {provRules && (
            <a href={provRules.tribunal.url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-brand hover:underline">{provRules.tribunal[lang]} ↗</a>
          )}
        </div>
      )}

      {lease && province === 'ON' && (
        <>
          <Step n={2} title={zh ? '选表' : 'Pick a form'}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label={zh ? '选表' : 'Pick a form'} data-testid="notice-form-cards">
              {NOTICE_FORMS.map((f) => {
                const sel = f.code === form
                return (
                  <button key={f.code} type="button" role="radio" aria-checked={sel} onClick={() => setForm(f.code)}
                    className={`flex min-h-[150px] flex-col rounded-[10px] border bg-white px-3 py-3 text-left transition ${sel ? 'border-landlord ring-2 ring-landlord/20' : 'border-line-divider hover:border-landlord/50'}`} data-testid={`notice-form-${f.code}`}>
                    <div className="font-mono text-[11px] font-bold text-landlord">{f.code}</div>
                    <div className="mt-0.5 text-[13px] font-semibold leading-snug">{f.title[lang].replace(/^\w+ · /, '')}</div>
                    <div className="mt-1.5 text-[11.5px] leading-snug text-body-3">{f.what[lang]}</div>
                    <div className="mt-auto pt-2 text-[10.5px] text-body-3">{f.versionLabel[lang]}</div>
                  </button>
                )
              })}
            </div>
          </Step>

          {form && (
            <Step n={3} title={zh ? '填值' : 'Fill in the values'}>
              <SectionCard>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={zh ? '出租单位' : 'Rental unit'} source="lease" zh={zh}><div className="text-[13px]">{address || '—'}</div></Field>
                  <Field label={zh ? '租客' : 'Tenant'} source="lease" zh={zh}><div className="text-[13px]">{lease.tenant_name || '—'}</div></Field>
                  {form !== 'L1' && <Field label={zh ? '当前月租' : 'Current monthly rent'} source="lease" zh={zh}><div className="text-[13px]">{monthlyRent ? moneyText(monthlyRent) : '—'}</div></Field>}
                  <Field label={zh ? '交租日' : 'Rent due day'} source={dueDayKnown ? 'lease' : 'computed'} zh={zh}><div className="text-[13px]">{dueDayKnown ? (zh ? `每月 ${dueDayKnown} 号` : `the ${dueDayKnown} of each month`) : (zh ? '租约未写明 · 按 1 号计算' : 'not on the lease · computed as the 1st')}</div></Field>

                  {form !== 'L1' && (
                    <>
                      <Field label={zh ? '送达日' : 'Date served'} source="input" zh={zh}><input type="date" className={inputCls} value={servedOn} onChange={(e) => setServedOn(e.target.value)} data-testid="notice-served-on" /></Field>
                      <Field label={zh ? '送达方式' : 'Service method'} source="input" zh={zh}>
                        <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as ServiceMethod)} data-testid="notice-method">
                          {SERVICE_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label[lang]}</option>)}
                        </select>
                        <span className="mt-1 block text-[11px] text-body-3">{SERVICE_CITATION} · {zh ? `视为送达日 ${deemedServedOn(servedOn, method) || '—'}` : `deemed served ${deemedServedOn(servedOn, method) || '—'}`}</span>
                      </Field>
                    </>
                  )}

                  {form === 'N1' && (
                    <>
                      <Field label={zh ? '新租金（每月）' : 'New rent (monthly)'} source="input" zh={zh}><input type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={n1.newRent} onChange={(e) => setN1({ ...n1, newRent: e.target.value })} data-testid="n1-new-rent" /></Field>
                      <Field label={zh ? '生效日' : 'Effective date'} source="input" zh={zh}><input type="date" className={inputCls} value={n1.effectiveOn} onChange={(e) => setN1({ ...n1, effectiveOn: e.target.value })} data-testid="n1-effective-on" /></Field>
                      <Field label={zh ? '上次涨租日（没有就留空，按起租日算）' : 'Last increase (leave blank to use the lease start)'} source="input" zh={zh}><input type="date" className={inputCls} value={n1.lastIncreaseOn} onChange={(e) => setN1({ ...n1, lastIncreaseOn: e.target.value })} /></Field>
                      <label className="flex items-start gap-2 pt-5 text-[12.5px]">
                        <input type="checkbox" className="mt-0.5" checked={n1.exempt} onChange={(e) => setN1({ ...n1, exempt: e.target.checked })} data-testid="n1-exempt" />
                        <span>{zh ? '这个单位是 2018-11-15 之后首次用于居住（RTA s.6.1 豁免单位）' : 'This unit was first occupied for residential purposes after 2018-11-15 (RTA s.6.1 exempt unit)'}<span className={`ml-1 rounded-full px-1.5 py-px text-[10px] ${SOURCE_TAG.input.cls}`}>{SOURCE_TAG.input[zh ? 'zh' : 'en']}</span></span>
                      </label>
                    </>
                  )}

                  {form === 'N4' && (
                    <>
                      <div className="sm:col-span-2">
                        <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold">{zh ? '欠款租期（租金记录里没有记为已付的账期）' : 'Unpaid rent periods (periods the rent ledger has no payment for)'}<span className={`rounded-full px-1.5 py-px text-[10px] ${SOURCE_TAG.lease.cls}`}>{zh ? '来自租金记录' : 'From the rent ledger'}</span></div>
                        {unpaid.length === 0 ? (
                          <div className="rounded-[8px] border border-dashed border-line-strong px-3 py-3 text-[12.5px] text-body-3">{household ? (zh ? '租金记录里没有未记录的到期账期。' : 'The rent ledger has no unrecorded past-due period.') : (zh ? '这份租约没有在管租约，没有租金记录可读；账期按租约起租日与交租日推算。' : 'This lease has no managed tenancy, so there is no rent ledger to read; periods are derived from the lease start and due day.')}</div>
                        ) : (
                          <ul className="space-y-1.5" data-testid="n4-periods">
                            {unpaid.map((p) => (
                              <li key={p.due} className="flex flex-wrap items-center gap-3 rounded-[8px] border border-line-divider bg-white px-3 py-2 text-[12.5px]">
                                <label className="flex items-center gap-2"><input type="checkbox" checked={!!n4.picked[p.due]} onChange={(e) => setN4({ ...n4, picked: { ...n4.picked, [p.due]: e.target.checked } })} /> {zh ? '到期' : 'Due'} {p.due}</label>
                                <span className="ml-auto flex items-center gap-1 text-[12px]">$<input type="number" inputMode="decimal" min={0} step="0.01" className="sl-input !w-[120px]" value={n4.amounts[p.due] ?? String(p.amount)} onChange={(e) => setN4({ ...n4, amounts: { ...n4.amounts, [p.due]: e.target.value } })} aria-label={zh ? '欠款金额' : 'Amount owed'} /></span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Field label={zh ? '终止日（付清或搬离）' : 'Termination date (pay or move out by)'} source="input" zh={zh}><input type="date" className={inputCls} value={n4.terminationOn} onChange={(e) => setN4({ ...n4, terminationOn: e.target.value })} data-testid="n4-termination-on" /></Field>
                    </>
                  )}

                  {form === 'N12' && (
                    <>
                      <Field label={zh ? '谁要入住' : 'Who will occupy'} source="input" zh={zh}>
                        <select className={inputCls} value={n12.who} onChange={(e) => setN12({ ...n12, who: e.target.value as N12Who })} data-testid="n12-who">
                          {(Object.keys(N12_WHO_LABEL) as N12Who[]).map((k) => <option key={k} value={k}>{N12_WHO_LABEL[k][lang]}</option>)}
                        </select>
                      </Field>
                      <Field label={zh ? '补偿' : 'Compensation'} source="input" zh={zh}>
                        <select className={inputCls} value={n12.compensation} onChange={(e) => setN12({ ...n12, compensation: e.target.value as N12Compensation })} data-testid="n12-compensation">
                          {(Object.keys(N12_COMPENSATION_LABEL) as N12Compensation[]).map((k) => <option key={k} value={k}>{N12_COMPENSATION_LABEL[k][lang]}</option>)}
                        </select>
                      </Field>
                      <Field label={zh ? '终止日（须为租期末日）' : 'Termination date (last day of a rental period)'} source="input" zh={zh}><input type="date" className={inputCls} value={n12.terminationOn} onChange={(e) => setN12({ ...n12, terminationOn: e.target.value })} data-testid="n12-termination-on" /></Field>
                    </>
                  )}

                  {form === 'L1' && (
                    <>
                      <Field label={zh ? 'N4 上的终止日' : 'Termination date on the N4'} source="input" zh={zh}><input type="date" className={inputCls} value={l1.n4TerminationOn} onChange={(e) => setL1({ ...l1, n4TerminationOn: e.target.value })} data-testid="l1-n4-termination-on" /></Field>
                      <Field label={zh ? '申请书上的欠款合计（可留空）' : 'Total owing on the application (optional)'} source="input" zh={zh}><input type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={l1.totalOwing} onChange={(e) => setL1({ ...l1, totalOwing: e.target.value })} /></Field>
                      <Field label={zh ? '今天' : 'Today'} source="computed" zh={zh}><div className="text-[13px]">{today}</div></Field>
                    </>
                  )}
                </div>

                {result && (
                  <div className="mt-4">
                    <div className="grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2" data-testid="notice-computed">
                      {result.fields.filter((f) => f.source === 'computed').map((f) => (
                        <div key={f.key} className="flex justify-between gap-3 border-b border-line-divider py-1"><span className="text-body-3">{f.label[lang]}</span><span className="font-semibold">{f.value || '—'}</span></div>
                      ))}
                    </div>
                    <FlagList flags={result.flags} zh={zh} />
                  </div>
                )}
              </SectionCard>
            </Step>
          )}

          {form && result && (
            <Step n={4} title={zh ? '填写稿与官方表格' : 'Fill-in sheet and the official form'}>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={openSheet} disabled={!datesReady} className="sl-btn-primary !px-4 !py-[9px] !text-[13px] disabled:opacity-40" data-testid="notice-open-sheet">
                  {zh ? '打开填写稿（可打印）' : 'Open the fill-in sheet (printable)'}
                </button>
                <a href={noticeForm(form).official.form} target="_blank" rel="noreferrer" className="rounded-full border border-line-strong bg-white px-4 py-[9px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand" data-testid="notice-official-form">{zh ? `官方表格 ${form} ↗` : `Official form ${form} ↗`}</a>
                {noticeForm(form).official.instructions && (
                  <a href={noticeForm(form).official.instructions} target="_blank" rel="noreferrer" className="rounded-full border border-line-strong bg-white px-4 py-[9px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand">{zh ? '填写说明 ↗' : 'Instructions ↗'}</a>
                )}
              </div>
              <p className="mt-2 text-[11.5px] text-body-3">
                {hasBlock ? (zh ? '填写稿会把不符合规则的值标红。' : 'Values that fail a rule are shown in red on the sheet.') : null}{' '}
                {zh ? '填写稿是 Stayloop 自己的文件；官方表格是 LTB 的 PDF，在新标签页打开，Stayloop 不改动它。' : 'The sheet is Stayloop’s own document; the official form is the LTB’s PDF, opened in a new tab and never altered by Stayloop.'}
              </p>
            </Step>
          )}

          {form && result && form !== 'L1' && (
            <Step n={5} title={zh ? '记录送达' : 'Record the service'}>
              <SectionCard>
                <p className="text-[13px]">
                  {zh ? <>我已把官方表格 <b>{form}</b> 于 <b>{servedOn || '—'}</b> 以「<b>{serviceMethodLabel(method, lang)}</b>」送达{keyDate ? <>，{form === 'N1' ? '生效日' : '终止日'} <b>{keyDate}</b></> : null}。</> : <>I served the official form <b>{form}</b> on <b>{servedOn || '—'}</b> by “<b>{serviceMethodLabel(method, lang)}</b>”{keyDate ? <>, {form === 'N1' ? 'effective' : 'termination date'} <b>{keyDate}</b></> : null}.</>}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void recordService()} disabled={recording || !datesReady} className="rounded-full border border-line-strong bg-white px-4 py-[9px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand disabled:opacity-40" data-testid="notice-record-service">
                    {recording ? '…' : (zh ? '记录这次送达' : 'Record this service')}
                  </button>
                  {recordMsg && <span className="text-[12.5px] text-body-2" data-testid="notice-record-msg">{recordMsg}</span>}
                </div>
                <p className="mt-2 text-[11.5px] text-body-3">{zh ? '记录的是你自己的送达动作；Stayloop 不代送达，也不出具送达证明。' : 'This records your own act of service; Stayloop does not serve notices or issue certificates of service.'}</p>
              </SectionCard>
            </Step>
          )}

          <section className="mt-8" data-testid="notice-records">
            <h2 className="text-[13px] font-bold">{zh ? '这份租约的送达记录' : 'Service records for this lease'}</h2>
            {records.length === 0 ? (
              <div className="mt-2 text-[12.5px] text-body-3">{zh ? '还没有记录。' : 'None yet.'}</div>
            ) : (
              <ul className="mt-2 divide-y divide-line-divider rounded-[10px] border border-line-divider bg-white">
                {records.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12.5px]">
                    <span className="font-mono text-[11px] font-bold text-landlord">{r.form}</span>
                    <span>{zh ? '送达' : 'served'} {r.served_on} · {serviceMethodLabel(r.method as ServiceMethod, lang)} · {zh ? '视为送达' : 'deemed'} {r.deemed_served_on}</span>
                    {r.key_date && <span className="text-body-2">{r.form === 'N1' ? (zh ? '生效' : 'effective') : r.form === 'L1' ? (zh ? '最早提交' : 'earliest filing') : (zh ? '终止' : 'termination')} {r.key_date}</span>}
                    <span className="ml-auto text-[11px] text-body-3">{torontoDateTime(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-body-3">{zh ? '只追加，不可修改或删除。' : 'Append-only: records cannot be edited or deleted.'}</p>
          </section>
        </>
      )}
    </div>
  )
}
