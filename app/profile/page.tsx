'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3 } from '@/lib/brand'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'
import Tabs from '@/components/v4/Tabs'
import Avatar from '@/components/v4/Avatar'

type SectionKey = 'profile' | 'org' | 'security' | 'integrations'
type Role = 'landlord' | 'tenant' | 'agent'
type Plan = 'free' | 'pro' | 'enterprise'

interface ProfileData {
  full_name: string | null
  phone: string | null
  role: Role
  company_name: string | null
  plan: Plan
}

export default function SettingsPage() {
  const { user, loading: authLoading, signOut } = useUser({ redirectIfMissing: true })
  const { t, lang } = useT()
  const isZh = lang === 'zh'

  const [section, setSection] = useState<SectionKey>('profile')
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('landlords')
        .select('full_name, phone, role, company_name, plan')
        .eq('id', user.profileId)
        .single()
      if (data) {
        setProfile({
          full_name: data.full_name || '',
          phone: data.phone || '',
          role: (data.role as Role) || 'landlord',
          company_name: data.company_name || '',
          plan: (data.plan as Plan) || 'free',
        })
      } else {
        setProfile({ full_name: '', phone: '', role: 'landlord', company_name: '', plan: 'free' })
      }
      setLoading(false)
    })()
  }, [user])

  async function saveField(patch: Partial<ProfileData>): Promise<string | null> {
    if (!user) return 'Not authenticated'
    const { error } = await supabase
      .from('landlords')
      .update(patch)
      .eq('id', user.profileId)
    if (error) return error.message
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev))
    return null
  }

  if (authLoading || !user || loading || !profile) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F2EEE5' }}>
        <div style={{ textAlign: 'center', color: '#71717A', fontSize: 14 }}>
          {isZh ? '加载中…' : 'Loading…'}
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'profile', label: isZh ? '个人资料' : 'Profile' },
    { id: 'org', label: isZh ? '组织' : 'Organization' },
    { id: 'security', label: isZh ? '安全' : 'Security' },
    { id: 'integrations', label: isZh ? '集成' : 'Integrations' },
  ] as const

  return (
    <PageShell>
      <SecHead
        eyebrow={isZh ? '设置 · 个人资料' : 'Settings · Profile'}
        title={isZh ? '个人资料、组织和首选项' : 'Profile, organization & preferences'}
      />

      <Tabs
        items={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        active={section}
        onChange={(id) => setSection(id as SectionKey)}
      />

      {/* Content */}
      <div style={{ padding: '28px 28px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {section === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
            {/* Main card */}
            <div style={{ background: '#fff', border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {isZh ? '账户' : 'Account'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <Avatar name={profile.full_name || user.email || '?'} size={56} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: v3.textPrimary }}>
                    {profile.full_name || 'User'}
                  </div>
                  <div style={{ fontSize: 12, color: v3.textMuted }}>
                    {profile.role === 'landlord'
                      ? isZh ? '房东' : 'Landlord'
                      : profile.role === 'tenant'
                        ? isZh ? '租客' : 'Tenant'
                        : isZh ? '代理' : 'Agent'}
                  </div>
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: v3.brand,
                      fontSize: 12,
                      fontWeight: 600,
                      marginTop: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {isZh ? '更改照片 →' : 'Change photo →'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  [isZh ? '全名' : 'Full name', profile.full_name || ''],
                  [isZh ? '邮箱' : 'Email', user.email],
                  [isZh ? '电话' : 'Phone', profile.phone || ''],
                  [isZh ? '语言' : 'Language', 'English · 中文'],
                  [isZh ? '时区' : 'Timezone', 'America/Toronto · UTC-5'],
                  [isZh ? '默认物业' : 'Default property', '128 Bathurst St'],
                ].map((f, i) => (
                  <div key={i}>
                    <label
                      style={{
                        fontSize: 11,
                        color: v3.textMuted,
                        fontFamily: 'JetBrains Mono, monospace',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontWeight: 700,
                        display: 'block',
                        marginBottom: 5,
                      }}
                    >
                      {f[0]}
                    </label>
                    <input
                      type="text"
                      defaultValue={f[1]}
                      style={{
                        width: '100%',
                        background: '#FFFFFF',
                        border: `1px solid ${v3.border}`,
                        borderRadius: 10,
                        color: v3.textPrimary,
                        fontFamily: 'var(--f-sans)',
                        fontSize: 14,
                        padding: '11px 14px',
                        height: 44,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = v3.brand)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = v3.border)}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    background: '#fff',
                    color: v3.textPrimary,
                    border: `1px solid ${v3.borderStrong}`,
                    borderRadius: 10,
                    padding: '10px 18px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <button
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 10,
                    padding: '11px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 8px 22px -10px rgba(52,211,153,0.45), 0 1px 0 rgba(255,255,255,0.30) inset',
                  }}
                >
                  {isZh ? '保存更改' : 'Save changes'}
                </button>
              </div>
            </div>

            {/* Sidebar cards */}
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ background: '#fff', border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10.5,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: v3.textMuted,
                    fontWeight: 700,
                    marginBottom: 10,
                  }}
                >
                  {isZh ? '合规性与数据' : 'Compliance & data'}
                </div>
                <div style={{ display: 'grid', gap: 10, fontSize: 12, color: v3.textSecondary }}>
                  {[
                    [isZh ? '身份验证' : 'Identity verification', isZh ? '已验证 · Persona' : 'Verified · Persona', v3.success],
                    [isZh ? 'SOC 2 Type II' : 'SOC 2 Type II', isZh ? '已审计 · 2025-Q4' : 'Audited · 2025-Q4', v3.success],
                    [isZh ? '数据驻留' : 'Data residency', isZh ? '加拿大 · ca-central-1' : 'Canada · ca-central-1', v3.success],
                    [isZh ? 'PIPEDA / RTA' : 'PIPEDA / RTA', isZh ? '地区 · 安大略省' : 'Region · Ontario', v3.success],
                  ].map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: i < 3 ? `1px dashed ${v3.border}` : 'none',
                      }}
                    >
                      <span>{r[0]}</span>
                      <span style={{ color: r[2] as string, fontWeight: 600 }}>● {r[1]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10.5,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: v3.textMuted,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  {isZh ? '危险区域' : 'Danger zone'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: v3.textSecondary,
                    marginBottom: 10,
                    lineHeight: 1.5,
                  }}
                >
                  {isZh
                    ? '导出所有数据 · 关闭组织 · 删除账户。审计日志将保留法定最低期限。'
                    : 'Export all data · Close organization · Delete account. Audit logs retained for legal minimum.'}
                </div>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: v3.danger,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '请求导出 →' : 'Request export →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {section === 'org' && (
          <div style={{ background: '#fff', border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: v3.textMuted,
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {isZh ? '组织' : 'Organization'}
            </div>
            <p style={{ color: v3.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
              {isZh ? '组织管理功能即将推出。' : 'Organization management coming soon.'}
            </p>
          </div>
        )}

        {section === 'security' && (
          <div style={{ background: '#fff', border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: v3.textMuted,
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {isZh ? '安全' : 'Security'}
            </div>
            <button
              onClick={() => signOut()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: '#fff',
                color: v3.textPrimary,
                border: `1px solid ${v3.borderStrong}`,
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isZh ? '登出' : 'Sign out'}
            </button>
          </div>
        )}

        {section === 'integrations' && (
          <div style={{ background: '#fff', border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: v3.textMuted,
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {isZh ? '集成' : 'Integrations'}
            </div>
            <p style={{ color: v3.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
              {isZh ? '集成管理功能即将推出。' : 'Integration management coming soon.'}
            </p>
          </div>
        )}
      </div>
    </PageShell>
  )
}
