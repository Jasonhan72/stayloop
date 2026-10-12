import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Four-role audit 2026-10-12, P1-1: the application → screening link. An application
// submitted without files produced a screening row that the scorer marked
// `error: no_documents`; the route then returned that row forever ("existing"), the
// button turned into "open the screening report", and the PDFs the applicant later
// sent in the application conversation never counted. See
// design/4role-audit-fix-plan-2026-10-12.md.
describe('application → screening (audit 2026-10-12 P1-1)', () => {
  const route = readFileSync('app/api/screening/from-application/route.ts', 'utf8')
  const page = readFileSync('app/landlord/applicants/[id]/page.tsx', 'utf8')

  it('documents the applicant sends in the application conversation count as application material', () => {
    expect(route).toMatch(/from\('thread_attachments'\)/)
    expect(route).toMatch(/\.eq\('kind', 'application'\)\.eq\('ref_id', appId\)/)
    // The landlord's own uploads in that conversation are not applicant material.
    expect(route).toMatch(/a\.uploaded_by !== landlordId/)
    // Copied into tenant-files under the application prefix so application_file_readable() and /api/file-url apply.
    expect(route).toMatch(/\$\{appId\}\/thread\//)
    expect(route).toMatch(/from\('tenancy-files'\)\.download/)
    expect(route).toMatch(/from\('tenant-files'\)\.upload/)
    // The same file sent twice is one document.
    expect(route).toMatch(/seen\.has\(a\.sha256\)/)
  })

  it('with nothing to read it answers 422 no_documents and creates no row', () => {
    const idx422 = route.indexOf("error: 'no_documents'")
    const idxInsert = route.indexOf(".from('screenings')\n    .insert(")
    expect(idx422).toBeGreaterThan(0)
    expect(idxInsert).toBeGreaterThan(idx422)
    expect(route).toMatch(/\{ status: 422 \}/)
  })

  it('a run that ended in error no longer blocks a new run', () => {
    expect(route).toMatch(/if \(existing && existing\.status !== 'error'\)/)
    expect(route).toMatch(/retry_after_error: !!existing/)
  })

  it('the applicant page shows why the last run failed, offers to run again and explains a 422', () => {
    expect(page).toMatch(/hard_gates_triggered, verification, error'\)/)
    expect(page).toMatch(/const linkedFailed = !!linked && linked\.status === 'error'/)
    expect(page).toMatch(/data-testid="screening-failed-why"/)
    expect(page).toMatch(/linkedFailed \? \(zh \? '🔍 重新筛查' : '🔍 Screen again'\)/)
    expect(page).toMatch(/res\.status === 422 && j\.error === 'no_documents'/)
    expect(page).toMatch(/申请没有附任何材料，无法筛查/)
    // The "ask them to verify" link needs a live screening, not a failed one.
    expect(page).toMatch(/\{screeningId && !linkedFailed && \(/)
  })

  it('dimension wording: four scored items plus the unscored completeness note (P2-1)', () => {
    expect(page).toMatch(/四项计分（付款能力、信用、租务与司法历史、核验），另列不计分的「申请完整度与沟通」/)
    expect(page).not.toMatch(/完整报告含四项评分/)
    const apply = readFileSync('app/apply/[slug]/page.tsx', 'utf8')
    expect(apply).toMatch(/没有附材料的申请，房东无法筛查；提交后也可以在申请对话里补传/)
  })
})
