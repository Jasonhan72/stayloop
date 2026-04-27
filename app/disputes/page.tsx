'use client'
// /disputes — AI Mediation (V3 section 17)
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'

export default function DisputesPage() {
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
          <span style={{ fontSize: 16, fontWeight: 700 }}>Mediator</span>
          <span style={{ fontSize: 12, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>Case #DSP-2026-0418 · {isZh ? '押金返还纠纷' : 'Deposit return dispute'}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: v3.warning, background: v3.warningSoft, padding: '4px 10px', borderRadius: 999 }}>{isZh ? '调解中 · 第 3 / 14 天' : 'Mediation · Day 3 of 14'}</span>
      </header>

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: 16 }} className="dp-grid">
        {/* Parties */}
        <aside>
          <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            {isZh ? '双方 · PARTIES' : 'PARTIES'}
          </div>
          {[
            { initials: 'WC', name: 'Wei Chen', role_en: 'Tenant', role_zh: '租客', claim: '"$1,400 deposit owed back"', color: v3.info },
            { initials: 'SD', name: 'Sarah Doyle', role_en: 'Landlord', role_zh: '房东', claim: '"$520 deductions valid"', color: v3.warning },
          ].map((p) => (
            <div key={p.initials} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 32, height: 32, borderRadius: 999, background: p.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{p.initials}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: v3.textMuted }}>{isZh ? p.role_zh : p.role_en}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, fontStyle: 'italic', color: v3.textSecondary }}>{p.claim}</div>
            </div>
          ))}
        </aside>

        {/* Mediation thread */}
        <section style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            {isZh ? '调解线程 · MEDIATION THREAD' : 'MEDIATION THREAD'}
          </div>
          <p style={{ fontSize: 12, color: v3.textMuted, fontFamily: 'var(--font-cn), system-ui', margin: '0 0 14px' }}>
            {isZh ? 'AI 协调双方达成和解' : 'AI helps both sides reach a settlement.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Bubble side="left" color={v3.info} label="Wei · TENANT" body="Walls were repainted before move-in. Landlord deducted $400 for 'wall scuffs'. I have move-in photos." />
            <Bubble side="right" color={v3.warning} label="Sarah · LANDLORD" body="Photos show clean white walls. After 12 months there are scuffs requiring a full repaint. $400 covers labour + paint." />

            <div style={{ background: v3.brandSoft, border: `1px solid ${v3.brandSoft}`, borderLeft: `3px solid ${v3.brand}`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                ✦ {isZh ? '调解员 AI · 14k LTB 判决训练' : 'MEDIATOR AI · trained on 14k LTB rulings'}
              </div>
              <div style={{ fontSize: 13, color: v3.textPrimary, lineHeight: 1.55, marginBottom: 8 }}>
                {isZh
                  ? '查阅证据：租客 Apr 30 验房 6 张照片显示新漆。房东 Apr 24 退房 4 张照片显示约 22% 墙面有划痕。'
                  : 'Reviewing evidence — 6 tenant photos (Apr 30 walkthrough) show fresh paint. 4 landlord photos (Apr 24 move-out) show scuffs covering ~22% of total wall area.'}
              </div>
              <div style={{ fontSize: 12, color: v3.textSecondary, lineHeight: 1.55, fontStyle: 'italic', marginBottom: 10 }}>
                Ontario RTA s. 36 + LTB precedent (TST-08741): {isZh ? '12 个月正常磨损不可全部扣除。局部触修可按比例扣除。' : 'routine scuffs over a 12-month tenancy are normal wear. Targeted touch-up of localized damage may be deductible at proportional cost.'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: v3.brandStrong, marginTop: 10 }}>
                {isZh ? '建议方案：从 $400 减至 $120（3 处局部触修 × $40）。押金返还调整为 $1,280。' : 'Proposed split: Repaint cost $400 → reduced to $120 (touch-up of 3 localized areas at $40/area). Deposit return adjusted to $1,280.'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button style={{ padding: '7px 14px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{isZh ? '接受方案' : 'Accept proposal'}</button>
                <button style={{ padding: '7px 14px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{isZh ? '反提案' : 'Counter'}</button>
                <button style={{ padding: '7px 14px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: v3.danger }}>{isZh ? '上报 LTB' : 'Escalate to LTB'}</button>
              </div>
            </div>

            <Bubble side="left" color={v3.info} label="Wei · TENANT" body="That's fair. I accept." />
          </div>

          <div style={{ marginTop: 14, padding: 12, background: v3.surfaceMuted, borderRadius: 10, fontSize: 11, color: v3.textMuted, fontStyle: 'italic' }}>
            {isZh ? '若 14 天未达成，案件自动上报 LTB 并附完整证据包。' : 'If unresolved, case escalates to Ontario LTB with full evidence pack auto-prepared.'}
          </div>
        </section>

        {/* Evidence locker */}
        <aside>
          <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            {isZh ? '证据库 · EVIDENCE LOCKER' : 'EVIDENCE LOCKER · 证据库'}
          </div>
          {[
            { en: 'Move-in walkthrough', meta: 'Apr 30, 2026 · 6 photos · signed by both' },
            { en: 'Move-out walkthrough', meta: 'Apr 24, 2026 · 4 photos · landlord only' },
            { en: 'Lease (signed)', meta: 'LS-9401 · 14 pages' },
            { en: 'Repaint quote', meta: 'Submitted by landlord · $400', dispute: true },
          ].map((e) => (
            <div key={e.en} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: v3.textPrimary }}>{e.en}</div>
              <div style={{ fontSize: 10.5, color: v3.textMuted, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{e.meta}</div>
              {e.dispute && <div style={{ fontSize: 10, fontWeight: 700, color: v3.danger, marginTop: 4 }}>{isZh ? '有争议' : 'Disputed'}</div>}
            </div>
          ))}
        </aside>
      </div>
      <style jsx>{`@media (max-width: 980px){:global(.dp-grid){grid-template-columns:1fr !important;}}`}</style>
    </main>
  )
}

function Bubble({ side, color, label, body }: { side: 'left' | 'right'; color: string; label: string; body: string }) {
  return (
    <div style={{ alignSelf: side === 'left' ? 'flex-start' : 'flex-end', maxWidth: '85%' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: side === 'left' ? '14px 14px 14px 4px' : '14px 14px 4px 14px', padding: '10px 13px', fontSize: 13, color: v3.textPrimary, lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  )
}
