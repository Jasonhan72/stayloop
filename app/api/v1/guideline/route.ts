// GET /api/v1/guideline?effective=YYYY-MM-DD — tier 1 (stage 5 · 2026-10-16).
// Ontario rent-increase guideline for the year the increase takes effect, the
// statutory cap and the latest N1 service date. Pure date arithmetic.
import { handleV1, methodNotAllowed, optionsResponse, queryObject } from '@/lib/api/v1Http'
import { coreGuideline } from '@/lib/api/v1Core'

export const runtime = 'edge'

export async function OPTIONS() { return optionsResponse() }
export const POST = methodNotAllowed

export async function GET(req: Request) {
  return handleV1(req, 'guideline', ({ url }) => coreGuideline(queryObject(url)))
}
