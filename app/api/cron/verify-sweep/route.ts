// POST /api/cron/verify-sweep — hourly (pg_cron `verify-sweep`, :50 every hour, x-cron-secret).
//   · bank reads parked at 202 whose page went away: one more GetAccountsDetailAsync step,
//     finish or time out (lib/verify/bankFlow.ts sweepBankReads)
//   · Flinks connections whose DeleteCard was refused (CARD_IN_USE): retried until gone
//   · verification request rows older than 90 days: statuses only (purgeVerificationDetails)
import { NextResponse } from 'next/server'
import { secretMatches } from '@/lib/cron/secret'
import { adminClient } from '@/lib/verify/store'
import { flinksApi, flinksConfigured } from '@/lib/verify/providers/flinks'
import { purgeVerificationDetails, sweepBankReads } from '@/lib/verify/bankFlow'


export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const given = (req.headers.get('x-cron-secret') || '').trim()
  if (!secret || !given || !(await secretMatches(given, secret))) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const admin = adminClient()
  // Without Flinks credentials nothing can be read or deleted; parked rows wait for them.
  const bank = flinksConfigured() ? await sweepBankReads(admin, flinksApi) : null
  const purged = await purgeVerificationDetails(admin)
  return NextResponse.json({ ok: true, bank, purged })
}
