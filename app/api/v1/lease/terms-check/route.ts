// POST /api/v1/lease/terms-check — tier 1 (stage 5 · 2026-10-16). Lease-terms
// compliance for a province: Ontario via checkLeaseTerms, other provinces via
// the deposit / key deposit / rent-in-advance facts. No PII, nothing stored.
import { handleV1, methodNotAllowed, optionsResponse, readJsonObject } from '@/lib/api/v1Http'
import { coreLeaseTermsCheck } from '@/lib/api/v1Core'


export async function OPTIONS() { return optionsResponse() }
export const GET = methodNotAllowed

export async function POST(req: Request) {
  return handleV1(req, 'lease_terms_check', async () => coreLeaseTermsCheck(await readJsonObject(req)))
}
