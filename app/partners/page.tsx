'use client'
// /partners — B2B Partner Onboarding (V3 section 14)
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'

const STEPS = [
  { en: 'Create org', zh: '创建组织', minutes: 2, done: true },
  { en: 'Pick endpoints', zh: '选择端点', minutes: 4, done: true },
  { en: 'Webhook target', zh: '回调地址', minutes: 6, active: true },
  { en: 'Test in sandbox', zh: '沙盒测试', minutes: 10 },
  { en: 'Compliance review', zh: '合规审查', minutes: 5 },
  { en: 'Go live', zh: '正式上线', minutes: 3 },
]

const FEED = [
  { ts: '14:24:12', event: 'identity.verified', dur: '89ms', code: 200 },
  { ts: '14:24:09', event: 'identity.verified', dur: '102ms', code: 200 },
  { ts: '14:23:55', event: 'score.computed', dur: '67ms', code: 200 },
  { ts: '14:23:44', event: 'income.verified', dur: '134ms', code: 200 },
  { ts: '14:22:18', event: 'identity.verified', dur: '4982ms', code: 500 },
  { ts: '14:21:02', event: 'score.computed', dur: '91ms', code: 200 },
]

export default function PartnersPage() {
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
          <span style={{ fontSize: 14, fontWeight: 600 }}>Partner Console</span>
          <span style={{ fontSize: 12, color: v3.textMuted }}>Northbridge Insurance · {isZh ? '设置接入' : 'Setup'}</span>
        </div>
        <span style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>org_3kf9... · sandbox</span>
      </header>

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '240px 1fr 280px', gap: 18 }} className="pn-grid">
        {/* Steps */}
        <aside>
          <div style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>SETUP · 30 MIN</div>
          <div style={{ marginTop: 12 }}>
            {STEPS.map((s, i) => (
              <div key={s.en} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: s.active ? v3.brandSoft : 'transparent', marginBottom: 2 }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: s.done ? v3.brand : s.active ? v3.brand : v3.divider, color: s.done || s.active ? '#fff' : v3.textMuted, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                  {s.done ? '✓' : i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: s.active || s.done ? v3.textPrimary : v3.textMuted }}>{isZh ? s.zh : s.en}</div>
                  <div style={{ fontSize: 10, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>{s.minutes} min</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Form */}
        <section style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>STEP 3 · WEBHOOKS</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {isZh ? '在哪里推送核验事件？' : 'Where should we deliver verification events?'}
          </h1>
          <p style={{ fontSize: 13, color: v3.textMuted, marginBottom: 18, fontFamily: 'var(--font-cn), system-ui' }}>
            {isZh ? '设置 Webhook 接收 Stayloop 推送的核验事件' : '设置 Webhook 接收 Stayloop 推送的核验事件'}
          </p>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            {isZh ? '回调 URL' : 'Endpoint URL'}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <input
              defaultValue="https://api.northbridge.ca/stayloop/webhooks"
              style={{ flex: 1, padding: '11px 14px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-mono)' }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '4px 10px', borderRadius: 999 }}>✓ Reachable · 89ms</span>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            {isZh ? '订阅事件' : 'Events to subscribe to'}
          </div>
          {[
            { evt: 'identity.verified', label: 'Government ID + liveness passed', on: true },
            { evt: 'income.verified', label: 'Bank deposits sealed and signed', on: true },
            { evt: 'score.computed', label: 'Stayloop Score available', on: true },
            { evt: 'passport.shared', label: 'Renter granted you read access', on: false },
            { evt: 'passport.revoked', label: 'Renter revoked your access', on: false },
          ].map((e) => (
            <div key={e.evt} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: v3.surfaceMuted, borderRadius: 8, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{e.evt}</div>
                <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>{e.label}</div>
              </div>
              <span style={{ width: 32, height: 18, borderRadius: 999, background: e.on ? v3.brand : v3.divider, position: 'relative' }}>
                <span style={{ position: 'absolute', top: 2, left: e.on ? 16 : 2, width: 14, height: 14, borderRadius: 999, background: '#fff', transition: 'left 200ms' }} />
              </span>
            </div>
          ))}

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{isZh ? '签名密钥' : 'Signing secret'}</div>
            <div style={{ padding: '10px 14px', background: v3.ink, color: v3.brandBright2, borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-mono)', display: 'flex', justifyContent: 'space-between' }}>
              <span>whsec_3kF9pQrLm2x••••••••••••••••••••</span>
              <span style={{ color: v3.textFaint, cursor: 'pointer' }}>{isZh ? '一次性显示' : 'Reveal once'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <button style={{ padding: '10px 18px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 13, fontWeight: 600 }}>← {isZh ? '返回' : 'Back'}</button>
            <button style={{ padding: '10px 22px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
              {isZh ? '发送测试事件' : 'Send test event'} →
            </button>
          </div>
        </section>

        {/* Event feed */}
        <aside style={{ background: v3.ink, color: '#fff', borderRadius: 14, padding: 16, alignSelf: 'start' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.brandBright, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            EVENT FEED · SANDBOX
          </div>
          {FEED.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '6px 0', borderBottom: i < FEED.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{e.ts}</span>
              <span style={{ flex: 1, color: '#fff' }}>{e.event}</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{e.dur}</span>
              <span style={{ color: e.code === 200 ? v3.brandBright : v3.danger, fontWeight: 700 }}>{e.code}</span>
            </div>
          ))}
        </aside>
      </div>
      <style jsx>{`@media (max-width: 980px){:global(.pn-grid){grid-template-columns:1fr !important;}}`}</style>
    </main>
  )
}
