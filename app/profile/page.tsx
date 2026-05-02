'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3 } from '@/lib/brand'

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
    <div style={{ minHeight: '100vh', background: '#F2EEE5', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid #D8D2C2`, padding: '32px 28px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: '#71717A',
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            {isZh ? '设置 · 个人资料' : 'Settings · Profile'}
          </div>
          <h1
            style={{
              fontFamily: 'var(--f-serif)',
              fontSize: 28,
              fontWeight: 600,
              color: '#171717',
              margin: '0 0 6px',
              letterSpacing: '-0.02em',
            }}
          >
            {isZh ? '个人资料、组织和首选项' : 'Profile, organization & preferences'}
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          background: '#fff',
          borderBottom: `1px solid #D8D2C2`,
          padding: '0 28px',
          display: 'flex',
          gap: 0,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id as SectionKey)}
            style={{
              background: 'none',
              border: 'none',
              padding: '14px 16px',
              fontSize: 13,
              fontWeight: section === tab.id ? 600 : 500,
              color: section === tab.id ? '#171717' : '#71717A',
              borderBottom: section === tab.id ? `2px solid #047857` : `2px solid transparent`,
              cursor: 'pointer',
              marginBottom: -1,
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '28px 28px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {section === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
            {/* Main card */}
            <div style={{ background: '#fff', border: `1px solid #D8D2C2`, borderRadius: 8, padding: 24 }}>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: '#71717A',
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {isZh ? '账户' : 'Account'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: '#047857',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 24,
                  }}
                >
                  {(profile.full_name || user.email || '?')
                    .split(' ')
                    .map((s) => s[0])
                    .join('')
                    .toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#171717' }}>
                    {profile.full_name || 'User'}
                  </div>
                  <div style={{ fontSize: 12, color: '#71717A' }}>
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
                      color: '#047857',
                      fontSize: 12,
                      fontWeight: 600,
                      marginTop: 4,
                      cursor: 'pointer',
                      textDecoration: 'underline',
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
                        color: '#71717A',
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
                        border: `1px solid #D8D2C2`,
                        borderRadius: 6,
                        color: '#0B1736',
                        fontFamily: 'var(--f-sans)',
                        fontSize: 14,
                        padding: '11px 14px',
                        height: 44,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button
                  style={{
                    background: '#FFFFFF',
                    color: '#171717',
                    border: '1px solid #C5BDAA',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '10px 18px',
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <button
                  style={{
                    background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '10px 18px',
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '保存更改' : 'Save changes'}
                </button>
              </div>
            </div>

            {/* Sidebar cards */}
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ background: '#fff', border: `1px solid #D8D2C2`, borderRadius: 8, padding: 18 }}>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10.5,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: '#71717A',
                    fontWeight: 700,
                    marginBottom: 10,
                  }}
                >
                  {isZh ? '合规性与数据' : 'Compliance & data'}
                </div>
                <div style={{ display: 'grid', gap: 10, fontSize: 12, color: '#3F3F46' }}>
                  {[
                    [isZh ? '身份验证' : 'Identity verification', isZh ? '已验证 · Persona' : 'Verified · Persona', '#16A34A'],
                    [isZh ? 'SOC 2 Type II' : 'SOC 2 Type II', isZh ? '已审计 · 2025-Q4' : 'Audited · 2025-Q4', '#16A34A'],
                    [isZh ? '数据驻留' : 'Data residency', isZh ? '加拿大 · ca-central-1' : 'Canada · ca-central-1', '#16A34A'],
                    [isZh ? 'PIPEDA / RTA' : 'PIPEDA / RTA', isZh ? '地区 · 安大略省' : 'Region · Ontario', '#16A34A'],
                  ].map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: i < 3 ? `1px dashed #D8D2C2` : 'none',
                      }}
                    >
                      <span>{r[0]}</span>
                      <span style={{ color: r[2] as string, fontWeight: 600 }}>● {r[1]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#EAE5D9', border: `1px solid #D8D2C2`, borderRadius: 8, padding: 18 }}>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10.5,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: '#71717A',
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  {isZh ? '危险区域' : 'Danger zone'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#3F3F46',
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
                    color: '#DC2626',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {isZh ? '请求导出 →' : 'Request export →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {section === 'org' && (
          <div style={{ background: '#fff', border: `1px solid #D8D2C2`, borderRadius: 8, padding: 24 }}>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: '#71717A',
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {isZh ? '组织' : 'Organization'}
            </div>
            <p style={{ color: '#3F3F46', fontSize: 14, lineHeight: 1.6 }}>
              {isZh ? '组织管理功能即将推出。' : 'Organization management coming soon.'}
            </p>
          </div>
        )}

        {section === 'security' && (
          <div style={{ background: '#fff', border: `1px solid #D8D2C2`, borderRadius: 8, padding: 24 }}>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: '#71717A',
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {isZh ? '安全' : 'Security'}
            </div>
            <button
              onClick={() => signOut()}
              style={{
                background: '#FFFFFF',
                color: '#171717',
                border: '1px solid #C5BDAA',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 18px',
                cursor: 'pointer',
              }}
            >
              {isZh ? '登出' : 'Sign out'}
            </button>
          </div>
        )}

        {section === 'integrations' && (
          <div style={{ background: '#fff', border: `1px solid #D8D2C2`, borderRadius: 8, padding: 24 }}>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: '#71717A',
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {isZh ? '集成' : 'Integrations'}
            </div>
            <p style={{ color: '#3F3F46', fontSize: 14, lineHeight: 1.6 }}>
              {isZh ? '集成管理功能即将推出。' : 'Integration management coming soon.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
