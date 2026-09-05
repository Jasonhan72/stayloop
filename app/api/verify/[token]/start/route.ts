import { NextRequest, NextResponse } from 'next/server'
import { isVerifyToken } from '@/lib/verify/token'
import { adminClient, isExpired, loadRequest, providerAvailability, writeStep } from '@/lib/verify/store'
import { veriffCreateSession } from '@/lib/verify/providers/veriff'
import { flinksConfig, flinksConnectUrl, flinksGenerateAuthorizeToken } from '@/lib/verify/providers/flinks'
import type { VerifyStepKey } from '@/lib/verify/types'

export const runtime = 'edge'

// POST /api/verify/<token>/start — { step: 'id' | 'bank' | 'credit' }
// Creates the provider session for one step. Requires recorded consent.
//   id     → { url }        Veriff hosted session; the person is redirected there
//   bank   → { iframe_url } Flinks Connect, embedded by the page
//   credit → 404 not_configured until a provider is signed
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!isVerifyToken(token)) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  try {
    const admin = adminClient()
    const row = await loadRequest(admin, token)
    if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (isExpired(row)) return NextResponse.json({ ok: false, error: 'expired' }, { status: 410 })
    if (!row.consent) return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 403 })

    const body = (await req.json().catch(() => ({}))) as { step?: string; lang?: string }
    const step = body.step as VerifyStepKey
    if (!['id', 'bank', 'credit'].includes(step)) return NextResponse.json({ ok: false, error: 'bad_step' }, { status: 400 })
    const avail = providerAvailability()[step]
    if (!avail.available) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 404 })

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
    if (step === 'id') {
      const [first, ...rest] = (row.tenant_name || '').split(/\s+/).filter(Boolean)
      const session = await veriffCreateSession({
        vendorData: token,
        callbackUrl: `${siteUrl}/verify/${token}?step=id&returned=1`,
        firstName: first || null,
        lastName: rest.length ? rest.join(' ') : null,
      })
      await writeStep(admin, row, 'id', { status: 'started', provider: 'veriff', session_id: session.id, sandbox: false })
      return NextResponse.json({ ok: true, url: session.url })
    }
    if (step === 'bank') {
      const cfg = flinksConfig()
      const authorizeToken = await flinksGenerateAuthorizeToken()
      const lang = body && (body as { lang?: string }).lang === 'fr' ? 'fr' : 'en'
      const iframeUrl = flinksConnectUrl({
        authorizeToken,
        redirectUrl: `${siteUrl}/verify/${token}?step=bank&returned=1`,
        lang,
      })
      await writeStep(admin, row, 'bank', { status: 'started', provider: 'flinks', sandbox: cfg.sandbox })
      return NextResponse.json({ ok: true, iframe_url: iframeUrl, sandbox: cfg.sandbox })
    }
    // credit: the applicant fills the identity form on the page and the page
    // posts it to /credit — nothing to start here beyond confirming availability.
    return NextResponse.json({ ok: true, form: 'credit', sandbox: avail.sandbox })
  } catch (err: any) {
    console.error('verify/start error', err?.message || err)
    return NextResponse.json({ ok: false, error: 'provider_error', detail: String(err?.message || '').slice(0, 160) }, { status: 502 })
  }
}
