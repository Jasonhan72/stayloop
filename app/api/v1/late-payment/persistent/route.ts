// POST /api/v1/late-payment/persistent — tier 1 (stage 5 · 2026-10-16). The
// RTA s.58(1.1) persistent-late-payment test over up to PERIODS_MAX ledger periods
// (due date + paid date only — no names, no amounts, nothing stored).
import { handleV1, methodNotAllowed, optionsResponse, readJsonObject } from '@/lib/api/v1Http'
import { corePersistentLatePayment } from '@/lib/api/v1Core'

export const runtime = 'edge'

export async function OPTIONS() { return optionsResponse() }
export const GET = methodNotAllowed

export async function POST(req: Request) {
  return handleV1(req, 'late_payment_persistent', async () => corePersistentLatePayment(await readJsonObject(req)))
}
