// Site test 2026-10-17 · S3 batch B guards.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { proposeMatches } from '../lib/household/csvReconcile'
import { torontoDate, torontoDateTime } from '../lib/household/ledger'
import { cardImages } from '../lib/listingVisibility'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')

describe('D-A4 / D-A6 sign-out clears per-account browser state', () => {
  const helper = read('lib/auth/clearLocalSession.ts')
  it('helper removes sl-thread-current-* and sl-onboarding-role', () => {
    expect(helper).toContain('sl-thread-current-')
    expect(helper).toContain('sl-onboarding-role')
  })
  for (const f of ['lib/useAuth.ts', 'lib/useUser.ts', 'lib/useLandlord.ts']) {
    it(`${f} signOut calls it before supabase signOut`, () => {
      const s = read(f)
      const body = s.slice(s.indexOf('const signOut'))
      expect(body.indexOf('clearLocalSessionState()')).toBeGreaterThan(-1)
      expect(body.indexOf('clearLocalSessionState()')).toBeLessThan(body.indexOf('auth.signOut()'))
    })
  }
})

describe('D-A8 terms confirmation is claimed once', () => {
  const route = read('app/api/legal/terms-confirmation/route.ts')
  it('claims (user, version) before sending and treats 23505 as already', () => {
    expect(route).toContain("from('terms_confirm_claims').insert")
    expect(route).toContain("'23505'")
    expect(route.indexOf("terms_confirm_claims').insert")).toBeLessThan(route.indexOf('await sendEmail'))
  })
  it('migration has a primary key on (user_id, terms_version)', () => {
    expect(read('supabase/migrations/20261018f_terms_confirm_once.sql')).toMatch(/primary key \(user_id, terms_version\)/)
  })
})

describe('C-S3-1 search cards get only the first non-data photo', () => {
  it('cardImages', () => {
    expect(cardImages(['https://a/1.jpg', 'https://a/2.jpg'])).toEqual(['https://a/1.jpg'])
    expect(cardImages(['data:image/png;base64,AAAA', 'https://a/2.jpg'])).toEqual(['https://a/2.jpg'])
    expect(cardImages(['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'])).toEqual(['data:image/png;base64,AAAA'])
    expect(cardImages(null)).toEqual([])
  })
  it('route uses it', () => expect(read('app/api/listings/search/route.ts')).toContain('cardImages(r.images)'))
})

describe('C-S3-4 missing listing page is noindex', () => {
  it('renders robots noindex', () => expect(read('app/listings/[slug]/page.tsx')).toContain('<meta name="robots" content="noindex" />'))
})

describe('C-S3-6 quick publish checks duplicates before photo reading', () => {
  const s = read('app/dashboard/listings/quick/page.tsx')
  it('debounced effect on address/unit calls findExistingListing', () => {
    const i = s.indexOf('C-S3-6')
    expect(i).toBeGreaterThan(-1)
    expect(s.slice(i, s.indexOf('async function addPhotos'))).toContain('findExistingListing')
    expect(s).toContain('quick-existing-early')
  })
})

describe('D-S3-2 apply page hides the pack picker when already applied', () => {
  it('UseMyPack gated by existingApp', () => {
    expect(read('app/apply/[slug]/page.tsx')).toMatch(/!\(existingApp && !createdAppId\) && \(\s*<UseMyPack/)
  })
})

describe('D-F-02 timestamps display in Toronto time', () => {
  it('helpers', () => {
    expect(torontoDate('2026-10-18T03:40:00Z')).toBe('2026-10-17')
    expect(torontoDateTime('2026-10-18T03:40:00Z')).toBe('2026-10-17 23:40')
  })
  it('no UTC slicing of timestamptz columns', () => {
    expect(read('components/landlord/NoticeToolbox.tsx')).not.toContain('created_at.slice(0, 16)')
    const r = read('components/household/RentPeriodRow.tsx')
    for (const k of ['paid_at', 'confirmed_at', 'evidence_at']) expect(r).not.toContain(`${k}.slice(`)
    expect(read('app/landlord/leases/[id]/page.tsx')).not.toContain('signed_at?.slice(0, 10)')
    expect(read('app/h/[id]/page.tsx')).not.toContain('i.created_at.slice(0, 10)')
  })
})

describe('D-F-03 2x deposit with one recorded neighbour', () => {
  it('unrecorded 08-01 gets a likely double match paired with recorded 09-01', () => {
    const periods = [
      { due: '2026-08-01', state: 'due', record: null },
      { due: '2026-09-01', state: 'paid', record: { status: 'paid' } },
    ]
    const rows = [{ date: '2026-08-28', description: 'RENT AUG SEP', amount: 4900, raw: '' }]
    const r = proposeMatches(rows, periods, { monthlyRent: 2450, today: '2026-10-16' })
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0]).toMatchObject({ due: '2026-08-01', confidence: 'likely', reason: 'double', pairedWith: '2026-09-01' })
    expect(r.unmatched).toEqual([])
  })
})
