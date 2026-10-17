// GET /api/v1/n4/earliest-termination?served=YYYY-MM-DD&method=hand|mail|email
// — tier 1 (stage 5 · 2026-10-16). Ontario N4 date arithmetic only (RTA s.59
// as amended 2026-09-21): no view on whether to serve, no form filling.
import { handleV1, methodNotAllowed, optionsResponse, queryObject } from '@/lib/api/v1Http'
import { coreN4EarliestTermination } from '@/lib/api/v1Core'

export const runtime = 'edge'

export async function OPTIONS() { return optionsResponse() }
export const POST = methodNotAllowed

export async function GET(req: Request) {
  return handleV1(req, 'n4_earliest_termination', ({ url }) => coreN4EarliestTermination(queryObject(url)))
}
