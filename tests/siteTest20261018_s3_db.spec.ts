// Site test 2026-10-17 · S3 database fixes (H-D2, the pending-card insert check, T4-06).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mig = readFileSync('supabase/migrations/20261018g_site_test_s3_db.sql', 'utf8')

describe('S3 database fixes', () => {
  it('H-D2 a retraction older than the UI window is refused in the database', () => {
    expect(mig).toContain("m.created_at > now() - interval '10 minutes') then raise exception 'retraction_window_passed'")
    expect(readFileSync('lib/threads/shared.ts', 'utf8')).toContain('export const RETRACT_WINDOW_MS = 10 * 60_000')
  })
  it('a client-inserted card is pending with no decision or execution on it', () => {
    expect(mig).toContain('as restrictive for insert with check (status = \'pending\' and executed_at is null and execution_result is null and decided_at is null)')
  })
  it('T4-06 is_email_unsubscribed is no longer executable from the API', () => {
    expect(mig).toContain('revoke execute on function public.is_email_unsubscribed(text) from public, anon, authenticated;')
  })
})

describe('S3 database fixes · second batch', () => {
  const mig2 = readFileSync('supabase/migrations/20261018h_site_test_s3_db2.sql', 'utf8')
  it('T6-D10 the corporate-registry lookups are service-role only', () => {
    expect(mig2).toContain('revoke execute on function public.search_corp_registry(text, real) from public, anon, authenticated;')
    expect(mig2).toContain('revoke execute on function public.lookup_corp_by_bn(text) from public, anon, authenticated;')
  })
  it('I-D3 handing a field back also empties its text', () => {
    expect(mig2).toContain(`case when p_field in ('current_focus', 'communication_style') then '""'::jsonb else '[]'::jsonb end`)
  })
  it('J-D6 the post-dated-cheque finding links to its rule', () => {
    expect(readFileSync('lib/agent/offerCheck.ts', 'utf8')).toContain("href: href('RTA-108-post-dated-cheques')")
  })
})
