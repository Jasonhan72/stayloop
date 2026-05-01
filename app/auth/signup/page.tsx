'use client'

import { useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT, LanguageToggle } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useIsMobile } from '@/lib/useMediaQuery'

type Role = 'tenant' | 'landlord' | 'agent' | null

interface SignupStep {
  step: 'role' | 'form'
  selectedRole: Role
  email: string
  password: string
  fullName: string
  isSubmitting: boolean
  error: string | null
  successMessage: boolean
}

export default function SignupPage() {
  const { lang, t } = useT()
  const isZh = lang === 'zh'
  const isMobile = useIsMobile()
  const [state, setState] = useState<SignupStep>({
    step: 'role',
    selectedRole: null,
    email: '',
    password: '',
    fullName: '',
    isSubmitting: false,
    error: null,
    successMessage: false,
  })

  const roles = [
    {
      id: 'tenant' as const,
      icon: '🔑',
      title_en: "I'm a Renter",
      title_zh: '我是租客',
      desc_en: 'Apply to listings and manage your rental journey',
      desc_zh: '申请房源，管理你的租赁之旅',
    },
    {
      id: 'landlord' as const,
      icon: '🏠',
      title_en: "I'm a Landlord",
      title_zh: '我是房东',
      desc_en: 'Screen tenants and manage properties',
      desc_zh: '筛查租客，管理房产',
    },
    {
      id: 'agent' as const,
      icon: '🏢',
      title_en: "I'm an Agent",
      title_zh: '我是房产经纪',
      desc_en: 'Help clients find and manage rentals',
      desc_zh: '帮助客户寻找和管理租赁',
    },
  ]

  const handleRoleSelect = (role: Role) => {
    setState({ ...state, step: 'form', selectedRole: role, error: null })
  }

  const handleFormChange = (field: string, value: string) => {
    setState({ ...state, [field]: value, error: null })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!state.selectedRole) {
      setState({ ...state, error: isZh ? '请选择身份' : 'Please select a role' })
      return
    }
    if (!state.email || !state.password || !state.fullName) {
      setState({ ...state, error: isZh ? '请填写所有字段' : 'Please fill in all fields' })
      return
    }
    if (state.password.length < 6) {
      setState({ ...state, error: isZh ? '密码至少 6 个字符' : 'Password must be at least 6 characters' })
      return
    }

    setState({ ...state, isSubmitting: true })

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/')}`
      const { data, error: authError } = await supabase.auth.signUp({
        email: state.email,
        password: state.password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            role: state.selectedRole,
            full_name: state.fullName,
          },
        },
      })

      if (authError) {
        setState({ ...state, isSubmitting: false, error: authError.message })
        return
      }

      // If a session is returned, email confirmation is disabled — redirect immediately
      if (data?.session) {
        // Create landlords row if landlord or agent
        if (state.selectedRole === 'landlord' || state.selectedRole === 'agent') {
          try {
            await supabase
              .from('landlords')
              .insert({
                auth_id: data.session.user.id,
                email: state.email,
                full_name: state.fullName,
                role: state.selectedRole,
                plan: 'free',
              })
          } catch (err) {
            console.error('Failed to create landlords row:', err)
            // Continue anyway — the row can be created later
          }
        }

        window.location.href = '/'
        return
      }

      // Otherwise show "check your email" message
      setState({ ...state, isSubmitting: false, successMessage: true })
    } catch (err: any) {
      setState({ ...state, isSubmitting: false, error: err.message || 'An error occurred' })
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${v3.border}`,
    background: v3.surfaceCard,
    color: '#0B1736',
    WebkitTextFillColor: '#0B1736',
    caretColor: '#0B1736',
    fontSize: 14,
    transition: 'border-color .15s, box-shadow .15s',
    outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: v3.surface }}>
      {/* Nav */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: `rgba(242, 238, 229, 0.82)`,
          backdropFilter: 'saturate(1.6) blur(14px)',
          WebkitBackdropFilter: 'saturate(1.6) blur(14px)',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: isMobile ? '10px 14px' : '14px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              fontSize: 20,
              fontWeight: 800,
              color: v3.textPrimary,
              letterSpacing: '-0.02em',
            }}
          >
            Stayloop
          </Link>
          <LanguageToggle />
        </div>
      </nav>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 16px' : '48px 24px' }}>
        <div style={{ width: '100%', maxWidth: 800 }}>
          {state.step === 'role' ? (
            // Step 1: Role selection
            <>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h1
                  style={{
                    fontSize: isMobile ? 26 : 36,
                    fontWeight: 800,
                    color: v3.textPrimary,
                    letterSpacing: '-0.03em',
                    marginBottom: 12,
                  }}
                >
                  {isZh ? '你是谁？' : 'Who are you?'}
                </h1>
                <p style={{ fontSize: 15, color: v3.textSecondary, lineHeight: 1.6 }}>
                  {isZh ? '选择你的身份，我们来帮你快速上手。' : 'Choose your role and we\'ll help you get started.'}
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                  gap: isMobile ? 16 : 20,
                }}
              >
                {roles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => handleRoleSelect(role.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 16,
                      padding: isMobile ? 24 : 32,
                      background: v3.surfaceCard,
                      border: `1px solid ${v3.border}`,
                      borderRadius: 14,
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isMobile) {
                        e.currentTarget.style.borderColor = v3.brand
                        e.currentTarget.style.boxShadow = `0 0 0 3px rgba(4, 120, 87, 0.1)`
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = v3.border
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <span style={{ fontSize: isMobile ? 48 : 56 }}>{role.icon}</span>
                    <div style={{ textAlign: 'center' }}>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: v3.textPrimary, marginBottom: 6 }}>
                        {isZh ? role.title_zh : role.title_en}
                      </h3>
                      <p style={{ fontSize: 13, color: v3.textSecondary, lineHeight: 1.5 }}>
                        {isZh ? role.desc_zh : role.desc_en}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              <p style={{ textAlign: 'center', marginTop: 32, fontSize: 13, color: v3.textSecondary }}>
                {isZh ? '已有账户？' : 'Already have an account? '}
                <Link
                  href="/login"
                  style={{ color: v3.brand, textDecoration: 'none', fontWeight: 600 }}
                >
                  {isZh ? '登录' : 'Sign in'}
                </Link>
              </p>
            </>
          ) : (
            // Step 2: Registration form
            <div
              style={{
                background: v3.surfaceCard,
                borderRadius: isMobile ? 16 : 20,
                border: `1px solid ${v3.border}`,
                padding: isMobile ? '24px 20px' : '36px 32px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.06)',
              }}
            >
              <button
                onClick={() => setState({ ...state, step: 'role' })}
                style={{
                  background: 'none',
                  border: 'none',
                  color: v3.textMuted,
                  fontSize: 14,
                  cursor: 'pointer',
                  marginBottom: 24,
                  padding: 0,
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                ← {isZh ? '返回' : 'Back'}
              </button>

              {state.successMessage ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: '1px solid rgba(22,163,74,0.25)',
                    background: v3.successSoft,
                    padding: 20,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: 'rgba(22,163,74,0.12)',
                        border: '1px solid rgba(22,163,74,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: v3.success,
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: v3.success, marginBottom: 4 }}>
                        {isZh ? '注册成功' : 'Check your email'}
                      </div>
                      <div style={{ fontSize: 13, color: v3.textSecondary, lineHeight: 1.6 }}>
                        {isZh
                          ? `我们已发送确认链接到 ${state.email}`
                          : `We've sent a confirmation link to ${state.email}`}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <h2 style={{ fontSize: 24, fontWeight: 700, color: v3.textPrimary, marginBottom: 8 }}>
                    {isZh ? '创建账户' : 'Create your account'}
                  </h2>

                  {/* Full name */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 600,
                        color: v3.textSecondary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: 6,
                      }}
                    >
                      {isZh ? '全名' : 'Full Name'}
                    </label>
                    <input
                      type="text"
                      value={state.fullName}
                      onChange={(e) => handleFormChange('fullName', e.target.value)}
                      placeholder={isZh ? '张三' : 'John Doe'}
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = v3.brand
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(4,120,87,0.15)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = v3.border
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                      required
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 600,
                        color: v3.textSecondary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: 6,
                      }}
                    >
                      {isZh ? '邮箱' : 'Email'}
                    </label>
                    <input
                      type="email"
                      value={state.email}
                      onChange={(e) => handleFormChange('email', e.target.value)}
                      placeholder="you@example.com"
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = v3.brand
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(4,120,87,0.15)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = v3.border
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                      required
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 600,
                        color: v3.textSecondary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: 6,
                      }}
                    >
                      {isZh ? '密码' : 'Password'}
                    </label>
                    <input
                      type="password"
                      value={state.password}
                      onChange={(e) => handleFormChange('password', e.target.value)}
                      placeholder="••••••"
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = v3.brand
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(4,120,87,0.15)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = v3.border
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                      required
                    />
                    <p style={{ fontSize: 12, color: v3.textFaint, marginTop: 6 }}>
                      {isZh ? '至少 6 个字符' : 'At least 6 characters'}
                    </p>
                  </div>

                  {/* Role display */}
                  <div style={{ padding: 12, background: v3.brandSoft, borderRadius: 8 }}>
                    <p style={{ fontSize: 12, color: v3.brand, fontWeight: 600, margin: 0 }}>
                      {isZh ? '身份：' : 'Role: '}
                      {state.selectedRole === 'tenant'
                        ? isZh
                          ? '租客'
                          : 'Renter'
                        : state.selectedRole === 'landlord'
                          ? isZh
                            ? '房东'
                            : 'Landlord'
                          : isZh
                            ? '房产经纪'
                            : 'Agent'}
                    </p>
                  </div>

                  {/* Error */}
                  {state.error && (
                    <div
                      style={{
                        borderRadius: 10,
                        border: '1px solid rgba(220,38,38,0.2)',
                        background: v3.dangerSoft,
                        color: v3.danger,
                        fontSize: 13,
                        padding: '10px 14px',
                      }}
                    >
                      {state.error}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={state.isSubmitting}
                    style={{
                      width: '100%',
                      padding: '13px 20px',
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                      color: '#FFFFFF',
                      fontSize: 14.5,
                      fontWeight: 650,
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45), 0 1px 0 rgba(255, 255, 255, 0.30) inset',
                      transition: 'transform .15s, box-shadow .2s',
                      opacity: state.isSubmitting ? 0.6 : 1,
                    }}
                  >
                    {state.isSubmitting ? (isZh ? '创建中...' : 'Creating...') : isZh ? '创建账户' : 'Create account'}
                  </button>

                  <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: v3.textSecondary }}>
                    {isZh ? '已有账户？' : 'Already have an account? '}
                    <Link href="/login" style={{ color: v3.brand, textDecoration: 'none', fontWeight: 600 }}>
                      {isZh ? '登录' : 'Sign in'}
                    </Link>
                  </p>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
