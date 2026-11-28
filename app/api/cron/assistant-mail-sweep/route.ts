// POST /api/cron/assistant-mail-sweep — the daily clean-up of the assistants' mailboxes
// (pg_cron 'assistant-mail-sweep', 13:35 UTC; AI 助理的邮箱 · 第一期, 2026-11-27).
// A mail is kept thirty days. After that its row, its attachments and the raw original are
// deleted — the storage objects here, because SQL alone cannot remove them. The promise is made
// to people when they open a mailbox, so this job ships with the feature, not after it.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { secretMatches } from '@/lib/cron/secret'
import { sweepExpired } from '@/lib/assistantMail/server'

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET || ''
  const given = req.headers.get('x-cron-secret') || ''
  if (!cronSecret || !given || !(await secretMatches(given, cronSecret))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const out = await sweepExpired(admin)
  return NextResponse.json({ ok: out.failed === 0, ...out })
}
