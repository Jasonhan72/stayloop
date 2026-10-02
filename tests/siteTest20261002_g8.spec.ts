// Site-wide test 2026-10-02 · data layer (L5). Guards for supabase/migrations/20261002_site_test_fixes.sql.
// The behaviour was proven in a rollback-only transaction on prod (tenant member and verified creator
// rejected, importer accepted, non-member / counterparty-joined rejected; sweep marks 3-day uploading and
// 2-day scoring rows, leaves a 2-hour row).
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const MIG = 'supabase/migrations'
const strip = (s: string) => s.replace(/--[^\n]*/g, '')

/** Body of the LAST migration (file order) that (re)defines the given function. */
function latestDefinition(fn: string): { file: string; body: string } {
  const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  let found: { file: string; body: string } | null = null
  for (const f of files) {
    const sql = strip(readFileSync(`${MIG}/${f}`, 'utf8'))
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(sql))) {
      const end = sql.indexOf('end $$;', m.index)
      found = { file: f, body: sql.slice(m.index, end === -1 ? undefined : end + 7) }
    }
  }
  if (!found) throw new Error(`no definition of ${fn}`)
  return found
}

describe('L5-D1 attach_household_lease_file is import-only', () => {
  const { file, body } = latestDefinition('attach_household_lease_file')

  it('the current definition is the gated one', () => {
    expect(file >= '20261002_site_test_fixes.sql').toBe(true)
  })

  it('only the importer of an unverified import whose counterparty has not joined may attach', () => {
    expect(body).toMatch(/h\.created_by is distinct from v_uid then raise exception 'not_importer'/)
    expect(body).toMatch(/if h\.verified then raise exception 'household_verified'/)
    expect(body).toMatch(/h\.source <> 'imported'/)
    expect(body).toMatch(/m\.user_id <> v_uid and m\.status = 'active'[\s\S]*counterparty_joined/)
  })

  it('only an unsent, unsigned imported lease row can have its file replaced', () => {
    expect(body).toMatch(/status = 'imported'\s+and sent_at is null and landlord_signature is null and tenant_signature is null/)
    expect(body).toMatch(/if v_lease is null then raise exception 'lease_not_editable'/)
  })

  it('keeps the membership and path checks and audits each attach', () => {
    expect(body).toContain("raise exception 'not a member'")
    expect(body).toContain("raise exception 'path outside household'")
    expect(body).toContain("'household_lease_file_attached'")
  })

  it('stays authenticated-only (PUBLIC and anon revoked together)', () => {
    const sql = strip(readFileSync(`${MIG}/20261002_site_test_fixes.sql`, 'utf8'))
    expect(sql).toContain('revoke all on function public.attach_household_lease_file(uuid, text) from public, anon;')
    expect(sql).toContain('grant execute on function public.attach_household_lease_file(uuid, text) to authenticated;')
  })
})

describe('L5-D2 abandoned screenings are swept daily', () => {
  const sql = strip(readFileSync(`${MIG}/20261002_site_test_fixes.sql`, 'utf8'))
  const { body } = latestDefinition('screening_stuck_sweep')

  it('marks uploading / scoring rows idle for 24 h as error with a reason', () => {
    expect(body).toMatch(/security definer/)
    expect(body).toMatch(/where status = 'uploading'\s+and coalesce\(updated_at, created_at\) < now\(\) - interval '24 hours'/)
    expect(body).toMatch(/where status = 'scoring'\s+and coalesce\(updated_at, created_at\) < now\(\) - interval '24 hours'/)
    expect(body).toContain("error = 'abandoned_upload:")
    expect(body).toContain("error = 'scoring_timeout:")
  })

  it('is service-role only and scheduled with pg_cron', () => {
    expect(sql).toContain('revoke all on function public.screening_stuck_sweep() from public, anon, authenticated;')
    expect(sql).toContain('grant execute on function public.screening_stuck_sweep() to service_role;')
    expect(sql).toMatch(/cron\.schedule\('screening-stuck-sweep', '25 13 \* \* \*', \$\$select public\.screening_stuck_sweep\(\)\$\$\)/)
  })
})
