// 2026-06-02 — Code review §5 P1 — CASL-compliant unsubscribe landing page.
// Server-rendered at /unsubscribe?email=...&token=... — on valid HMAC token
// we insert into email_unsubscribes via the service role (public-insert RPC
// permits unauthenticated writes here) and render an EN+ZH confirmation.

import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/email'

export const runtime = 'edge'

// Edge runtime needs explicit dynamic rendering since we read searchParams.
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ email?: string; token?: string }> | { email?: string; token?: string }
}

async function recordUnsubscribe(email: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return { ok: false, error: 'Server not configured' }
  }
  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await admin.from('email_unsubscribes').insert({
      email: email.toLowerCase().trim(),
      source: 'list_unsubscribe_link',
    })
    // Unique-violation = already unsubscribed; treat as success.
    if (error && error.code !== '23505') {
      console.warn('unsubscribe insert failed', error)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'insert threw' }
  }
}

// Next.js 15 — searchParams is a Promise; await it. Older 14-style sync
// access still works because we wrap with `await Promise.resolve(...)`.
export default async function UnsubscribePage({ searchParams }: PageProps) {
  const sp = await Promise.resolve(searchParams)
  const rawEmail = typeof sp?.email === 'string' ? sp.email : ''
  const rawToken = typeof sp?.token === 'string' ? sp.token : ''
  const email = rawEmail.trim().toLowerCase()
  const token = rawToken.trim()

  let state: 'success' | 'invalid' = 'invalid'
  let detail = ''

  if (email && token) {
    const valid = await verifyUnsubscribeToken(email, token)
    if (valid) {
      const insertResult = await recordUnsubscribe(email)
      if (insertResult.ok) {
        state = 'success'
      } else {
        state = 'invalid'
        detail = insertResult.error || ''
      }
    }
  }

  const shellStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f6f7f9',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
    color: '#0f172a',
    padding: '32px 16px',
  }
  const cardStyle: React.CSSProperties = {
    maxWidth: 480,
    width: '100%',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '32px 28px',
    boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 12px 32px -8px rgba(15,23,42,0.08)',
  }
  const eyebrowStyle: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.12em',
    color: '#06b6d4',
    textTransform: 'uppercase',
    fontWeight: 600,
    marginBottom: 12,
  }
  const titleStyle: React.CSSProperties = {
    margin: '0 0 12px 0',
    fontSize: 22,
    fontWeight: 700,
    color: '#0f172a',
  }
  const bodyStyle: React.CSSProperties = {
    margin: '0 0 8px 0',
    fontSize: 14,
    lineHeight: 1.6,
    color: '#334155',
  }
  const subStyle: React.CSSProperties = {
    margin: '16px 0 0 0',
    fontSize: 12,
    color: '#94a3b8',
  }

  if (state === 'success') {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <div style={eyebrowStyle}>Stayloop</div>
          <h1 style={titleStyle}>You&rsquo;ve been unsubscribed</h1>
          <p style={bodyStyle}>
            <strong>{email}</strong> will no longer receive marketing or
            notification emails from Stayloop. Transactional account-security
            emails (password resets, sign-in alerts) may still be sent.
          </p>
          <hr style={{ border: 0, borderTop: '1px solid #e5e7eb', margin: '20px 0' }} />
          <div style={eyebrowStyle}>中文</div>
          <h2 style={{ ...titleStyle, fontSize: 18 }}>已退订成功</h2>
          <p style={bodyStyle}>
            <strong>{email}</strong> 不会再收到 Stayloop 的营销或通知邮件。账户安全相关邮件（密码重置、登录提醒）仍可能发送。
          </p>
          <p style={subStyle}>
            Stayloop · stayloop.ai · unsubscribe@stayloop.ai
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{ ...eyebrowStyle, color: '#b91c1c' }}>Stayloop</div>
        <h1 style={titleStyle}>Invalid unsubscribe link</h1>
        <p style={bodyStyle}>
          This link is missing or expired. If you keep receiving emails you
          didn&rsquo;t ask for, reply to one of them or email{' '}
          <a href="mailto:unsubscribe@stayloop.ai" style={{ color: '#0f172a' }}>
            unsubscribe@stayloop.ai
          </a>{' '}
          and we&rsquo;ll remove you manually.
        </p>
        <hr style={{ border: 0, borderTop: '1px solid #e5e7eb', margin: '20px 0' }} />
        <h2 style={{ ...titleStyle, fontSize: 18 }}>退订链接无效</h2>
        <p style={bodyStyle}>
          该链接缺失或已失效。如果你继续收到不希望的邮件，请直接回复任一邮件，或发送邮件至{' '}
          <a href="mailto:unsubscribe@stayloop.ai" style={{ color: '#0f172a' }}>
            unsubscribe@stayloop.ai
          </a>{' '}
          ，我们会手动为你退订。
        </p>
        {detail ? (
          <p style={{ ...subStyle, color: '#b91c1c' }}>Detail: {detail}</p>
        ) : null}
        <p style={subStyle}>Stayloop · stayloop.ai</p>
      </div>
    </div>
  )
}
