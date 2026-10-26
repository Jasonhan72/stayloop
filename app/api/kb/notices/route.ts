// /api/kb/notices — public: the rules whose statute changed and is still pending review (design §7.3).
// Read by /rules to show「待核对」badges. Only rule ids, source names and dates — public law, no person data.
import { NextResponse } from 'next/server'
import { loadPendingNotices } from '@/lib/kb/notices'

export async function GET() {
  const notices = await loadPendingNotices()
  return NextResponse.json({ notices }, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
