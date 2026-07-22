'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AIProactive, { type AIInsight } from '@/components/AIProactive'
import LandlordThreeSteps from '@/components/landlord/LandlordThreeSteps'
import StampBadge from '@/components/StampBadge'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import type { ApplicationFile } from '@/types'

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

const SECTIONS = [
  { decision: 'approve', label: { zh: '推荐审批', en: 'Recommended' }, tone: 'bg-success/10 text-success border-success/30' },
  { decision: 'review',  label: { zh: '需面谈', en: 'Needs interview' }, tone: 'bg-warning/10 text-warning border-warning/30' },
  { decision: 'decline', label: { zh: '不达标', en: 'Below threshold' }, tone: 'bg-danger/10 text-danger border-danger/30' },
] as const

const AVC_CYCLE = ['tenant', 'agent', 'landlord', 'orange'] as const

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
  const rows = apps.map((a) => [a.name, a.match ?? '', a.tier, a.income ?? '', a.decision, a.unitLabel ?? ''])
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'stayloop-applicants.csv'
  a.click()
  URL.revokeObjectURL(url)
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
    <WorkspaceShell role="landlord" hideAside>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">{eyebrow}</div>
          <h1 className="mt-2 text-[24px] font-bold tracking-tight sm:text-[36px]">
            {lang === 'zh' ? `${apps.length} 份申请 · ${aiName} 已分组` : `${apps.length} applications · grouped by ${aiName}`}
          </h1>
          <p className="mt-2 text-[14px] text-body-2">
            {lang === 'zh'
              ? '按你的 需银行章 / 信用 ≥ 720 / DTI ≤ 35% 政策，已分入 3 组。点开任一申请查看完整六维评分 + 文件。'
              : 'Sorted into 3 groups by your policy (bank stamp required / credit ≥ 720 / DTI ≤ 35%). Open any application to see the full six-dimension score and documents.'}
            {!liveMode && rows !== null && (
              <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-body-3">
                {lang === 'zh' ? '样本数据 · 收到真实申请后自动替换' : 'Sample data · replaced when real applications arrive'}
              </span>
            )}
          </p>
        </div>
        <button className="sl-btn-secondary" onClick={() => exportCsv(apps, lang === 'zh')}>
          {lang === 'zh' ? '导出 CSV' : 'Export CSV'}
        </button>
      </div>

      {!liveMode && <LandlordThreeSteps lang={lang} />}

      <AIProactive role="landlord" insights={insights} />

      {SECTIONS.map((s) => {
        const list = apps.filter((a) => a.decision === s.decision)
        if (liveMode && list.length === 0) return null
        return (
          <div key={s.decision} className="mb-8">
            <div className={`mb-3 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-bold ${s.tone}`}>
              {s.label[lang]}
              <span className="font-mono text-[11px]">{list.length}</span>
            </div>
            <div className="space-y-2">
              {list.map((a) => (
                <Link
                  key={a.id}
                  href={`/landlord/applicants/${a.id}`}
                  className="grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-xl border border-line-divider bg-white p-4 transition hover:border-brand/40 hover:shadow-md sm:grid-cols-[44px_1fr_120px_140px_60px] sm:gap-4"
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-bold text-white"
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
                  <div>
                    <div className="text-[15px] font-bold">{a.name}</div>
                    <div className="font-mono text-[11px] text-body-3">
                      {a.income != null ? `$${a.income.toLocaleString()}/mo` : lang === 'zh' ? '收入未填' : 'No income given'}
                      {a.unitLabel ? ` · ${a.unitLabel}` : ''}
                    </div>
                    <div className="mt-1 font-mono text-[11.5px] text-body-2">{a.qual[lang]}</div>
                  </div>
                  <div className="flex items-center gap-3 sm:contents">
                    <StampBadge tier={a.tier} />
                    <div>
                      <div className="font-mono text-[24px] font-bold leading-none">{a.match ?? '—'}</div>
                      <div className="font-mono text-[10px] uppercase text-body-3">MATCH</div>
                    </div>
                    <span className="text-right text-body-3">›</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </WorkspaceShell>
  )
}
