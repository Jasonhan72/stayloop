'use client'

// -----------------------------------------------------------------------------
// ScreeningCard — V3-styled screening result block
// -----------------------------------------------------------------------------
// Big score + tier badge + signal grid + cited tool executions. Matches the
// "Pipeline (Logic AI ranking)" page from the V3 PDF (page 5).
// -----------------------------------------------------------------------------

import { tokens, tier, severity, type Severity, type Tier } from '@/lib/agent/theme'

interface Flag {
  code: string
  severity: string
  evidence_zh?: string
  evidence_en?: string
}

interface ScreeningCardProps {
  screening_id?: string
  overall: number
  tier?: Tier
  flags?: Flag[]
  cited_tool_executions?: string[]
  applicant_name?: string
  monthly_income?: number
  monthly_rent?: number
  lang?: 'zh' | 'en'
}

export function ScreeningCard({
  overall,
  tier: tierKey = 'conditional',
  flags = [],
  applicant_name,
  monthly_income,
  monthly_rent,
  lang = 'zh',
}: ScreeningCardProps) {
  const tierStyle = tier[tierKey]
  const ratio = monthly_income && monthly_rent ? monthly_income / monthly_rent : null

  return (
    <div
      style={{
        marginTop: 12,
        padding: 18,
        background: tokens.surfaceCard,
        border: `1px solid ${tokens.border}`,
        borderRadius: 14,
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
      }}
    >
      {/* Header: score + tier */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          {applicant_name && (
            <div style={{ fontSize: 11, fontWeight: 600, color: tokens.textTertiary, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>
              {lang === 'zh' ? '申请人' : 'Applicant'}
            </div>
          )}
          {applicant_name && (
            <div style={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary, marginBottom: 6 }}>{applicant_name}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 48, fontWeight: 800, color: tokens.accent, letterSpacing: -1, lineHeight: 1 }}>
              {overall}
            </span>
            <span style={{ fontSize: 14, color: tokens.textTertiary }}>/ 100</span>
          </div>
        </div>
        <div
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            background: tierStyle.bg,
            color: tierStyle.fg,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {lang === 'zh' ? tierStyle.label_zh : tierStyle.label_en}
        </div>
      </div>

      {/* Income/rent ratio strip */}
      {ratio !== null && (
        <div
          style={{
            marginTop: 14,
            padding: 10,
            background: tokens.surfaceMuted,
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: tokens.textSecondary,
          }}
        >
          <span>
            <strong>{lang === 'zh' ? '收入/租金' : 'Income/Rent'}:</strong> {ratio.toFixed(2)}x
          </span>
          <span style={{ color: ratio < 2.5 ? tokens.danger : ratio < 2.857 ? tokens.warning : tokens.success }}>
            {ratio < 2.5
              ? lang === 'zh' ? '负担过重' : 'overburdened'
              : ratio < 2.857
                ? lang === 'zh' ? '边缘可负担' : 'borderline'
                : lang === 'zh' ? '可负担' : 'affordable'}
          </span>
        </div>
      )}

      {/* Flags */}
      {flags.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: tokens.textTertiary, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>
            {lang === 'zh' ? '关键信号' : 'Key Signals'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flags.map((f, i) => {
              const sev = severity[(f.severity as Severity) || 'low'] || severity.low
              return (
                <div
                  key={i}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: sev.bg + '40',
                    border: `1px solid ${sev.bg}`,
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: tokens.textSecondary,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: sev.color,
                        color: '#fff',
                        letterSpacing: 0.3,
                        textTransform: 'uppercase',
                      }}
                    >
                      {lang === 'zh' ? sev.label_zh : sev.label_en}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: tokens.textTertiary }}>
                      {f.code}
                    </span>
                  </div>
                  <div>{lang === 'zh' ? f.evidence_zh || f.evidence_en : f.evidence_en || f.evidence_zh}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
