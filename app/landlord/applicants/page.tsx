'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AIProactive, { type AIInsight } from '@/components/AIProactive'
import LandlordThreeSteps from '@/components/landlord/LandlordThreeSteps'
import StampBadge from '@/components/StampBadge'
import WorkspaceShell from '@/components/WorkspaceShell'
import {
  AsideBlock,
  PageHeader,
  SectionCard,
  StatStrip,
  StatusPill,
  Table,
  Td,
  Tr,
  type PillTone,
} from '@/components/workspace'
import { useAIName } from '@/lib/aiName'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'
import { useT, type Lang } from '@/lib/i18n'
import type { ApplicationFile } from '@/types'
import { downloadCsv, toCsv } from '@/lib/csv'

type Decision = 'approve' | 'review' | 'decline'

interface Applicant {
  id: string
  name: string
  initial: string
  avc: 'tenant' | 'agent' | 'landlord' | 'orange'
  match: number | null
  tier: 1 | 2 | 3 | 4
  income: number | null
  qual: { zh: string; en: string }
  decision: Decision
  unitLabel: string | null
}

// Design-canon sample rows — shown only when the landlord has zero real
// applications, so the page still demonstrates the grouped layout.
const DEMO_APPS: Applicant[] = [
  { id: '1', name: 'Mia Chen',     initial: 'M', avc: 'tenant',   match: 92, tier: 3, income: 11200, qual: { zh: '收入 ✓ 信用 ✓ 法庭 ✓', en: 'Income ✓ Credit ✓ Court ✓' }, decision: 'approve', unitLabel: null },
  { id: '2', name: 'David Park',   initial: 'D', avc: 'agent',    match: 87, tier: 3, income: 9800,  qual: { zh: '收入 ✓ 信用 ✓ 上家 5⭐', en: 'Income ✓ Credit ✓ Prior landlord 5⭐' }, decision: 'approve', unitLabel: null },
  { id: '3', name: 'Karen Liu',    initial: 'K', avc: 'landlord', match: 84, tier: 3, income: 12300, qual: { zh: '收入 ✓ 信用 ✓ 自雇', en: 'Income ✓ Credit ✓ Self-employed' }, decision: 'approve', unitLabel: null },
  { id: '4', name: 'Lina Chen',    initial: 'L', avc: 'orange',   match: 81, tier: 2, income: 8900,  qual: { zh: '材料齐 · 短租意向 · 可议', en: 'Docs complete · short-term intent · negotiable' }, decision: 'review', unitLabel: null },
  { id: '5', name: 'Tom Zhao',     initial: 'T', avc: 'tenant',   match: 64, tier: 2, income: 7200,  qual: { zh: '近 1 年 LTB 1 起 (已结案)', en: '1 LTB case in past year (closed)' }, decision: 'review', unitLabel: null },
  { id: '6', name: 'Anna Brooks',  initial: 'A', avc: 'agent',    match: 41, tier: 1, income: 5400,  qual: { zh: '未盖 收入章 · 仅身份章', en: 'No income stamp yet · identity stamp only' }, decision: 'decline', unitLabel: null },
]

const SECTIONS: { decision: Decision; label: { zh: string; en: string }; tone: PillTone }[] = [
  { decision: 'approve', label: { zh: '推荐审批', en: 'Recommended' }, tone: 'ok' },
  { decision: 'review',  label: { zh: '需面谈', en: 'Needs interview' }, tone: 'warn' },
  { decision: 'decline', label: { zh: '不达标', en: 'Below threshold' }, tone: 'danger' },
]

const AVC_CYCLE = ['tenant', 'agent', 'landlord', 'orange'] as const

