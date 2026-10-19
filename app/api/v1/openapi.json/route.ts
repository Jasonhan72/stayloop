// GET /api/v1/openapi.json — the tier-1 OpenAPI 3.1 document (stage 5 ·
// 2026-10-16). Static data from lib/api/openapi.ts; cacheable for an hour.
import { OPENAPI } from '@/lib/api/openapi'
import { API_VERSION, CORS_HEADERS, methodNotAllowed } from '@/lib/api/v1Http'


const HEADERS = { ...CORS_HEADERS, 'x-api-version': API_VERSION, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=3600' }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS })
}
export const POST = methodNotAllowed

export async function GET() {
  return new Response(JSON.stringify(OPENAPI), { status: 200, headers: { ...HEADERS, 'content-type': 'application/json; charset=utf-8' } })
}
