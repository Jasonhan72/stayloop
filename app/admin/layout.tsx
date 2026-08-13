'use client'

// One gate over the whole back office: any admin account carrying
// must_change_password in its user_metadata is held on a password-change
// screen before it can see ANY /admin surface. This exists for the bootstrap
// superadmin (admin@stayloop.ai ships with a temporary password) and for any
// future reset the same way. Page-level useAdmin gating stays where it is —
// this layout adds the credential gate, it does not replace authorization.

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [mustChange, setMustChange] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setMustChange(Boolean((auth.user?.user_metadata as Record<string, unknown> | undefined)?.must_change_password))
  }, [auth.user])

  async function changePassword() {
    setErr(null)
    if (pw.length < 10) {
      setErr(zh ? '新密码至少 10 位。' : 'New password must be at least 10 characters.')
      return
    }
    if (pw === '123456' || /^(.)\1+$/.test(pw)) {
      setErr(zh ? '换一个更强的密码。' : 'Pick a stronger password.')
      return
    }
    if (pw !== pw2) {
      setErr(zh ? '两次输入不一致。' : 'Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: pw,
        data: { must_change_password: false },
      })
      if (error) throw error
      setMustChange(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  if (mustChange) {
    return (
      <>
        <Header variant="solid" />
        <main className="bg-surface">
          <div className="mx-auto flex min-h-[calc(100vh-66px)] max-w-[440px] items-center px-5">
            <div className="w-full rounded-2xl border border-line-divider bg-white p-8">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">STAYLOOP ADMIN</div>
              <h1 className="mt-2 text-[20px] font-extrabold tracking-tight">
                {zh ? '请先设置新密码' : 'Set a new password first'}
              </h1>
              <p className="mt-2 text-[13px] leading-relaxed text-body-2">
                {zh
                  ? '这个账号仍在使用临时密码。设置新密码(至少 10 位)后才能进入后台。'
                  : 'This account is still on its temporary password. Choose a new one (10+ characters) to continue.'}
              </p>
              {err && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{err}</div>}
              <label className="mb-1 mt-5 block text-[12px] font-semibold text-body-2">{zh ? '新密码' : 'New password'}</label>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-line-divider bg-white px-3 py-2.5 text-[14px]"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
              <label className="mb-1 mt-4 block text-[12px] font-semibold text-body-2">{zh ? '再输一次' : 'Confirm'}</label>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-line-divider bg-white px-3 py-2.5 text-[14px]"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void changePassword() }}
              />
              <button
                onClick={() => void changePassword()}
                disabled={busy}
                className="mt-6 w-full rounded-lg py-3 text-[14px] font-bold text-white disabled:opacity-60"
                style={{ background: '#7C3AED' }}
              >
                {busy ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存并进入后台' : 'Save & enter')}
              </button>
            </div>
          </div>
        </main>
      </>
    )
  }

  return children
}