// The landlord's own screening policy, as the applicants above were sorted by.
// Every rule here is about ability to perform the tenancy (documented income,
// credit, debt load, term) — never a personal characteristic. The OHRC notice
// under the list is the same wording the decision screen carries.
const POLICY: { rule: { zh: string; en: string }; hit?: { zh: string; en: string } }[] = [
  {
    rule: { zh: '需银行章起申（Unit 1207 提至银行章）', en: 'Bank stamp required to apply (Unit 1207 raised to bank stamp)' },
    hit: { zh: '命中 3 / 未达 3', en: '3 meet / 3 below' },
  },
  { rule: { zh: '信用 ≥ 720', en: 'Credit ≥ 720' }, hit: { zh: '命中 4', en: '4 meet' } },
  { rule: { zh: 'DTI ≤ 35%', en: 'DTI ≤ 35%' }, hit: { zh: '命中 5', en: '5 meet' } },
  { rule: { zh: '12 个月起租，拒绝 < 6 个月', en: 'Minimum 12-month term; under 6 months declined' } },
  { rule: { zh: '猫 ✓ · 小型犬 ✓（安省禁止收宠物押金，禁养条款无效）', en: 'Cats ✓ · small dogs ✓ (Ontario bans pet deposits; no-pet clauses are void)' } },
]

// Applications that already have a decision — kept visible so the audit trail
// is on the same page as the queue.
const DECIDED: {
  name: string
  unit: string
  decision: { zh: string; en: string }
  tone: PillTone
  date: string
  followUp?: { zh: string; en: string }
}[] = [
  {
    name: 'Mia Chen',
    unit: 'Unit 1207',
    decision: { zh: '已批准', en: 'Approved' },
    tone: 'ok',
    date: '5/14',
    followUp: { zh: '已发租约 L-202', en: 'Lease L-202 sent' },
  },
  {
    name: 'Anna Brooks',
    unit: 'Unit 1207',
    decision: { zh: '已通知不符合', en: 'Notified — below threshold' },
    tone: 'neutral',
    date: '5/12',
  },
]

// Inquiry → lease funnel for the listing this queue belongs to.
const FUNNEL: { stage: { zh: string; en: string }; n: number }[] = [
  { stage: { zh: '询盘', en: 'Inquiries' }, n: 8 },
  { stage: { zh: '完整申请', en: 'Complete applications' }, n: 6 },
  { stage: { zh: '达标', en: 'Meet threshold' }, n: 3 },
  { stage: { zh: '面谈', en: 'Interviewed' }, n: 2 },
  { stage: { zh: '发租约', en: 'Lease sent' }, n: 1 },
]

type AppRow = {
  id: string
  first_name: string | null
  last_name: string | null
  ai_extracted_name: string | null
  monthly_income: number | null
  ai_score: number | null
  status: string | null
  created_at: string
  files: ApplicationFile[] | null
  ltb_records_found: number | null
  listing: { address: string | null; unit: string | null; monthly_rent: number | null } | null
}

// Decision grouping mirrors the design's three buckets. Explicit landlord
// decisions win; otherwise the AI score sorts the bucket.
function deriveDecision(row: AppRow): Decision {
  if (row.status === 'approved') return 'approve'
  if (row.status === 'declined') return 'decline'
  if (row.ai_score == null) return 'review'
  if (row.ai_score >= 75) return 'approve'
  if (row.ai_score >= 50) return 'review'
  return 'decline'
}

// Evidence-based tier: 1 = form only, 2 = documents uploaded, 3 = documents
// + completed AI screening. (Passport tiers live tenant-side; applications
// only carry the evidence actually submitted.)
function deriveTier(row: AppRow): 1 | 2 | 3 {
  if (!row.files?.length) return 1
  return row.ai_score != null ? 3 : 2
}

function qualLine(row: AppRow): { zh: string; en: string } {
  if (row.ai_score == null) {
    const n = row.files?.length ?? 0
    return n > 0
      ? { zh: `材料 ${n} 份 · AI 评分中`, en: `${n} documents · AI scoring in progress` }
      : { zh: '仅表单 · 未上传材料', en: 'Form only · no documents uploaded' }
  }
  const rent = row.listing?.monthly_rent
  const incomeOk = row.monthly_income != null && rent ? row.monthly_income >= rent * 3 : null
  const parts_zh: string[] = []
  const parts_en: string[] = []
  if (incomeOk != null) {
    parts_zh.push(incomeOk ? '收入 ✓' : '收入 ⚠︎')
    parts_en.push(incomeOk ? 'Income ✓' : 'Income ⚠︎')
  }
  const ltb = row.ltb_records_found ?? 0
  parts_zh.push(ltb === 0 ? '法庭 ✓' : `LTB ${ltb} 起`)
  parts_en.push(ltb === 0 ? 'Court ✓' : `${ltb} LTB record${ltb > 1 ? 's' : ''}`)
  const n = row.files?.length ?? 0
  parts_zh.push(`材料 ${n} 份`)
  parts_en.push(`${n} docs`)
  return { zh: parts_zh.join(' · '), en: parts_en.join(' · ') }
}

