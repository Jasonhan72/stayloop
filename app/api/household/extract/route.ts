// POST /api/household/extract — read an uploaded signed lease, return the
// fields for the import confirm form.
//
// Auth required (burns model budget). Files arrive as multipart form-data and
// are NOT persisted here: storage upload happens after the user confirms and
// the household exists (the bucket's RLS needs the membership row). The bytes
// therefore cross the wire twice; lease PDFs are small and the alternative is
// an orphaned-files janitor.
//
// Everything returned passes through sanitizeLeaseImportExtraction, and the
// UI shows it for confirmation — extraction accelerates the form, it never
// bypasses it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_MODELS, getModel, getModelDef, getModelDefAsync } from '@/lib/modelConfig'
import { llmChat, type ChatContentBlock } from '@/lib/llmChat'
import { LEASE_IMPORT_PROMPT, sanitizeLeaseImportExtraction } from '@/lib/household/importExtract'
import { safeParseJson } from '@/lib/agent/turnHelpers'

export const runtime = 'edge'

const MAX_FILES = 3
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7e]/g, '')
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'multipart form-data required' }, { status: 400 })
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File).slice(0, MAX_FILES)
  if (!files.length) return NextResponse.json({ error: 'no files' }, { status: 400 })

  const content: ChatContentBlock[] = [{ type: 'text', text: LEASE_IMPORT_PROMPT }]
  let total = 0
  for (const f of files) {
    const buf = await f.arrayBuffer()
    total += buf.byteLength
    if (total > MAX_BYTES) return NextResponse.json({ error: 'files too large (10MB total)' }, { status: 400 })
    let b64 = ''
    const bytes = new Uint8Array(buf)
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      b64 += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    b64 = btoa(b64)
    if (f.type === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } })
    } else if (/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) {
      content.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: b64 } })
    } else {
      return NextResponse.json({ error: `unsupported type ${f.type}` }, { status: 400 })
    }
  }

  // Review 2026-09-14: this posted the classify slot's model id straight to
  // api.anthropic.com — a non-Anthropic slot model 404'd and nothing was
  // metered. All model calls go through llmChat (CLAUDE.md).
  const modelId = await getModel('classify')
  const def = (await getModelDefAsync(modelId)) ?? getModelDef(DEFAULT_MODELS.classify)
  if (!def) return NextResponse.json({ error: 'not configured' }, { status: 500 })
  let text = ''
  try {
    const r = await llmChat({
      model: def,
      system: 'You extract lease facts as JSON. Output only the JSON object.',
      messages: [{ role: 'user', content }],
      maxTokens: 1000,
      signal: AbortSignal.timeout(60_000),
      meta: { userId: userData.user.id, slot: 'classify', source: 'household/extract' },
    })
    text = r.text
  } catch (e) {
    console.error('[household/extract] model call failed', (e as Error).message)
    return NextResponse.json({ error: 'extraction unavailable' }, { status: 502 })
  }
  const parsed = safeParseJson(text)

  // A failed parse degrades to an empty form, never to a failed import.
  return NextResponse.json({ extraction: sanitizeLeaseImportExtraction(parsed) })
}
