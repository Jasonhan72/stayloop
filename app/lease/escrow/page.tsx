'use client'
// /lease/escrow — Lease eSign + Escrow (V3 section 16)
import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

const TIMELINE = [
  { date: 'Apr 21', en: 'Passport verified', zh: '通行证已验证', who: 'Wei (tenant)', done: true },
  { date: 'Apr 22', en: 'Lease drafted by Atlas', zh: 'AI 起草合同', who: 'Atlas agent', done: true },
  { date: 'Apr 24', en: 'Tenant signed', zh: '租客签字', who: 'Wei (tenant)', done: true },
  { date: 'Apr 25', en: 'Landlord signed', zh: '房东签字', who: 'Sarah (landlord)', done: true },
  { date: 'Apr 26', en: 'First month + deposit', zh: '首月+押金', who: 'Stayloop Escrow · $4,700', escrow: true },
  { date: 'May 1', en: 'Move-in walkthrough', zh: '入住验房', who: 'Both parties', pending: true },
]

export default function LeaseEscrowPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [activeParty, setActiveParty] = useState<'tenant' | 'landlord'>('tenant')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const handleMouseDown = (e: MouseEvent) => {
      setIsDrawing(true)
      const rect = canvas.getBoundingClientRect()
      ctx.beginPath()
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing) return
      const rect = canvas.getBoundingClientRect()
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
      ctx.strokeStyle = v3.brand
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    const handleMouseUp = () => {
      setIsDrawing(false)
      ctx.closePath()
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseout', handleMouseUp)

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseout', handleMouseUp)
    }
  }, [isDrawing, v3.brand])

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  return (
    <PageShell role="tenant">
      <div style={{ maxWidth: size.content.wide, margin: '0 auto', paddingLeft: 24, paddingRight: 24, paddingTop: 24 }}>
        <SecHead
          eyebrow={isZh ? '用户工作区' : 'Tenant Workspace'}
          title={isZh ? '资金托管' : 'Escrow Service'}
        />
      </div>

      {/* Party role tabs */}
      <div style={{ background: v3.surfaceMuted, borderBottom: `1px solid ${v3.divider}`, paddingLeft: 24, paddingRight: 24 }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto', display: 'flex', gap: 24 }}>
          {[
            { key: 'tenant', en: 'Tenant view', zh: '租客视图' },
            { key: 'landlord', en: 'Landlord view', zh: '房东视图' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveParty(tab.key as 'tenant' | 'landlord')}
              style={{
                padding: '14px 0',
                fontSize: 13,
                fontWeight: 600,
                color: activeParty === tab.key ? v3.brand : v3.textMuted,
                background: 'transparent',
                border: 'none',
                borderBottom: activeParty === tab.key ? `2px solid ${v3.brand}` : 'none',
                cursor: 'pointer',
              }}
            >
              {isZh ? tab.zh : tab.en}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24 }} className="le-grid">
        <style jsx>{`
          @media (max-width: 1023px) {
            :global(.le-grid) {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
        {/* Timeline */}
        <section>
          <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              {isZh ? '从验证到资金到账 · 11 天闭环' : '11-DAY CLOSE'}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>{isZh ? '关闭时间线' : 'Closing timeline'}</h2>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 11, top: 0, bottom: 0, width: 1, background: v3.divider }} />
              {TIMELINE.map((t, i) => (
                <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: t.done ? v3.brand : t.escrow ? v3.warning : v3.divider, color: t.done || t.escrow ? '#fff' : v3.textMuted, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, zIndex: 1 }}>
                    {t.done ? '✓' : t.escrow ? '$' : i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{isZh ? t.zh : t.en}</div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>{t.who}</div>
                  </div>
                  <span style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>{t.date}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, padding: 12, background: v3.brandSoft, borderRadius: 10, fontSize: 11, color: v3.textPrimary, lineHeight: 1.5 }}>
              {isZh
                ? '由 Stayloop Trust 托管 · CDIC 保险 · 验房通过后释放给房东。'
                : 'Held by Stayloop Trust · CDIC-insured · released on walkthrough sign-off.'}
            </div>

            <div style={{ marginTop: 14, padding: 12, background: v3.surfaceCard, borderRadius: 10, border: `1px solid ${v3.divider}`, fontSize: 12, color: v3.textPrimary, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700 }}>$4,700 in escrow</span> · {isZh ? '验房通过后于 4 月 30 日释放' : 'Released after walkthrough Apr 30'}
            </div>
          </div>
        </section>

        {/* Lease document */}
        <section style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 28, fontFamily: 'serif' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, fontFamily: 'var(--font-inter), sans-serif' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{isZh ? '租约文档' : 'LEASE DOCUMENT'}</h2>
            <span style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '4px 10px', borderRadius: 999 }}>{isZh ? '双方已签' : 'Both signed'}</span>
          </div>

          <div style={{ borderTop: `2px solid ${v3.textPrimary}`, borderBottom: `2px solid ${v3.textPrimary}`, padding: '18px 0', marginBottom: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'serif', textAlign: 'center', marginBottom: 4 }}>ONTARIO STANDARD LEASE</div>
            <div style={{ fontSize: 11, color: v3.textMuted, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>Form 2229 · Generated by Atlas AI · Apr 22, 2026</div>
          </div>

          <div style={{ fontSize: 13, color: v3.textPrimary, lineHeight: 1.8, marginBottom: 18, fontFamily: 'var(--font-inter), sans-serif' }}>
            <div><b>Tenant:</b> Wei Chen · <b>Landlord:</b> Sarah Doyle</div>
            <div><b>Premises:</b> 2350 King St W, Unit 1208, Toronto, ON</div>
            <div><b>Term:</b> 12 months · May 1, 2026 — Apr 30, 2027</div>
            <div><b>Rent:</b> $2,350/mo · 1st of each month</div>
            <div><b>Last month deposit:</b> $2,350 (held in Stayloop escrow)</div>
          </div>

          <div style={{ background: v3.warningSoft, borderLeft: `3px solid ${v3.warning}`, padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.5, color: v3.textPrimary, fontFamily: 'var(--font-inter), sans-serif', marginBottom: 18 }}>
            ⚠ {isZh
              ? 'Section 5(b) — 安省 RTA 不允许损坏押金。Atlas 已自动移除该条款。'
              : 'Section 5(b) — pet deposit not permitted under RTA. Auto-removed by Atlas.'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 32, fontFamily: 'var(--font-inter), sans-serif' }}>
            {[
              { name: 'Wei Chen', role: 'Tenant · Apr 24' },
              { name: 'S. Doyle', role: 'Landlord · Apr 25' },
            ].map((sig) => (
              <div key={sig.name} style={{ borderTop: `1px solid ${v3.borderStrong}`, paddingTop: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'cursive', color: v3.brandStrong, marginBottom: 4 }}>{sig.name}</div>
                <div style={{ fontSize: 11, color: v3.textMuted }}>{sig.role}</div>
              </div>
            ))}
          </div>

          {/* Interactive signature pad */}
          <div style={{ marginTop: 32, borderTop: `2px solid ${v3.divider}`, paddingTop: 24, fontFamily: 'var(--font-inter), sans-serif' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              {activeParty === 'tenant' ? (isZh ? '租客签名 / Tenant Signature' : 'TENANT SIGNATURE · 租客签名') : (isZh ? '房东签名 / Landlord Signature' : 'LANDLORD SIGNATURE · 房东签名')}
            </div>
            <canvas
              ref={canvasRef}
              width={300}
              height={100}
              style={{
                border: `2px solid ${v3.border}`,
                borderRadius: 10,
                background: v3.surfaceCard,
                cursor: 'crosshair',
                display: 'block',
                marginBottom: 10,
              }}
            />
            <button
              onClick={clearSignature}
              style={{
                padding: '8px 14px',
                background: v3.surfaceMuted,
                border: `1px solid ${v3.border}`,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                color: v3.textSecondary,
                cursor: 'pointer',
              }}
            >
              {isZh ? '清除' : 'Clear'}
            </button>
          </div>

          <div style={{ marginTop: 24, textAlign: 'center', fontFamily: 'var(--font-inter), sans-serif' }}>
            <button style={{ padding: '10px 20px', background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
              {isZh ? '下载 PDF 租约' : 'Download lease (PDF)'}
            </button>
          </div>
        </section>
      </div>
    </PageShell>
  )
}
