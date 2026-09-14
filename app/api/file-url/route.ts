import { NextRequest, NextResponse } from 'next/server'
import { readJsonBody, INVALID_BODY } from '@/lib/api/body'
import { createClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody<{ path?: string }>(req)
    if (!body) return NextResponse.json(INVALID_BODY, { status: 400 })
    const { path } = body
    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || ''
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Require authenticated user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    // path format is `${application_id}/${kind}/${filename}` — verify caller can read the application.
    // Review 2026-09-14: storage-js does not encode the path and fetch()
    // normalises `..`, so `A1/../screenings/<other>/…` was checked as A1 but
    // signed as another landlord's object. Reject anything but the exact shape.
    const segs = path.split('/')
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (segs.length !== 3 || !uuidRe.test(segs[0]) || segs.some(s => !s || s === '.' || s === '..' || /[\\?#%]/.test(s))) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400 })
    }
    const application_id = segs[0]
    const { data: app, error } = await supabase
      .from('applications')
      .select('id')
      .eq('id', application_id)
      .maybeSingle()
    if (error || !app) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const { data: signed, error: signErr } = await supabase
      .storage.from('tenant-files').createSignedUrl(path, 600)
    if (signErr || !signed?.signedUrl) {
      console.error('file-url sign failed:', signErr?.message)
      return NextResponse.json({ error: 'sign failed' }, { status: 500 })
    }

    return NextResponse.json({ url: signed.signedUrl })
  } catch (e: any) {
    console.error('[file-url] uncaught:', e)
    captureException(e, { route: 'file-url', level: 'error' })
    return NextResponse.json(
      { error: 'file-url failed' },
      { status: 500 }
    )
  }
}
