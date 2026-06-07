'use client'

import Link from 'next/link'
import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getSupabaseBrowser } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErr(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo:
            typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
        },
      })
      if (error) throw error
      setSent(true)
    } catch (e: any) {
      setErr(e?.message || '登录失败,请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-md flex-col justify-center px-5 py-12">
          <div className="sl-card p-8 sm:p-10">
            {!sent ? (
              <>
                <h1 className="text-[28px] font-bold tracking-tight">欢迎回来</h1>
                <p className="mt-2 text-[14px] leading-relaxed text-body-2">
                  输入邮箱，我们发一个一次性登录链接给你。
                  无需密码、无需 Google / Apple 账号。
                </p>
                <form onSubmit={submit} className="mt-6 space-y-4">
                  <label className="block">
                    <span className="sl-eyebrow">邮箱</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="sl-input mt-1"
                    />
                  </label>
                  {err && (
                    <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
                      {err}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="sl-btn-primary w-full !py-[14px]"
                  >
                    {loading ? '发送中…' : '发送登录链接'}
                  </button>
                </form>
                <div className="mt-6 border-t border-line-divider pt-5 text-center text-[13px] text-body-2">
                  还没有账号？{' '}
                  <Link href="/onboarding/welcome" className="font-semibold text-brand">
                    注册 →
                  </Link>
                </div>
              </>
            ) : (
              <div className="text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-brand">
                  <MailIcon />
                </span>
                <h1 className="mt-4 text-[22px] font-bold tracking-tight">查收你的邮箱</h1>
                <p className="mt-2 text-[14px] leading-relaxed text-body-2">
                  我们刚把登录链接发到 <b className="text-body">{email}</b>。
                  点击链接即可继续 — 链接 1 小时内有效。
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

function MailIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  )
}