function toApplicant(row: AppRow, idx: number): Applicant {
  const name = (row.ai_extracted_name || `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim()) || '—'
  const unitLabel = row.listing
    ? [row.listing.unit ? `Unit ${row.listing.unit}` : null, row.listing.address].filter(Boolean).join(' · ') || null
    : null
  return {
    id: row.id,
    name,
    initial: (name[0] || '?').toUpperCase(),
    avc: AVC_CYCLE[idx % AVC_CYCLE.length],
    match: row.ai_score,
    tier: deriveTier(row),
    income: row.monthly_income,
    qual: qualLine(row),
    decision: deriveDecision(row),
    unitLabel,
  }
}

function exportCsv(apps: Applicant[], zh: boolean) {
  const header = zh
    ? ['姓名', '匹配分', '已盖章数', '月收入', '分组', '房源']
    : ['Name', 'Match', 'Stamps', 'Monthly income', 'Group', 'Listing']
  const csv = toCsv(
    header,
    apps.map((a) => [a.name, a.match ?? '', a.tier, a.income ?? '', a.decision, a.unitLabel ?? '']),
  )
  downloadCsv('stayloop-applicants.csv', csv)
}

export default function LandlordApplicantsPage() {
  const { lang } = useT()
  const aiName = useAIName('landlord')
  const { user, loading: authLoading } = useAuth()
  const [rows, setRows] = useState<AppRow[] | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setRows([])
      return
    }
    let cancelled = false
    ;(async () => {
      // Ownership scoping is RLS ("Landlords see own applications") — no
      // hard filter by user id here (dual-ID invariant).
      const { data, error } = await supabase
        .from('applications')
        .select('id, first_name, last_name, ai_extracted_name, monthly_income, ai_score, status, created_at, files, ltb_records_found, listing:listings(address, unit, monthly_rent)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (!cancelled) setRows(error ? [] : ((data ?? []) as unknown as AppRow[]))
    })()
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  const liveMode = !!rows && rows.length > 0
  const apps = useMemo(
    () => (liveMode ? rows!.map(toApplicant) : DEMO_APPS),
    [liveMode, rows],
  )

  const eyebrow = liveMode
    ? `APPLICANTS · ${(apps.find((a) => a.unitLabel)?.unitLabel || 'ALL LISTINGS').toUpperCase()}`
    : 'APPLICANTS · UNIT 1207 · KING WEST'

  // Queue health. Derived from the real rows when they exist; the design-canon
  // numbers stand in while the page is showing sample data.
  const undecided = liveMode ? rows!.filter((r) => r.status !== 'approved' && r.status !== 'declined') : []
  const pendingCount = liveMode ? undecided.length : 4
  const leasesSent = liveMode ? rows!.filter((r) => r.status === 'approved').length : 1
  const avgWaitHours = liveMode
    ? undecided.length === 0
      ? 0
      : Math.max(
          0,
          Math.round(
            undecided.reduce((s, r) => s + (Date.now() - new Date(r.created_at).getTime()), 0) /
              undecided.length /
              3_600_000,
          ),
        )
    : 26

  const topScored = liveMode ? apps.filter((a) => a.match != null).sort((a, b) => (b.match ?? 0) - (a.match ?? 0))[0] : null
  const insights: AIInsight[] = liveMode
    ? [
        topScored
          ? {
              text: {
                zh: `${topScored.name} 目前评分最高（${topScored.match}/100）。优质申请人平均 48 小时内会接受其他 offer — 建议尽快决定。`,
                en: `${topScored.name} currently scores highest (${topScored.match}/100). Strong applicants typically accept another offer within 48 hours — decide soon.`,
              },
              action: {
                label: { zh: '让 {ai} 给决策包', en: 'Get the decision pack' },
                prompt: {
                  zh: `给我 ${topScored.name} 的一页式决策包：收入、历史、红旗、建议都要。`,
                  en: `Give me a one-page decision pack on ${topScored.name}: income, history, red flags and your recommendation.`,
                },
              },
            }
          : {
              text: {
                zh: '新申请已收到，AI 评分完成后会自动分组。{ai} 可以先帮你按政策预筛一遍。',
                en: 'New applications received — they will be grouped automatically once AI scoring completes. {ai} can pre-screen them against your policy now.',
              },
              action: {
                label: { zh: '让 {ai} 预筛', en: 'Pre-screen now' },
                prompt: {
                  zh: '帮我按 信用/收入/法庭记录 政策预筛一遍现有申请。',
                  en: 'Pre-screen my current applications against my credit / income / court-record policy.',
                },
              },
            },
      ]
    : [
        {
          text: {
            zh: 'Mia Chen 收入 4.2× 租金、8 维尽调无红旗，已等待 26 小时 — 优质申请人平均 48 小时内会接受其他 offer。',
            en: 'Mia Chen earns 4.2× rent with zero red flags across 8 axes, waiting 26 hours — strong applicants typically accept another offer within 48.',
          },
          action: {
            label: { zh: '让 {ai} 给决策包', en: 'Get the decision pack' },
            prompt: {
              zh: '给我 Mia Chen 的一页式决策包：收入、历史、红旗、建议都要。',
              en: 'Give me a one-page decision pack on Mia Chen: income, history, red flags and your recommendation.',
            },
          },
        },
        {
          text: {
            zh: '2 份申请缺推荐信。{ai} 可以代你追要材料，并设好 48 小时跟进提醒。',
            en: 'Two applications are missing references. {ai} can chase the documents and set a 48-hour follow-up.',
          },
          action: {
            label: { zh: '代我追材料', en: 'Chase documents' },
            prompt: {
              zh: '帮我向缺推荐信的申请人追要材料，并设置 48 小时跟进提醒。',
              en: 'Chase the missing references from those applicants and set a 48-hour follow-up reminder.',
            },
          },
        },
      ]

  return (
    <WorkspaceShell
      role="landlord"
      aside={<RailAside lang={lang} insights={insights} showFunnel={!liveMode} />}
    >
      <PageHeader
        title={lang === 'zh' ? `${apps.length} 份申请 · ${aiName} 已分组` : `${apps.length} applications · grouped by ${aiName}`}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-brand">{eyebrow}</span>
            <span className="mx-1.5 text-body-3">·</span>
            {liveMode
              ? lang === 'zh'
                ? '按默认门槛（需银行章 / 信用 ≥ 720 / DTI ≤ 35%）分组 —— 这是推荐模板，不是你设定的政策。点开任一申请查看完整六维评分 + 文件。'
                : 'Grouped by the default thresholds (bank stamp / credit ≥ 720 / DTI ≤ 35%) — a suggested template, not a policy you set. Open any application for the full six-dimension score and documents.'
              : lang === 'zh'
                ? '按你的 需银行章 / 信用 ≥ 720 / DTI ≤ 35% 政策，已分入 3 组。点开任一申请查看完整六维评分 + 文件。'
                : 'Sorted into 3 groups by your policy (bank stamp required / credit ≥ 720 / DTI ≤ 35%). Open any application to see the full six-dimension score and documents.'}
            {!liveMode && rows !== null && (
              <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-body-3">
                {lang === 'zh' ? '样本数据 · 收到真实申请后自动替换' : 'Sample data · replaced when real applications arrive'}
              </span>
            )}
          </>
        }
        actions={
          <button className="sl-btn-secondary !px-4 !py-2 !text-[12.5px]" onClick={() => exportCsv(apps, lang === 'zh')}>
            {lang === 'zh' ? '导出 CSV' : 'Export CSV'}
          </button>
        }
      />

      <StatStrip
        stats={[
          {
            label: lang === 'zh' ? '新申请' : 'New applications',
            value: String(apps.length),
            sub: lang === 'zh' ? `${aiName} 已按你的政策分组` : `Grouped by ${aiName} against your policy`,
          },
          {
            label: lang === 'zh' ? '待你决定' : 'Awaiting your decision',
            value: String(pendingCount),
            sub: lang === 'zh' ? '推荐审批 + 需面谈' : 'Recommended + needs interview',
            tone: 'warn',
          },
          {
            label: lang === 'zh' ? '平均等待' : 'Average wait',
            value: lang === 'zh' ? `${avgWaitHours} 小时` : `${avgWaitHours} h`,
            sub:
              lang === 'zh'
                ? '优质申请人常在 48 小时内接受其他 offer'
                : 'Strong applicants often accept elsewhere within 48h',
            tone: 'down',
          },
          {
            label: lang === 'zh' ? '已发租约' : 'Leases sent',
            value: String(leasesSent),
            sub: liveMode
              ? lang === 'zh'
                ? '已批准的申请'
                : 'Approved applications'
              : 'Mia Chen · 5/14',
          },
        ]}
      />

      {!liveMode && <LandlordThreeSteps lang={lang} />}

      <PolicyCard lang={lang} showHits={!liveMode} />

      {SECTIONS.map((s) => {
        const list = apps.filter((a) => a.decision === s.decision)
        if (liveMode && list.length === 0) return null
        return (
          <SectionCard
            key={s.decision}
            className="mb-3"
            padded={false}
            title={<StatusPill tone={s.tone}>{s.label[lang]}</StatusPill>}
            meta={<span className="font-mono">{list.length}</span>}
          >
            {list.map((a) => (
              <Link
                key={a.id}
                href={`/landlord/applicants/${a.id}`}
                className="grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-line-divider px-4 py-2.5 transition last:border-b-0 hover:bg-surface-chip sm:grid-cols-[36px_1fr_110px_64px_16px] sm:gap-4"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{
                    background:
                      a.avc === 'tenant'
                        ? 'linear-gradient(135deg,#C4B5FD,#7C3AED)'
                        : a.avc === 'agent'
                          ? 'linear-gradient(135deg,#93C5FD,#2563EB)'
                          : a.avc === 'orange'
                            ? 'linear-gradient(135deg,#FDBA74,#EA580C)'
                            : 'linear-gradient(135deg,#6EE7B7,#047857)',
                  }}
                >
                  {a.initial}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold">{a.name}</div>
                  <div className="font-mono text-[10.5px] text-body-3">
                    {a.income != null ? `$${a.income.toLocaleString()}/mo` : lang === 'zh' ? '收入未填' : 'No income given'}
                    {a.unitLabel ? ` · ${a.unitLabel}` : ''}
                  </div>
                  <div className="font-mono text-[11px] text-body-2">{a.qual[lang]}</div>
                </div>
                <div className="flex items-center gap-3 sm:contents">
                  <StampBadge tier={a.tier} />
                  <div className="text-right">
                    <div className="font-mono text-[17px] font-bold leading-none [font-variant-numeric:tabular-nums]">{a.match ?? '—'}</div>
                    <div className="font-mono text-[9.5px] uppercase text-body-3">MATCH</div>
                  </div>
                  <span className="text-right text-body-3">›</span>
                </div>
              </Link>
            ))}
          </SectionCard>
        )
      })}

      {!liveMode && <DecidedTable lang={lang} />}
    </WorkspaceShell>
  )
}

/**
 * The landlord's own screening policy, shown next to the queue it produced.
 * Compliance: only performance-related criteria may appear here, and the OHRC
 * notice below is the same wording carried on the decision screen
 * (app/landlord/applicants/[id]/page.tsx).
 */
function PolicyCard({
  lang,
  /** Per-rule hit counts belong to the sample queue — hidden in live mode. */
  showHits,
}: {
  lang: Lang
  showHits: boolean
}) {
  const zh = lang === 'zh'
  const aiName = useAIName('landlord')
  return (
    <SectionCard
      className="mb-3"
      title={showHits ? (zh ? '我的筛查政策' : 'Your screening policy') : zh ? '推荐筛查门槛' : 'Suggested screening thresholds'}
      meta={
        showHits
          ? zh
            ? `${aiName} 按此分组`
            : `${aiName} sorts by this`
          : zh
            ? '默认模板 · 未自定义'
            : 'Default template · not customised'
      }
      action={
        <Link
          href={`/landlord/agent?prompt=${encodeURIComponent(zh ? '帮我复核 Unit 1207 的筛查门槛（收入 / 信用 / DTI / 租期），并指出哪些条件把合格申请人挡在门外' : 'Review my screening thresholds for Unit 1207 (income / credit / DTI / term) and flag any that are screening out qualified applicants')}`}
          className="text-[12px] font-semibold text-brand hover:underline"
        >
          {zh ? '复核门槛 →' : 'Review thresholds →'}
        </Link>
      }
    >
      <ul className="space-y-2">
        {POLICY.map((p) => (
          <li
            key={p.rule.en}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[8px] border border-line-divider bg-surface px-3 py-2"
          >
            <span className="text-[12.5px] font-semibold">{p.rule[lang]}</span>
            {showHits && p.hit && (
              <span className="font-mono text-[11px] text-body-3">{p.hit[lang]}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-lg bg-danger/[0.06] px-3 py-2.5 text-[11.5px] leading-relaxed text-body-2">
        <b className="text-danger">⚠️ {zh ? 'RTA 提示：' : 'RTA notice: '}</b>
        {zh
          ? `「不合适」理由不能是种族 / 国籍 / 来源国 / 家庭情况 / 性取向。${aiName} 会过滤这些，但你拒绝时仍需具体理由 — 写入 audit log。`
          : `A "not a fit" reason cannot be race / nationality / country of origin / family status / sexual orientation. ${aiName} filters these out, but you still need a specific reason when declining — it is written to the audit log.`}
      </p>
    </SectionCard>
  )
}

function DecidedTable({ lang }: { lang: Lang }) {
  const zh = lang === 'zh'
  return (
    <SectionCard
      className="mb-3"
      padded={false}
      title={zh ? '已决定 / 已归档' : 'Decided / archived'}
      meta={<span className="font-mono">{DECIDED.length}</span>}
    >
      <Table
        head={[
          zh ? '申请人' : 'Applicant',
          zh ? '决定' : 'Decision',
          zh ? '日期' : 'Date',
          zh ? '后续' : 'Follow-up',
        ]}
      >
        {DECIDED.map((d) => (
          <Tr key={d.name}>
            <Td>
              <div className="text-[13px] font-semibold">{d.name}</div>
              <div className="text-[11.5px] text-body-2">{d.unit}</div>
            </Td>
            <Td align="right">
              <StatusPill tone={d.tone}>{d.decision[lang]}</StatusPill>
            </Td>
            <Td align="right" mono muted>
              {d.date}
            </Td>
            <Td align="right" muted>
              {d.followUp?.[lang] ?? '—'}
            </Td>
          </Tr>
        ))}
      </Table>
    </SectionCard>
  )
}

function RailAside({
  lang,
  insights,
  showFunnel,
}: {
  lang: Lang
  insights: AIInsight[]
  /** The funnel is design-canon sample data — hidden once real applications land. */
  showFunnel: boolean
}) {
  const zh = lang === 'zh'
  const aiName = useAIName('landlord')
  const top = FUNNEL[0].n
  const qualifiedRate = Math.round((FUNNEL[2].n / FUNNEL[1].n) * 100)
  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive role="landlord" insights={insights} variant="rail" />
      </AsideBlock>

      {showFunnel && (
      <AsideBlock title={zh ? '本房源询盘漏斗' : 'Listing inquiry funnel'}>
        <div className="rounded-xl border border-line-divider bg-white p-3.5">
          <ul className="space-y-2">
            {FUNNEL.map((f) => (
              <li key={f.stage.en}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] text-body-2">{f.stage[lang]}</span>
                  <span className="font-mono text-[12px] font-bold [font-variant-numeric:tabular-nums]">{f.n}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-chip">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(f.n / top) * 100}%`, background: 'rgba(4,120,87,0.55)' }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line-divider pt-2.5 text-[11.5px] leading-relaxed text-body-3">
            {zh
              ? `达标率 ${qualifiedRate}% · 若连续两批 < 30%，${aiName} 会提示复核门槛或定价。`
              : `${qualifiedRate}% meet threshold · if two consecutive batches fall under 30%, ${aiName} will flag your thresholds or pricing for review.`}
          </p>
        </div>
      </AsideBlock>
      )}
    </div>
  )
}
