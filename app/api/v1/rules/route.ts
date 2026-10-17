// GET /api/v1/rules?province= — tier 1 (stage 5 · 2026-10-16). Free, anonymous,
// no personal data: the province's rule table from lib/api/v1Core.ts coreRules.
import { handleV1, methodNotAllowed, optionsResponse, queryObject } from '@/lib/api/v1Http'
import { coreRules } from '@/lib/api/v1Core'

export const runtime = 'edge'

export async function OPTIONS() { return optionsResponse() }
export const POST = methodNotAllowed

export async function GET(req: Request) {
  return handleV1(req, 'rules', ({ url }) => coreRules(queryObject(url)))
}
