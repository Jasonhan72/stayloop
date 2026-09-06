'use client'

export const runtime = 'edge'

// /join/[token] — the invite landing page. Public route; the token is the
// credential (same posture as the passport share page). Pre-login it shows
// only what peek_household_invite discloses: address, inviter, role — no
// rent, no lease. Accept requires login; decline does not (the recipient
// should never need an account to say no — and declining marks the household
// disputed so the uploader can't present it as an accepted tenancy).

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'

interface Peek {
  address: string | null
  unit: string | null
  city: string | null
  invited_role: string | null
  inviter_name: string | null
  state: string
}

const ROLE_ZH: Record<string, string> = {
  landlord: '房东', tenant: '租客', agent: '经纪', property_manager: '物业管理',
}

export default function JoinInvitePage() {
  const params = useParams()
  const token = String(params?.token || '')
  const router = useRouter()
  const { user, loading } = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'

  const [peek, setPeek] = useState<Peek | null>(null)
  const [email, setEmail] = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    supabase.rpc('peek_household_invite', { p_token: token }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data
      setPeek((row as Peek) ?? { address: null, unit: null, city: null, invited_role: null, inviter_name: null, state: 'not_found' })
    })
  }, [token])

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('accept_household_invite', { p_token: token })
      if (err) throw new Error(err.message)
      router.push(`/h/${data as string}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
      setBusy(false)
    }
  }

  async function decline() {
    setBusy(true)
    try {
      await supabase.rpc('decline_household_invite', { p_token: token })
      setDeclined(true)
    } finally {
      setBusy(false)
    }
  }

  async function sendMagicLink() {
    if (!/\S+@\S+\.\S+/.test(email)) return
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/join/${token}` },
      })
      if (err) throw new Error(err.message)
      setMagicSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  const address = peek ? [peek.address, peek.unit ? `#${peek.unit}` : null, peek.city].filter(Boolean).join(', ') : ''
  const roleLabel = peek?.invited_role ? (zh ? ROLE_ZH[peek.invited_role] ?? peek.invited_role : peek.invited_role.replace('_', ' ')) : ''

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="transparent" />
      <div className="mx-auto w-full max-w-[520px] flex-1 px-5 py-16">
        {!peek ? (
          <div className="py-20 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#1B1B3C] border-t-transparent" />
          </div>
        ) : declined ? (
          <div className="rounded-xl border border-line-divider bg-white p-8 text-center">
            <h1 className="text-[18px] font-extrabold">{zh ? '已拒绝邀请' : 'Invitation declined'}</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-body-2">
              {zh
                ? '邀请方会收到通知,该在管租约已被标记为存在争议。如需要求删除与你相关的信息,请联系 privacy@stayloop.ai。'
                : 'The inviter will see this, and the household is now marked disputed. To request deletion of information about you, contact privacy@stayloop.ai.'}
            </p>
          </div>
        ) : peek.state !== 'pending' ? (
          <div className="rounded-xl border border-line-divider bg-white p-8 text-center">
            <h1 className="text-[18px] font-extrabold">
              {peek.state === 'accepted' ? (zh ? '邀请已被使用' : 'Already accepted')
                : peek.state === 'expired' ? (zh ? '邀请已过期' : 'Invitation expired')
                : peek.state === 'revoked' ? (zh ? '邀请已撤销' : 'Invitation revoked')
                : peek.state === 'declined' ? (zh ? '邀请已被拒绝' : 'Invitation declined')
                : (zh ? '邀请不存在' : 'Invitation not found')}
            </h1>
            <p className="mt-2 text-[13px] text-body-3">{zh ? '如有疑问请联系邀请你的人。' : 'Ask the person who invited you for a fresh link.'}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line-divider bg-white p-8">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#1B1B3C' }}>
              {zh ? '在管租约邀请' : 'MANAGED TENANCY INVITATION'}
            </div>
            <h1 className="mt-3 text-[20px] font-extrabold leading-snug">
              {zh
                ? <><strong>{peek.inviter_name}</strong> 邀请你以「{roleLabel}」身份加入</>
                : <><strong>{peek.inviter_name}</strong> invited you to join as {roleLabel}</>}
            </h1>
            <div className="mt-3 rounded-lg bg-[#FAFAF8] px-4 py-3 text-[14px] font-semibold">{address}</div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-body-3">
              {zh
                ? '加入后你可以查看上传的租约原件、与各方对话、提交报修、查看租金记录。这些信息由邀请方自行上传,加入前请核实。'
                : 'After joining you can read the uploaded lease, message the parties, file maintenance requests and see rent records. Everything was uploaded by the inviter — verify before you rely on it.'}
            </p>

            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}

            {loading ? null : user ? (
              <div className="mt-6 flex gap-3">
                <button onClick={() => void accept()} disabled={busy}
                  className="flex-1 rounded-lg py-3 text-[14px] font-bold text-white disabled:opacity-60" style={{ background: '#1B1B3C' }}>
                  {busy ? '…' : (zh ? '接受并加入' : 'Accept & join')}
                </button>
                <button onClick={() => void decline()} disabled={busy}
                  className="rounded-lg border border-line-divider px-5 text-[13px] text-body-2">
                  {zh ? '拒绝' : 'Decline'}
                </button>
              </div>
            ) : magicSent ? (
              <div className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
                {zh ? '登录链接已发送到你的邮箱,点击后会回到本页。' : 'Check your email — the sign-in link brings you back here.'}
              </div>
            ) : (
              <div className="mt-6">
                <label className="mb-1 block text-[12px] font-semibold text-body-2">
                  {zh ? '输入邮箱登录后接受(免密码)' : 'Enter your email to sign in (passwordless)'}
                </label>
                <div className="flex gap-2">
                  <input
                    className="w-full rounded-lg border border-line-divider bg-white px-3 py-2.5 text-[14px]"
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                  />
                  <button onClick={() => void sendMagicLink()} disabled={busy}
                    className="rounded-lg px-4 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: '#1B1B3C' }}>
                    {zh ? '发送' : 'Send'}
                  </button>
                </div>
                <button onClick={() => void decline()} disabled={busy} className="mt-3 text-[12.5px] text-body-3 underline">
                  {zh ? '不加入,拒绝此邀请(无需登录)' : 'Decline without signing in'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
