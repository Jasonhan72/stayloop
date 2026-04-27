'use client'
// /agent/day — Field Agent Day Brief (V3 section 07)
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'

const TASKS = [
  { time: '15:00', dur: '30 min', title_en: 'Tour · The Hudson #1208', title_zh: '带看 · The Hudson 1208', who: 'Wei Chen · Score 92', tag: 'Logic Pick' },
  { time: '15:45', dur: '30 min', title_en: 'Tour · 88 Blue Jays Way', title_zh: '带看 · 88 Blue Jays', who: 'Aisha Okafor · Score 84', tag: 'Tenant Agent' },
  { time: '16:30', dur: '20 min', title_en: 'Tour · 39 Niagara St', title_zh: '带看 · 39 Niagara', who: 'Marco Rossi · Score 78' },
]

const PAYOUTS = [
  { name: '88 Blue Jays · #1408', amount: 1840, status: 'Paid' },
  { name: '160 Frederick · 902', amount: 2080, status: 'Paid' },
  { name: 'The Hudson · 1208', amount: 2000, status: 'Pending' },
  { name: '39 Niagara · 311', amount: 1680, status: 'Pending' },
]

export default function AgentDayPage() {
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
          <span style={{ width: 28, height: 28, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>JH</span>
          <span style={{ fontSize: 13, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>RECO #4827193</span>
        </div>
        <span style={{ fontSize: 12, color: v3.textMuted }}>Mon · Apr 20 · 14:22</span>
      </header>

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>
          {isZh ? '下午好，Jason' : 'Good afternoon, Jason'}
        </h1>
        <div style={{ fontSize: 13, color: v3.textMuted, marginBottom: 20, fontFamily: 'var(--font-cn), system-ui' }}>
          {isZh ? '今天有 3 场带看，1 个待签租约' : '3 showings today · 1 lease pending signature'}
        </div>

        {/* AI brief banner */}
        <div style={{ background: v3.surface, border: `1px solid ${v3.brandSoft}`, borderLeft: `4px solid ${v3.brand}`, borderRadius: 14, padding: 18, marginBottom: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>✦</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              Echo + Logic · {isZh ? '今日简报' : 'YOUR DAY'}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: v3.textPrimary }}>
              {isZh
                ? '今天三场带看都在 King West (3-5pm)。最佳租客是陈伟 (#1208) — 重点讲阳台和朝南采光。'
                : 'Drive efficient route: 3 showings clustered in King West from 3pm–5pm. I prepped briefs for each — Wei Chen at #1208 is the highest-fit tenant; lead with the balcony and the south light.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ padding: '8px 14px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: v3.textSecondary }}>📍 {isZh ? '路线' : 'Route'}</button>
            <button style={{ padding: '8px 14px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{isZh ? '语音简报' : 'Brief me out loud'}</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }} className="ad-grid">
          {/* Tasks */}
          <section style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{isZh ? '今日任务' : "Today's tasks"}</h2>
              <span style={{ fontSize: 11, color: v3.textMuted }}>3 of 7 done</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TASKS.map((t) => (
                <div key={t.time} style={{ display: 'flex', gap: 14, padding: 12, background: v3.surfaceMuted, borderRadius: 10 }}>
                  <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 60 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em' }}>{t.time}</div>
                    <div style={{ fontSize: 10, color: v3.textMuted }}>{t.dur}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{isZh ? t.title_zh : t.title_en}</span>
                      {t.tag && <span style={{ fontSize: 9, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.06em' }}>{t.tag}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: v3.textMuted }}>{t.who}</div>
                  </div>
                  <button style={{ alignSelf: 'center', padding: '6px 12px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 7, fontSize: 11.5, color: v3.textSecondary, fontWeight: 600 }}>
                    {isZh ? '查看 brief' : 'Open brief'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Earnings + AI did this week */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                {isZh ? '本月收入 · EARNINGS' : 'EARNINGS · APRIL'}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em', marginBottom: 4 }}>$16,400 <span style={{ fontSize: 12, color: v3.textMuted, fontWeight: 500 }}>CAD</span></div>
              <div style={{ fontSize: 11, color: v3.brandStrong, marginBottom: 12 }}>↑ 38% MoM · 4 deals · 80% take</div>
              <div style={{ borderTop: `1px solid ${v3.divider}`, paddingTop: 10, fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                {isZh ? '近期付款' : 'RECENT PAYOUTS'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {PAYOUTS.map((p) => (
                  <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <div>
                      <div style={{ color: v3.textPrimary, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: p.status === 'Paid' ? v3.brandStrong : v3.warning, fontWeight: 600 }}>{p.status}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${p.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                {isZh ? '本周 AI 帮你做了' : 'AI DID THIS WEEK'}
              </div>
              {[
                { en: 'Listings drafted by Nova', zh: 'Nova 起草', val: 7 },
                { en: 'Tenant chats by Echo', zh: 'Echo 聊天', val: 142 },
                { en: 'Calendars matched', zh: '日历匹配', val: 11 },
                { en: 'Time saved', zh: '节省', val: '~14 h' },
              ].map((r) => (
                <div key={r.en} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${v3.divider}` }}>
                  <span style={{ color: v3.textSecondary }}>{isZh ? r.zh : r.en}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{r.val}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 880px) { :global(.ad-grid) { grid-template-columns: 1fr !important; } }
      `}</style>
    </main>
  )
}
