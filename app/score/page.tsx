'use client'
// /score — Stayloop Score · Transparency (V3 section 15)
// Production: composes the current user's score breakdown from their best application.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import AppHeader from '@/components/AppHeader'

interface AppRow {
  id: string
  ai_score: number | null
  doc_authenticity_score: number | null
  payment_ability_score: number | null
  court_records_score: number | null
  stability_score: number | null
  behavior_signals_score: number | null
  info_consistency_score: number | null
  ai_dimension_notes: Record<string, string> | null
  created_at: string
}

interface AxisDef {
  key: keyof AppRow
  title_en: string
  title_zh: string
  weight: number
  color: string
}

const AXES: AxisDef[] = [
  { key: 'doc_authenticity_score', title_en: 'Document authenticity', title_zh: '材料真实', weight: 20, color: '#10B981' },
  { key: 'payment_ability_score', title_en: 'Payment ability', title_zh: '支付能力', weight: 22, color: '#22C55E' },
  { key: 'court_records_score', title_en: 'Court records', title_zh: '法庭记录', weight: 18, color: '#0EA5E9' },
  { key: 'stability_score', title_en: 'Stability', title_zh: '稳定性', weight: 15, color: '#F59E0B' },
  { key: 'behavior_signals_score', title_en: 'Behavior signals', title_zh: '行为信号', weight: 13, color: '#A855F7' },
  { key: 'info_consistency_score', title_en: 'Info consistency', title_zh: '信息一致', weight: 12, color: '#EC4899' },
]

function band(score: number | null): { en: string; zh: string } {
  if (score == null) return { en: 'PENDING', zh: '待评分' }
  if (score >= 90) return { en: 'EXCELLENT', zh: '优秀' }
  if (score >= 75) return { en: 'GOOD', zh: '良好' }
  if (score >= 60) return { en: 'FAIR', zh: '一般' }
  return { en: 'NEEDS WORK', zh: '需提升' }
}

