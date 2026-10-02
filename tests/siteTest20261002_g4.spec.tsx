// Site test 2026-10-02 · G4 landlord group.
// L6-authed D2: a lease whose terms lack the contact / utilities blocks crashed /landlord/leases/<id>.
// L6-authed D3 + L7 D2: the applicant detail overflowed 17–32px at 375 / 390 (grid without minmax(0)).
// L7 D1: the household hub said 租中 for a lease that starts next month.
// L7 D3: an unscreened applicant carried a 评分中 / Scoring chip.
// L7 D4: "five dimensions" — the rubric has four scored items.
// L7 note: hard-gate chips on the applicant detail printed raw codes.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { leaseHasTerms, leaseTermsRenderable } from '@/lib/lease/leaseState'
import OntarioLeaseDoc, { normalizeOntarioTerms } from '@/components/lease/OntarioLeaseDoc'
import { emptyOntarioTerms, type OntarioLeaseTerms } from '@/lib/lease/ontario'
import { leaseDisplayState, leaseStateDetail } from '@/lib/matters/states'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

// The production row's keys (lease 46b558d0…, form ontario_standard, status signed_both).
const partialTerms = {
  landlord_legal_name: '[TEST] Landlord Person',
  tenant_names: ['[TEST] Tenant Person'],
  unit: { street: '100 Test Ave', unit: '1', city: 'Toronto' },
  term: { start_date: '2026-11-01', type: 'fixed', end_date: '2026-12-19' },
  rent: { amount: 2450, due_day: 'first day of each month' },
  deposit: 2450,
  smoking: 'no',
  services: {},
  utilities_note: 'tenant pays hydro',
  additional_terms: '',
  landlord_address: '1 Somewhere St',
}

describe('L6 D2 · a lease with incomplete terms never crashes the detail page', () => {
  it('partial terms still count as terms but are not renderable', () => {
    expect(leaseHasTerms(partialTerms)).toBe(true)
    expect(leaseTermsRenderable(partialTerms, 'ontario_standard')).toBe(false)
    expect(leaseTermsRenderable(partialTerms, null)).toBe(false)
  })
  it('a complete Ontario document is renderable', () => {
    const full: OntarioLeaseTerms = { ...emptyOntarioTerms(), landlord_legal_name: 'Sarah Wang', tenant_names: ['Mia Chen'], rent: { amount: 2800, due_day: 'first day of each month' } }
    expect(leaseTermsRenderable(full, 'ontario_standard')).toBe(true)
    // Checked against the TRREB shape when the row says trreb.
    expect(leaseTermsRenderable(full, 'trreb')).toBe(false)
    expect(leaseTermsRenderable({}, 'ontario_standard')).toBe(false)
    expect(leaseTermsRenderable(null, 'ontario_standard')).toBe(false)
  })
  it('the detail page picks the document by the shape check and falls back to the record view', () => {
    const p = read('app/landlord/leases/[id]/page.tsx')
    expect(p).toContain('const hasTerms = leaseTermsRenderable(l.terms, l.form_type)')
    expect(p).toContain('const recordOnly = leaseIsRecordOnly(l) || !hasTerms')
    expect(p).toContain('const sendable = leaseIsSendable(l) && hasTerms')
    expect(p).not.toContain('!!(l.terms as OntarioLeaseTerms).landlord_legal_name')
    expect(p).toContain('这份租约的条款文档不完整，无法在这里显示')
  })
  it('the renderer itself tolerates missing blocks (the signing page uses it too) and invents nothing', () => {
    expect(() => renderToStaticMarkup(<OntarioLeaseDoc terms={partialTerms as unknown as OntarioLeaseTerms} status="signed_both" />)).not.toThrow()
    const html = renderToStaticMarkup(<OntarioLeaseDoc terms={{} as OntarioLeaseTerms} />)
    expect(html).toContain('Residential Tenancy Agreement')
    // A missing utilities block prints a dash, not "Tenant"; a missing term type is not "Month-to-month".
    expect(html).not.toContain('Month-to-month')
    expect(html).not.toMatch(/paid by<\/span><span class="font-medium">Tenant/)
    const n = normalizeOntarioTerms(partialTerms)
    expect(n.contact).toEqual({})
    expect(n.utilities).toEqual({})
    expect(n.rent.amount).toBe(2450)
  })
})

