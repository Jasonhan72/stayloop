'use client'
// /lease/explainer — Lease Explainer (V3 section 03)
// Production: reads clauses from public.lease_clauses (Form 2229E essentials).
import { useEffect, useState } from 'react'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'
import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'

interface Clause {
  section: string
  title_en: string
  title_zh: string
  legal_text: string
  plain_en: string | null
  plain_zh: string | null
  watch_en: string | null
  rule_ref: string | null
  ord: number
}

function getRiskLevel(section: string): 'standard' | 'caution' | 'red-flag' {
  const redFlagSections = ['rent', 'termination', 'eviction']
  const cautionSections = ['pets', 'utilities', 'parking']

  const sectionLower = section.toLowerCase()
  if (redFlagSections.some(s => sectionLower.includes(s))) return 'red-flag'
  if (cautionSections.some(s => sectionLower.includes(s))) return 'caution'
  return 'standard'
}

function getRiskBadgeStyle(riskLevel: 'standard' | 'caution' | 'red-flag') {
  const styles = {
    standard: { bg: v3.brandSoft, fg: v3.brandStrong, labelEn: 'Standard', labelZh: '标准条款' },
    caution: { bg: v3.warningSoft, fg: v3.warning, labelEn: 'Caution', labelZh: '注意' },
    'red-flag': { bg: v3.dangerSoft, fg: v3.danger, labelEn: 'Important', labelZh: '重点' },
  }
  return styles[riskLevel]
}

function highlightKeyPhrases(text: string, isZh: boolean): React.ReactNode {
  const keyPhrases = isZh
    ? ['租金', '租客', '房东', '终止', '驱逐']
    : ['rent', 'tenant', 'landlord', 'terminate', 'eviction']

  let jsx: React.ReactNode[] = []
  let lastIdx = 0

  keyPhrases.forEach((phrase) => {
    const regex = new RegExp(`(${phrase})`, 'gi')
    const parts = text.split(regex)
    text = parts.join('\0' + phrase + '\0')
  })

  const nodes = text.split('\0').map((part, idx) => {
    if (keyPhrases.some(p => p.toLowerCase() === part.toLowerCase())) {
      return (
        <mark
          key={idx}
          style={{
            background: 'rgba(4,120,87,0.10)',
            padding: '1px 4px',
            borderRadius: 3,
            color: v3.brandStrong,
          }}
        >
          {part}
        </mark>
      )
    }
    return part
  })

  return <>{nodes}</>
}

export default function LeaseExplainerPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [clauses, setClauses] = useState<Clause[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void supabase
      .from('lease_clauses')
      .select('section, title_en, title_zh, legal_text, plain_en, plain_zh, watch_en, rule_ref, ord')
      .order('ord', { ascending: true })
      .then(({ data }) => {
        setClauses((data as Clause[]) || [])
        setLoading(false)
      })
  }, [])

  const c = clauses[activeIdx]
  const total = clauses.length
  const progressPct = total > 0 ? Math.round(((activeIdx + 1) / total) * 100) : 0

  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <AppHeader title="Lease explainer" titleZh="租约审阅" />
      <Phone time="14:38">
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{ fontSize: 18, color: v3.textMuted, cursor: 'pointer' }}
            onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
          >
            ‹
          </span>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {isZh ? `第 ${activeIdx + 1} / ${total || 1} 步 · 租约审阅` : `Step ${activeIdx + 1} of ${total || 1} · Lease Review`}
            </div>
            <div style={{ fontSize: 10, color: v3.textMuted }}>
              {isZh ? '安省标准租约 (Form 2229E)' : 'Ontario Standard Lease (Form 2229E)'}
            </div>
          </div>
          <span style={{ fontSize: 16, color: v3.textMuted }}>⋯</span>
        </div>

        {loading || !c ? (
          <div style={{ padding: 32, textAlign: 'center', color: v3.textMuted, fontSize: 13 }}>
            {isZh ? '加载条款…' : 'Loading clauses…'}
          </div>
        ) : (
          <>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 10 }}>
                {isZh ? 'Echo 已为你逐条解释' : 'Echo has explained each clause'}
              </div>

              {/* Risk level badge */}
              {(() => {
                const risk = getRiskLevel(c.section)
                const badge = getRiskBadgeStyle(risk)
                return (
                  <div style={{ marginBottom: 12, display: 'flex', gap: 6 }}>
                    <div
                      style={{
                        background: badge.bg,
                        color: badge.fg,
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {risk === 'standard' ? '✓' : risk === 'caution' ? '⚡' : '⚠'} {isZh ? badge.labelZh : badge.labelEn}
                    </div>
                  </div>
                )
              })()}

              <div style={{ background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  § {c.section} — {isZh ? c.title_zh : c.title_en}
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: v3.textSecondary, margin: 0, fontFamily: 'serif' }}>
                  {highlightKeyPhrases(c.legal_text, isZh)}
                </p>
              </div>

              {/* Plain-language summary card */}
              {(c.plain_en || c.plain_zh) && (
                <div style={{ background: v3.surfaceTint, border: `1px solid ${v3.border}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {isZh ? '人话版' : 'In plain language'}
                  </div>
                  {c.plain_en && (
                    <p style={{ fontSize: 13, lineHeight: 1.55, color: v3.textPrimary, margin: '0 0 10px' }}>{c.plain_en}</p>
                  )}
                  {c.plain_zh && (
                    <p style={{ fontSize: 12.5, lineHeight: 1.55, color: v3.textSecondary, margin: 0, fontFamily: 'var(--font-cn), system-ui' }}>{c.plain_zh}</p>
                  )}
                </div>
              )}

              {(c.watch_en || c.rule_ref) && (
                <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, gap: 8 }}>
                  <span style={{ color: v3.warning, fontWeight: 600 }}>{c.watch_en || ''}</span>
                  <span style={{ color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>{c.rule_ref || ''}</span>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 16px', borderTop: `1px solid ${v3.divider}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: v3.textMuted, marginBottom: 8 }}>
                <span>{isZh ? `已审阅 ${activeIdx + 1} / ${total} 条款` : `${activeIdx + 1} of ${total} clauses reviewed`}</span>
                <span style={{ color: v3.brandStrong, fontWeight: 600 }}>{progressPct}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: v3.divider, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ width: `${progressPct}%`, height: '100%', background: v3.brand, transition: 'width 200ms' }} />
              </div>
              <button
                onClick={() => setActiveIdx((i) => Math.min(total - 1, i + 1))}
                disabled={activeIdx >= total - 1}
                style={{
                  width: '100%',
                  background: activeIdx >= total - 1 ? v3.divider : v3.brand,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '14px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: activeIdx >= total - 1 ? 'default' : 'pointer',
                }}
              >
                {activeIdx >= total - 1 ? (isZh ? '已读完' : 'Done') : isZh ? '继续' : 'Continue'} →
              </button>
            </div>
          </>
        )}
      </Phone>
    </main>
  )
}
