// Site test 2026-10-17 · S0 / S1 fixes (defect ledger T4-01..04, T6-D1, T6-D2).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const mig = read('supabase/migrations/20261018_site_test_s0s1.sql')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe('T6-D1 · billing routes never open the landlord hat', () => {
  for (const p of ['app/api/stripe/checkout/route.ts', 'app/api/stripe/unlock/route.ts']) {
    it(`${p} answers 403 landlord_required instead of calling claim_landlord`, () => {
      const src = read(p)
      expect(src).not.toContain("rpc('claim_landlord')")
      expect(src).toContain("{ error: 'landlord_required' }, { status: 403 }")
    })
  }
  it('every caller sends a landlord_required answer to /landlord/become', () => {
    for (const p of ['app/dashboard/page.tsx', 'components/settings/SubscriptionCard.tsx']) {
      expect(read(p)).toContain("data.error === 'landlord_required'")
    }
    expect(read('app/screening/app/page.tsx').match(/data\.error === 'landlord_required'/g)?.length).toBe(2)
  })
})

describe('T6-D2 · the tenant signing token is not client-readable', () => {
  it('the migration replaces the table SELECT with a column list that leaves sign_token out', () => {
    expect(mig).toContain('revoke select on public.lease_documents from anon, authenticated;')
    const grant = mig.match(/grant select \(([^)]*)\)\s+on public\.lease_documents/)
    expect(grant).not.toBeNull()
    expect(grant![1]).not.toContain('sign_token')
  })
  it('no page, component or lib reads sign_token through the user client', () => {
    const offenders = [...walk('app'), ...walk('components')]
      .filter((p) => !p.startsWith('app/api/'))
      .filter((p) => read(p).includes('sign_token'))
    expect(offenders).toEqual([])
  })
  it('/api/lease/send checks ownership with the user client and reads the token with service role', () => {
    const src = read('app/api/lease/send/route.ts')
    expect(src).toMatch(/await sb\s*\.from\('lease_documents'\)\s*\.select\('id, landlord_id, status, terms, tenant_email'\)/)
    expect(src).toMatch(/await adminSb\s*\.from\('lease_documents'\)\s*\.select\('[^']*sign_token/)
  })
  it('the landlord lease page no longer shows the tenant link', () => {
    const page = read('app/landlord/leases/[id]/page.tsx')
    expect(page).not.toContain('sign_token')
    expect(page).not.toContain('租客永久链接')
  })
})

describe('T4 · database fixes in the migration', () => {
  it('T4-01 definer directory views lose every write privilege', () => {
    for (const v of ['provider_directory', 'provider_credentials_public', 'agent_directory']) {
      expect(mig).toContain(`revoke insert, update, delete, truncate, references, trigger on public.${v} from public, anon, authenticated;`)
    }
  })
  it('T4-02 the anon application policy checks the listing through a definer helper, and the landlord policy is bound to authenticated', () => {
    expect(mig).toContain('public.listing_accepts_applications(listing_id)')
    expect(mig).toMatch(/revoke execute on function public\.listing_accepts_applications\(uuid\) from public, anon, authenticated;/)
    expect(mig).toContain('alter policy "Landlords see own applications" on public.applications to authenticated;')
  })
  it('T4-03 household members cannot rewrite their own role (invoker guard, before update)', () => {
    expect(mig).toMatch(/guard_household_member_update\(\)\s*returns trigger language plpgsql security invoker/)
    expect(mig).toContain('before update on public.household_members')
  })
  it('T4-04 corrections follow a deleted screening only through the cascade', () => {
    expect(mig).toContain("if tg_op = 'DELETE' and pg_trigger_depth() > 1 then")
  })
})

describe('T6-D2 follow-up (2026-10-19) · server routes read sign_token only with service role', () => {
  it('every lease_documents select that names sign_token goes through admin / adminSb', () => {
    const offenders: string[] = []
    for (const p of walk('app/api')) {
      const src = read(p)
      const re = /(\w+)\s*\.from\('lease_documents'\)\s*\.select\('([^']*)'\)/g
      for (let m = re.exec(src); m; m = re.exec(src)) {
        if (m[2].includes('sign_token') && !['admin', 'adminSb'].includes(m[1])) offenders.push(`${p}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
  it('the landlord countersign checks visibility without the token, then reads the row with service role', () => {
    const src = read('app/api/lease/sign/route.ts')
    expect(src).toMatch(/await sb\s*\.from\('lease_documents'\)\s*\.select\('id'\)/)
    expect(src).toMatch(/await admin\s*\.from\('lease_documents'\)\s*\.select\('[^']*sign_token[^']*'\)\s*\.eq\('id', visible\.id\)/)
  })
})