export default function ScorePage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [app, setApp] = useState<AppRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.email) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('applications')
      .select('id, ai_score, doc_authenticity_score, payment_ability_score, court_records_score, stability_score, behavior_signals_score, info_consistency_score, ai_dimension_notes, created_at')
      .eq('email', user!.email)
      .order('ai_score', { ascending: false, nullsFirst: false })
      .limit(1)
    setApp(((data as AppRow[]) || [])[0] || null)
    setLoading(false)
  }

  if (authLoading || loading) {
    return (
      <main style={{ background: v3.surfaceMuted, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted, fontSize: 14 }}>{isZh ? '加载评分…' : 'Loading score…'}</div>
      </main>
    )
  }

  // Translate 0-100 score to 300-1000 trad-credit-style display
  const scaled = app?.ai_score != null ? Math.round(300 + (app.ai_score / 100) * 700) : null
  const tier = band(app?.ai_score ?? null)

  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <AppHeader
        title="Score · Transparency"
        titleZh="评分 · 透明仪表盘"
        right={
          <div style={{ fontSize: 12, color: v3.textMuted, whiteSpace: 'nowrap' }}>
            {app ? `${isZh ? '更新于' : 'Updated'} ${new Date(app.created_at).toLocaleDateString()}` : isZh ? '尚未评分' : 'Not yet scored'}
          </div>
        }
      />

      {!app ? (
        <div style={{ padding: '64px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            {isZh ? '你还没有评分' : 'You don\u2019t have a score yet'}
          </h1>
          <p style={{ color: v3.textMuted, fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>
            {isZh
              ? '完成一次筛查或申请一套房，AI 会根据你的材料给出 6 维评分。'
              : 'Complete a screening or apply to a listing — the AI will produce a 6-axis breakdown from your documents.'}
          </p>
          <Link href="/screen" style={{ display: 'inline-flex', padding: '12px 22px', background: v3.brand, color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            {isZh ? '开始筛查' : 'Start a screening'} →
          </Link>
        </div>
      ) : (
        <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24 }} className="sc-grid">
          <aside style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 16, padding: 24, position: 'sticky', top: 24, alignSelf: 'start' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {isZh ? '租客信用评分 · STAYLOOP SCORE' : 'STAYLOOP SCORE · 租客信用评分'}
            </div>
            <div style={{ display: 'grid', placeItems: 'center', margin: '20px 0' }}>
              <ScoreGauge score={scaled || 300} min={300} max={1000} />
            </div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: v3.brand, letterSpacing: '0.08em' }}>{tier.en}</div>
              <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 2 }}>{tier.zh}</div>
            </div>
            <RangeScale value={scaled || 300} min={300} max={1000} />
            <div style={{ marginTop: 20, padding: 14, background: v3.brandSoft, border: `1px solid ${v3.brandSoft}`, borderLeft: `3px solid ${v3.brand}`, borderRadius: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                {isZh ? '提升建议 · NEXT BAND' : 'NEXT BAND · 提升建议'}
              </div>
              <div style={{ fontSize: 13, color: v3.textPrimary, lineHeight: 1.5 }}>
                {isZh
                  ? '加一段已核签的租房记录可以稳步提升信用 + 稳定性。'
                  : 'Adding a co-signed tenancy will lift both credit and stability axes.'}
              </div>
              <Link href="/history" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: v3.brandStrong, fontWeight: 600, textDecoration: 'none' }}>
                {isZh ? '去添加 →' : 'Add tenancy →'}
              </Link>
            </div>
          </aside>

          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                {isZh ? '评分构成' : 'What\u2019s in your score'}
              </h1>
              <div style={{ fontSize: 12, color: v3.textMuted }}>
                {isZh ? '6 项指标 · 完全透明' : '6 signals · fully transparent'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
              {AXES.map((a) => (
                <AxisRow key={a.key} app={app} a={a} isZh={isZh} />
              ))}
            </div>

            {/* Dimension notes */}
            <div style={{ borderTop: `1px solid ${v3.border}`, paddingTop: 24, marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 16px', color: v3.textPrimary }}>
                {isZh ? '指标解读' : 'What each dimension measures'}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {AXES.map((a) => {
                  const note = app?.ai_dimension_notes?.[String(a.key).replace('_score', '')]
                  const fallback = getFallbackNote(String(a.key).replace('_score', ''), isZh)
                  return (
                    <div key={a.key} style={{ background: v3.surface, padding: 12, borderRadius: 10, borderLeft: `3px solid ${a.color}` }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: v3.textPrimary, marginBottom: 4 }}>
                        {isZh ? a.title_zh : a.title_en}
                      </div>
                      <div style={{ fontSize: 12, color: v3.textSecondary, lineHeight: 1.5 }}>
                        {note || fallback}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* How this compares */}
            <div style={{ background: v3.brandSoft, border: `1px solid ${v3.brand}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                {isZh ? '对标分析' : 'HOW THIS COMPARES'}
              </div>
              <div style={{ fontSize: 13, color: v3.textPrimary, lineHeight: 1.6, fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>
                <div>{isZh ? '你的评分' : 'Your score'}: <strong>{scaled}</strong></div>
                <div style={{ marginTop: 4 }}>{isZh ? '平均获批' : 'Avg approved'}: 82</div>
                <div style={{ marginTop: 4 }}>{isZh ? '平均被拒' : 'Avg declined'}: 54</div>
              </div>
            </div>
          </section>
        </div>
      )}

      <style jsx>{`@media (max-width: 880px){:global(.sc-grid){grid-template-columns:1fr !important;}:global(.sc-grid > aside){position:static !important;}}`}</style>
    </main>
  )
}

function ScoreGauge({ score, min, max }: { score: number; min: number; max: number }) {
  const pct = Math.max(0, Math.min(1, (score - min) / (max - min)))
  const r = 88, c = 2 * Math.PI * r, dash = c * pct
  return (
    <svg viewBox="0 0 220 220" width={220} height={220}>
      <circle cx={110} cy={110} r={r} fill="none" stroke={v3.divider} strokeWidth={14} />
      <circle cx={110} cy={110} r={r} fill="none" stroke={v3.brand} strokeWidth={14} strokeLinecap="round" strokeDasharray={`${dash} ${c}`} transform="rotate(-90 110 110)" />
      <text x={110} y={108} textAnchor="middle" fontSize={54} fontWeight={800} fill={v3.textPrimary} style={{ letterSpacing: '-0.04em' }}>{score}</text>
      <text x={110} y={130} textAnchor="middle" fontSize={10} fontWeight={700} fill={v3.textMuted} style={{ letterSpacing: '0.12em' }}>SCORE</text>
    </svg>
  )
}

function RangeScale({ value, min, max }: { value: number; min: number; max: number }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  return (
    <div>
      <div style={{ position: 'relative', height: 6, background: v3.divider, borderRadius: 3, marginBottom: 6 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `linear-gradient(90deg, ${v3.warning} 0%, ${v3.brand} 60%)`, borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: `${pct}%`, top: -4, transform: 'translateX(-50%)', width: 14, height: 14, background: '#fff', border: `3px solid ${v3.brand}`, borderRadius: 999 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: v3.textMuted }}>
        {[300, 500, 700, 1000].map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  )
}

function getFallbackNote(dimension: string, isZh: boolean): string {
  const notes: Record<string, { en: string; zh: string }> = {
    doc_authenticity: {
      en: 'PDF metadata, font analysis, and forensic markers across uploaded documents.',
      zh: '上传文件的 PDF 元数据、字体分析和取证标记。',
    },
    payment_ability: {
      en: 'Income-to-rent ratio, employment stability, and bank statement verification.',
      zh: '收入租金比、就业稳定性和银行对账单验证。',
    },
    court_records: {
      en: 'Ontario LTB and civil court records, eviction history, and judgment status.',
      zh: '安省 LTB 和民事法庭记录、驱逐历史和判决状态。',
    },
    stability: {
      en: 'Length of employment, frequency of job changes, and housing history.',
      zh: '就业期限、工作变更频率和居住历史。',
    },
    behavior_signals: {
      en: 'Rental payment punctuality, communication responsiveness, and application consistency.',
      zh: '租金支付准时性、沟通反应性和申请一致性。',
    },
    info_consistency: {
      en: 'Cross-document validation of names, dates, income, and employment details.',
      zh: '姓名、日期、收入和就业细节的跨文件验证。',
    },
  }
  const note = notes[dimension]
  return note ? (isZh ? note.zh : note.en) : 'Score dimension'
}

function AxisRow({ app, a, isZh }: { app: AppRow; a: AxisDef; isZh: boolean }) {
  const score = (app[a.key] as number | null) ?? 0
  const note = app.ai_dimension_notes?.[String(a.key).replace('_score', '')]
  const contributesPts = Math.round((score / 100) * a.weight * 7)
  return (
    <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>
            {isZh ? a.title_zh : a.title_en}
          </span>
          <span style={{ fontSize: 11, color: v3.textMuted }}>{isZh ? a.title_en : a.title_zh}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: v3.textMuted, background: v3.divider, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            weight {a.weight}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em' }}>{score}</span>
          <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600 }}>/100</span>
        </div>
      </div>
      <div style={{ height: 6, background: v3.divider, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${score}%`, height: '100%', background: a.color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 12, color: v3.textMuted, lineHeight: 1.5 }}>
        {note ? note : isZh ? `贡献约 ${contributesPts} 分` : `Contributes ~${contributesPts} pts`}
      </div>
    </div>
  )
}
