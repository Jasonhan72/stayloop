import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const { path } = await req.json()
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

  // path format is `${application_id}/${kind}/${filename}` — verify caller can read the application
  const application_id = path.split('/')[0]
  const { data: app, error } = await supabase
    .from('applications')
    .select('id')
    .eq('id', application_id)
    .maybeSingle()
  if (error || !app) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data: signed, error: signErr } = await supabase
    .storage.from('tenant-files').createSignedUrl(path, 600)
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message || 'sign failed' }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
