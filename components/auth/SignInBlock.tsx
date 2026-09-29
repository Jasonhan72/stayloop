'use client'

// The sign-in block every entrance shows inside the onboarding card frame:
// title, one lead sentence, an optional note, the LoginCard (email first; the
// email-status lookup sends an existing account to its password and a new
// email to create-account; Google below) and, underneath, the way into the
// no-account preview. Used by the naming step's sign-in gate and by /login and
// /register (2026-09-29, user:「把汉堡菜单里的登录，注册页面也统一成刚修改过的
// 登录，注册页面一样的」), so the three cannot drift apart.
import Link from 'next/link'
import type { ReactNode } from 'react'
import LoginCard from '@/components/home/LoginCard'

export default function SignInBlock({
  zh,
  title,
  lead,
  note,
  next,
  intent = 'signin',
  previewHref = '/tenant/agent',
}: {
  zh: boolean
  title: string
  lead: string
  /** One short line under the lead (the naming step names the identity here). */
  note?: ReactNode
  /** Where every sign-in method lands afterwards; defaults to the page's own ?next= / ?redirect=. */
  next?: string
  /** Which step a failed email lookup falls back to. */
  intent?: 'signin' | 'register'
  previewHref?: string
}) {
  return (
    <>
      <h1 style={{ fontSize: 'clamp(24px, 6.5vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.18 }}>{title}</h1>
      {/* pretty wrapping: no single character left alone on the last line */}
      <p className="[text-wrap:pretty]" style={{ fontSize: 14.5, color: '#3F3F46', lineHeight: 1.6, margin: note ? '12px 0 8px' : '12px 0 22px' }}>{lead}</p>
      {note && (
        <p style={{ fontSize: 12.5, color: '#71717A', lineHeight: 1.55, margin: '0 0 22px' }} data-testid="signin-note">
          {note}
        </p>
      )}
      <LoginCard next={next} intent={intent} className="mx-auto w-full max-w-[400px]" />
      <p style={{ fontSize: 12.5, color: '#71717A', lineHeight: 1.6, marginTop: 24 }}>
        <Link href={previewHref} data-testid="signin-preview" style={{ color: '#00ACE4', fontWeight: 600 }}>
          {zh ? '先不登录，看看预览 →' : 'Look at a preview first →'}
        </Link>
        <br />
        {zh ? '预览不用账户，但不会记住你，也不能替你办事。' : 'The preview needs no account, but it won’t remember you or act for you.'}
      </p>
    </>
  )
}
