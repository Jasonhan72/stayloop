'use client'
// /roommates — Group application (V3 section 19)
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'
import AppHeader from '@/components/AppHeader'

const MEMBERS = [
  { initials: 'WC', name: 'Wei Chen', score: 872, share: 940, sharePct: 40, lead: true, verified: true },
  { initials: 'MP', name: 'Maya Patel', score: 824, share: 823, sharePct: 35, verified: true },
  { initials: 'JK', name: 'James Kim', score: 798, share: 587, sharePct: 25, awaiting: true },
]

export default function RoommatesPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <AppHeader title="Roommates" titleZh="合租" />
      <Phone time="14:48">
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, color: v3.textMuted }}>‹</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{isZh ? '合租' : 'Roommates'}</span>
          <span style={{ fontSize: 16, color: v3.brandStrong }}>+</span>
        </div>

        <div style={{ padding: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {isZh ? '合租申请' : 'Group application'}
          </h1>
          <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 16 }}>
            {isZh ? 'Hudson #1208 · 3 人组合' : 'Hudson #1208 · 3 members'}
          </div>

          {/* Group score card */}
          <div style={{
            background: 'linear-gradient(180deg, #0F2A23 0%, #0A1916 100%)',
            color: '#fff',
            borderRadius: 16,
            padding: 18,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
              {isZh ? '合并评分 · GROUP SCORE' : 'GROUP SCORE'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em', background: 'linear-gradient(180deg, #fff, #34D399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>841</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{isZh ? '加权 (按租金占比)' : 'blended (rent-weighted)'}</span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)' }}>
              {isZh
                ? '合计月入 $11,400 · 房租覆盖率 4.85×'
                : 'Combined income $11,400/mo · 4.85× rent ($2,350)'}
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            {isZh ? '成员 · MEMBERS' : 'MEMBERS · 成员'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MEMBERS.map((m) => (
              <div key={m.initials} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12 }}>
                <span style={{ width: 36, height: 36, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{m.initials}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{m.name}</span>
                    {m.lead && <span style={{ fontSize: 9, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '1px 6px', borderRadius: 4 }}>LEAD</span>}
                  </div>
                  <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                    {isZh ? `评分 ${m.score} · 月付 $${m.share} (${m.sharePct}%)` : `Score ${m.score} · Pays $${m.share} (${m.sharePct}%)`}
                  </div>
                </div>
                {m.verified ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '4px 10px', borderRadius: 999 }}>✓ {isZh ? '已验证' : 'Verified'}</span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: v3.warning, background: v3.warningSoft, padding: '4px 10px', borderRadius: 999 }}>{isZh ? '等待中' : 'Awaiting'}</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, padding: 14, background: v3.brandSoft, border: `1px solid ${v3.brandSoft}`, borderLeft: `3px solid ${v3.brand}`, borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: v3.textPrimary, marginBottom: 4 }}>
              ✓ {isZh ? '连带责任' : 'Joint & several liability'}
            </div>
            <div style={{ fontSize: 12, color: v3.textSecondary, lineHeight: 1.5 }}>
              {isZh
                ? '每位室友对全部租金承担连带责任。Stayloop 内部分账，房东只看见单笔到账。'
                : 'Each roommate is fully liable for the whole rent. Stayloop holds rent split internally — landlord sees one payment.'}
            </div>
          </div>
        </div>
      </Phone>
    </main>
  )
}
