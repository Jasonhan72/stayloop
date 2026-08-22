export const runtime = 'edge'

// Admin-only diagnostic: does PDF text extraction (unpdf / pdf.js) actually
// run on the edge? Production data says it has NOT — 0 of 275 files in 45
// days carried text_density — while readPdfTextDensity swallows the error.
// This route builds a tiny PDF in-process, runs the extractor, and returns
// the real error message so the failure can be fixed instead of guessed at.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { readPdfTextDensity, lastTextExtractError } from '@/lib/forensics/pdf-text'

export async function GET(req: NextRequest) {
  const auth = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!auth) return NextResponse.json({ error: 'auth required' }, { status: 401 })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } } })
  const { data: isAdmin } = await supabase.rpc('is_stayloop_admin')
  if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 200])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Stayloop text extraction diagnostic 2026', { x: 20, y: 100, size: 14, font })
  const bytes = await doc.save()

  const t0 = Date.now()
  const result = await readPdfTextDensity(bytes)
  return NextResponse.json({
    ok: !!result && result.total_chars > 0,
    elapsed_ms: Date.now() - t0,
    result,
    last_error: lastTextExtractError,
    runtime: 'edge',
  })
}
