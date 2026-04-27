'use client'
// /lease/explainer — Lease Explainer (V3 section 03)
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'

const CLAUSE = {
  number: '4.1',
  title_en: 'RENT DEPOSIT',
  title_zh: '租金押金',
  legal_en:
    'The Tenant shall pay a rent deposit of one (1) month\u2019s rent equal to $2,350.00, which the Landlord shall apply to the last month of the tenancy. Interest at the guideline rate shall accrue annually.',
  plain_en:
    'You\u2019ll pay $2,350 upfront — but this is your last month\u2019s rent, not a security deposit. In Ontario, landlords can\u2019t hold a damage deposit. You\u2019ll get small interest back each year.',
  plain_zh:
    '你需要预付 $2,350，但这是最后一个月的租金，不是押金。安省法律不允许房东收损坏押金。每年还会有少量利息返还给你。',
  watch_en: '⚠ Watch: due before move-in',
  rule: 'RTA s.106 · standard',
}

export default function LeaseExplainerPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh', padding: '24px 12px' }}>
      <Phone time="14:38">
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, color: v3.textMuted }}>‹</span>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{isZh ? '第 4 / 6 步 · 租约审阅' : 'Step 4 of 6 · Lease Review'}</div>
            <div style={{ fontSize: 10, color: v3.textMuted }}>{isZh ? '安省标准租约 (Form 2229E)' : 'Ontario Standard Lease (Form 2229E)'}</div>
          </div>
          <span style={{ fontSize: 16, color: v3.textMuted }}>⋯</span>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 10 }}>{isZh ? 'Echo 已为你逐条解释' : 'Echo has explained each clause'}</div>

          <div style={{ background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              § {CLAUSE.number} — {isZh ? CLAUSE.title_zh : CLAUSE.title_en}
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: v3.textSecondary, margin: 0, fontFamily: 'serif' }}>{CLAUSE.legal_en}</p>
          </div>

          <div style={{ background: v3.brandSoft, border: `1px solid ${v3.brandSoft}`, borderLeft: `3px solid ${v3.brand}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>✦ Echo Explains</span>
              <span style={{ background: v3.surface, padding: '2px 6px', borderRadius: 4, fontSize: 9, color: v3.brand }}>Plain English</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: v3.textPrimary, margin: '0 0 10px' }}>{CLAUSE.plain_en}</p>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: v3.textSecondary, margin: 0, fontFamily: 'var(--font-cn), system-ui' }}>{CLAUSE.plain_zh}</p>
          </div>

          <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
            <span style={{ color: v3.warning, fontWeight: 600 }}>{CLAUSE.watch_en}</span>
            <span style={{ color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>{CLAUSE.rule}</span>
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderTop: `1px solid ${v3.divider}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: v3.textMuted, marginBottom: 8 }}>
            <span>{isZh ? '已审阅 4 / 24 条款' : '4 of 24 clauses reviewed'}</span>
            <span style={{ color: v3.brandStrong, fontWeight: 600 }}>17%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: v3.divider, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ width: '17%', height: '100%', background: v3.brand }} />
          </div>
          <button style={{ width: '100%', background: v3.brand, color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700 }}>
            {isZh ? '继续' : 'Continue'} ·
          </button>
        </div>
      </Phone>
    </main>
  )
}
