// GET /api/v1/rent-benchmark?province=ON&area=&bedrooms=&type= — tier 1
// (stage 5 · 2026-10-16). Openly licensed CMHC / Statistics Canada figures from
// public.rent_benchmarks, read with the service role (the table is public-read
// anyway; the anon REST reader is the fallback when the key is absent). The
// response's `attribution` must be shown wherever the figure is printed.
import { createClient } from '@supabase/supabase-js'
import { handleV1, methodNotAllowed, optionsResponse, queryObject } from '@/lib/api/v1Http'
import { coreRentBenchmark, type BenchmarkClient } from '@/lib/api/v1Core'

export const runtime = 'edge'

export async function OPTIONS() { return optionsResponse() }
export const POST = methodNotAllowed

function serviceClient(): BenchmarkClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(req: Request) {
  return handleV1(req, 'rent_benchmark', ({ url }) => coreRentBenchmark(serviceClient(), queryObject(url)))
}