describe('L6 D3 / L7 D2 · applicant detail fits a 375px screen', () => {
  const p = read('app/landlord/applicants/[id]/page.tsx')
  it('both grids are minmax(0) tracks, never a bare 1.3fr_1fr', () => {
    expect(p).not.toContain('lg:grid-cols-[1.3fr_1fr]')
    expect(p.match(/grid grid-cols-1 gap-6 lg:grid-cols-\[minmax\(0,1\.3fr\)_minmax\(0,1fr\)\]/g)?.length).toBe(2)
  })
  it('the thread card lets the composer textarea shrink', () => {
    expect(p).toContain('className="sl-card min-w-0 p-4 sm:p-6 [&_textarea]:min-w-0" data-testid="application-thread"')
  })
})

describe('L7 D1 · household hub: a lease that has not started is not "in tenancy"', () => {
  it('the shared state words say signed · starts on the date', () => {
    const today = new Date('2026-10-02T12:00:00Z')
    const l = { status: 'active', start_date: '2026-11-01', end_date: '2026-12-19' }
    expect(leaseDisplayState(l, today)).toBe('upcoming')
    expect(leaseStateDetail(l, true, today)).toBe('已签 · 2026-11-01 起租')
    // Past the end date it is still a tenancy (month-to-month), not "upcoming".
    expect(leaseDisplayState({ ...l, start_date: '2025-01-01', end_date: '2025-12-31' }, today)).not.toBe('upcoming')
  })
  it('the hub branches on it', () => {
    const p = read('app/h/[id]/page.tsx')
    expect(p).toContain("const notStarted = leaseDisplayState(tenancyLease) === 'upcoming'")
    expect(p).toContain('{notStarted ? (')
    expect(p).toContain('leaseStateDetail(tenancyLease, zh)')
  })
})

describe('L7 D3 · "Scoring" only while a screening runs', () => {
  it('detail chip: not screened / not completed / scoring', () => {
    const p = read('app/landlord/applicants/[id]/page.tsx')
    expect(p).not.toContain("scored ? tierLabel(linked?.v3_tier) : zh ? '评分中' : 'Scoring'")
    expect(p).toContain("const linkedRunning = !!linked && (linked.status === 'uploading' || linked.status === 'scoring')")
    expect(p).toContain("(zh ? '未筛查' : 'Not screened')")
  })
  it('list line: scoring only for a running latest screening', () => {
    const p = read('app/landlord/applicants/page.tsx')
    expect(p).toContain("return st === 'uploading' || st === 'scoring'")
    expect(p).toContain('`材料 ${n} 份 · 未筛查`')
    expect(p).toContain('latest_screening_status: latest.get(r.id) ?? null')
  })
})

describe('L7 D4 · four scored items, never five dimensions', () => {
  it('applicant detail and the /screening comparison row', () => {
    for (const f of ['app/landlord/applicants/[id]/page.tsx', 'app/screening/copy.ts']) {
      const s = read(f)
      expect(s, f).not.toMatch(/五个维度|五维|five dimensions/i)
    }
    expect(read('app/screening/copy.ts')).toContain('可解释评分:四项评分')
    expect(read('app/landlord/applicants/[id]/page.tsx')).toContain('完整报告含四项评分（付款能力、信用、租务与司法历史、核验）')
  })
})

describe('L7 note · hard-gate chips read as words', () => {
  it('rendered through signalLabel like the report page', () => {
    const p = read('app/landlord/applicants/[id]/page.tsx')
    expect(p).toContain("import { signalLabel } from '@/lib/screening/signalLabels'")
    expect(p).toContain('{signalLabel(g, zh)}</span>')
    expect(p).not.toMatch(/text-danger">\{g\}<\/span>/)
  })
})
