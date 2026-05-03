'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import PageShell from '@/components/v4/PageShell'

export default function AgentDashboardPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [stats, setStats] = useState({
    activeClients: 12,
    openPackages: 4,
    approvalRate: 71,
    pipelineValue: 36000,
  })
  const [packageData, setPackageData] = useState([
    { c: 'Jamie Liu', listing: '52 Wellesley E · 1207', stage: 'Viewed by landlord', tone: 'gold', readiness: 88, when: 'Today' },
    { c: 'R. Patel', listing: '905 King W · PH3', stage: 'Awaiting consent', tone: 'warn', readiness: 64, when: 'Today' },
    { c: 'Mei Chen', listing: '14 York St · 802', stage: 'Sent · 2 viewed', tone: 'info', readiness: 91, when: 'Yesterday' },
    { c: 'D. Robinson', listing: '80 Mill St · 312', stage: 'Approved', tone: 'ok', readiness: 96, when: 'Aug 22' },
  ])

  if (user && user.role !== 'agent') {
    const roleDisplay = user.role === 'tenant' ? (isZh ? '租客' : 'Tenant') : (isZh ? '房东' : 'Landlord')
    return (
      <PageShell role="agent">
        <div style={{ maxWidth: 480, margin: '64px auto', textAlign: 'center', background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 16, padding: 40 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            {isZh ? '此页面仅供经纪使用' : 'Agent access only'}
          </h1>
          <p style={{ color: v3.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
            {isZh
              ? `你的账户身份是${roleDisplay}，看不到这个页面。如果身份错了，去账户设置里改。`
              : `Your account is ${roleDisplay}. If that's wrong, update it in Account settings.`}
          </p>
          <button
            onClick={() => window.location.href = '/'}
            style={{ display: 'inline-flex', padding: '10px 20px', background: v3.brand, color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none', border: 'none', cursor: 'pointer' }}
          >
            {isZh ? '返回首页' : 'Go home'} →
          </button>
        </div>
      </PageShell>
    )
  }

  const getToneColor = (tone: string) => {
    switch (tone) {
      case 'ok': return v3.success
      case 'gold': return v3.brandBright
      case 'warn': return v3.warning
      case 'info': return v3.info
      default: return v3.textMuted
    }
  }

  const getToneBackground = (tone: string) => {
    switch (tone) {
      case 'ok': return v3.successSoft
      case 'gold': return v3.brandSoft
      case 'warn': return v3.warningSoft
      case 'info': return v3.infoSoft
      default: return v3.divider
    }
  }

  return (
    <PageShell role="agent">
      {/* Eyebrow */}
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: v3.textMuted, fontWeight: 700, marginBottom: 6 }}>
        {isZh ? '经纪 · 正在为你处理客户流程' : 'Agent · Working through your client pipeline'}
      </div>

      {/* Title + subtitle */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--f-serif)', fontSize: 30, fontWeight: 600, color: v3.textPrimary, letterSpacing: '-0.02em' }}>
          {stats.openPackages} packages in flight · {stats.activeClients} active clients
        </h1>
      </div>
      <p style={{ color: v3.textSecondary, fontSize: 14, margin: '6px 0 24px', lineHeight: 1.5 }}>
        {isZh
          ? '系统整理行政工作，你专注带看、谈判与关系。今早房东查看了 2 个包，1 个客户等待你的跟进。'
          : 'The system handles admin so you stay focused on showings, negotiation and relationships. 2 packages viewed by landlords this morning · 1 client waiting on your follow-up.'}
      </p>

      {/* KPI cards 1.5fr 1fr grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }} className="a-kpis-4col">
        {[
          { label: isZh ? '活跃客户' : 'Active clients', value: '12', sub: isZh ? '本周新增3个' : '3 added this week', tone: 'gold' },
          { label: isZh ? '开放包' : 'Open packages', value: '4', sub: isZh ? '今日查看2个' : '2 viewed today', tone: 'ai' },
          { label: isZh ? '批准率' : 'Approval rate', value: '71%', sub: isZh ? '最近30天' : 'Last 30 days', tone: 'ok' },
          { label: isZh ? '管道价值' : 'Pipeline value', value: '$36k', sub: isZh ? '已成交租约 / 月' : 'Closed leases / mo', tone: 'pri' },
        ].map((kpi, i) => (
          <div key={i} style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: v3.textMuted, fontWeight: 700, marginBottom: 6 }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 30, fontWeight: 500, color: kpi.tone === 'pri' ? v3.textPrimary : kpi.tone === 'gold' ? v3.brandBright : kpi.tone === 'ok' ? v3.success : v3.trust, marginTop: 6, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              {kpi.value}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 11, color: v3.textMuted }}>{kpi.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Package pipeline + actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18 }} className="a-twopane">
        <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 0, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
          <div style={{ padding: '14px 22px', borderBottom: `1px solid ${v3.border}`, display: 'flex', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--f-serif)', fontSize: 17, fontWeight: 600 }}>
              {isZh ? '包管道' : 'Package pipeline'}
            </h3>
            <span style={{ fontSize: 12, color: v3.textMuted, marginLeft: 10 }}>
              {stats.openPackages} {isZh ? '进行中' : 'in flight'}
            </span>
            <div style={{ flex: 1 }} />
            <button style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              + {isZh ? '新包' : 'New package'}
            </button>
          </div>
          {packageData.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1.4fr 1.2fr 110px 130px 90px', gap: 14, padding: '14px 22px', borderTop: `1px solid ${v3.border}`, alignItems: 'center', fontSize: 13 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: v3.brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 11 }}>
                {p.c.split(' ').map(w => w[0]).join('').toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: v3.textPrimary }}>{p.c}</div>
                <div style={{ fontSize: 11, color: v3.textMuted }}>{p.listing}</div>
              </div>
              <div style={{ width: 130 }}>
                <div style={{ height: 6, background: v3.divider, borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
                  <div style={{ width: `${p.readiness}%`, height: '100%', background: getToneColor(p.tone) }} />
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: v3.textMuted }}>{p.readiness}% ready</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid ${getToneBackground(p.tone).replace(/[0-9.]/g, '').match(/\(([^)]+)\)/)?.[1] || 'transparent'}`, color: getToneColor(p.tone), background: getToneBackground(p.tone) }}>
                {p.stage}
              </span>
              <span style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{p.when}</span>
              <button style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, justifySelf: 'end' }}>
                Open →
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ background: 'linear-gradient(180deg, #F3EEFF 0%, #fff 100%)', border: '1px solid #D7C5FA', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: v3.trust, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 11 }}>✦</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>
                {isZh ? "今日行动" : "Today's actions"}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { title: isZh ? '重新发送同意书给R. Patel' : 'Resend consent to R. Patel', body: isZh ? '背景检查同意在24小时内过期。' : 'Background check consent expires in 24h.', cta: 'Resend' },
                { title: isZh ? '跟进52 Wellesley包' : 'Follow up on 52 Wellesley package', body: isZh ? '昨天查看了两次但没有决定。' : 'Viewed twice yesterday but no decision.', cta: 'Message' },
                { title: isZh ? '为Jamie Liu添加第二个推荐人' : 'Add 2nd reference to Jamie Liu', body: isZh ? '列表要求2个推荐人——只附加了1个。' : 'Listing requires 2 references — only 1 attached.', cta: 'Request' },
                { title: isZh ? '品牌·更新徽标PNG' : 'Branding · update logo PNG', body: isZh ? '旧徽标在报表封面上。为新包重新上传。' : 'Old logo on report cover. Re-upload for new packages.', cta: 'Open settings' },
              ].map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: v3.textPrimary, lineHeight: 1.5 }}>
                  <span style={{ color: v3.trust, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, marginTop: 2 }}>›</span>
                  <span style={{ flex: 1 }}>
                    {it.title && <div style={{ fontWeight: 600 }}>{it.title}</div>}
                    <div style={{ color: v3.textSecondary, fontSize: 13 }}>{it.body}</div>
                  </span>
                  {it.cta && <button style={{ background: 'none', border: 'none', color: v3.trust, padding: 0, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{it.cta}</button>}
                </div>
              ))}
            </div>
            <button style={{ width: '100%', marginTop: 12, padding: '10px 16px', background: v3.surfaceCard, color: v3.textPrimary, border: `1px solid ${v3.borderStrong}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {isZh ? '打开AI副驾' : 'Open AI Copilot'}
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 860px) {
          :global(.a-kpis-4col) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          :global(.a-twopane) {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 600px) {
          :global(.a-kpis-4col) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </PageShell>
  )
}
