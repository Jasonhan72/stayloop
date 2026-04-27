'use client'
// /services — Services Marketplace (V3 section 11)
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'

const PROVIDERS = [
  { icon: '🧹', name: 'CleanSlate Toronto', service_en: 'Move-in deep clean', service_zh: '搬入前深度清洁', tag: 'Echo Pick', stars: 4.9, jobs: 1240, price: 280 },
  { icon: '📦', name: 'GTA Movers Co.', service_en: '2-person moving crew', service_zh: '2 人搬家团队', stars: 4.8, jobs: 890, price: 450 },
  { icon: '🔑', name: 'Lock & Key Pros', service_en: 'Smart lock install', service_zh: '智能锁安装', tag: 'Same-day', stars: 4.9, jobs: 320, price: 180 },
]

export default function ServicesPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <header style={{ background: v3.surface, borderBottom: `1px solid ${v3.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: v3.textPrimary }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, background: v3.brand, color: '#fff', fontWeight: 800, fontSize: 14 }}>S</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>stayloop</span>
          </Link>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{isZh ? '服务市场 · Services' : 'Services · 服务市场'}</span>
        </div>
        <span style={{ fontSize: 11, color: v3.textMuted }}>{isZh ? '全部认证 · $2M 保险' : 'All vetted · $2M insured'}</span>
      </header>

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24 }}>
        {/* Echo trigger */}
        <div style={{ background: v3.surface, border: `1px solid ${v3.brandSoft}`, borderLeft: `4px solid ${v3.brand}`, borderRadius: 14, padding: 18, marginBottom: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>✦</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              {isZh ? 'Echo 触发 · 入住前 7 天' : 'ECHO TRIGGERED · 7 DAYS BEFORE MOVE-IN'}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: v3.textPrimary }}>
              {isZh
                ? '5 月 1 日入住 The Hudson #1208。要不要预约入住前深度清洁和搬家服务？我已为你筛了 3 家本区高分服务商。'
                : 'You move into The Hudson #1208 on May 1. Want a move-in deep clean and a moving truck? I lined up the 3 highest-rated providers in your area.'}
            </div>
          </div>
          <button style={{ padding: '8px 16px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            {isZh ? '查看选项' : 'Show options'}
          </button>
        </div>

        {/* Categories */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
          {[
            { icon: '🔧', en: 'Repair', zh: '维修', count: 38 },
            { icon: '🧹', en: 'Cleaning', zh: '清洁', count: 24 },
            { icon: '⚖️', en: 'Legal', zh: '法律', count: 12 },
            { icon: '🐛', en: 'Pest', zh: '害虫防治', count: 8 },
          ].map((c) => (
            <div key={c.en} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.en}</div>
              <div style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-cn), system-ui', marginTop: 2 }}>{c.zh}</div>
              <div style={{ fontSize: 11, color: v3.brandStrong, marginTop: 6, fontWeight: 600 }}>{c.count} {isZh ? '家服务商' : 'providers'}</div>
            </div>
          ))}
        </div>

        {/* Recommended */}
        <div style={{ fontSize: 12, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          {isZh ? '为入住推荐 · RECOMMENDED FOR YOUR MOVE-IN' : 'Recommended for your move-in · 为入住推荐'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 18 }}>
          {PROVIDERS.map((p) => (
            <div key={p.name} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 24 }}>{p.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                    {p.tag && <span style={{ fontSize: 9, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.06em' }}>{p.tag}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: v3.textPrimary, marginTop: 2 }}>{isZh ? p.service_zh : p.service_en}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: v3.textMuted, marginBottom: 12 }}>
                <span>★ {p.stars} · {p.jobs} jobs</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em' }}>${p.price}</span>
                <button style={{ padding: '7px 14px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{isZh ? '预约' : 'Book'}</button>
              </div>
            </div>
          ))}
        </div>

        {/* Active orders */}
        <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            {isZh ? '进行中订单 · ACTIVE ORDERS' : 'YOUR ACTIVE ORDERS · 进行中订单'}
          </div>
          {[
            { name: 'CleanSlate · Apr 30, 9am', status: 'Confirmed', positive: true },
            { name: 'GTA Movers · May 1, 11am', status: 'Pending vendor', positive: false },
          ].map((o) => (
            <div key={o.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${v3.divider}` }}>
              <span style={{ fontSize: 13, color: v3.textPrimary, fontWeight: 500 }}>{o.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: o.positive ? v3.brandStrong : v3.warning, background: o.positive ? v3.brandSoft : v3.warningSoft, padding: '4px 10px', borderRadius: 999 }}>
                {o.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
