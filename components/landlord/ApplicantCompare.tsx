'use client'

// Side-by-side applicant facts (P2 2026-09-23). Facts only — what the
// applicant stated, what documents exist, which third-party verifications
// are done, whether a screening ran, public-record counts. No ratios, no
// thresholds, no ranking: the OHRC rental policy forbids cut-offs, and the
// score stays "information" inside its own column.
import Link from 'next/link'
import { Table, Td, Tr } from '@/components/workspace'

export type CompareRow = {
  id: string
  name: string
  unitLabel: string | null
  created_at: string
  move_in_date?: string | null
  monthly_income: number | null
  employer_name?: string | null
  files: number
  verified_tier: number
  ai_score: number | null
  screening_status?: string | null
  ltb_records_found: number | null
  status: string | null
}

export function compareCells(r: CompareRow, zh: boolean): string[] {
  const stamps = r.verified_tier >= 4 ? (zh ? '身份 · 银行 · 征信' : 'ID · bank · credit') : r.verified_tier >= 3 ? (zh ? '身份 · 银行' : 'ID · bank') : r.verified_tier >= 1 ? (zh ? '身份' : 'ID') : (zh ? '无' : 'none')
  const screening = r.ai_score != null ? (zh ? `已评分 ${r.ai_score}（参考）` : `scored ${r.ai_score} (info)`) : r.screening_status ? (zh ? '进行中' : 'running') : (zh ? '未筛查' : 'not screened')
  const decision = r.status === 'approved' ? (zh ? '已录取' : 'approved') : r.status === 'declined' ? (zh ? '已婉拒' : 'declined') : r.status === 'reviewing' ? (zh ? '待补材料' : 'more docs asked') : (zh ? '待决定' : 'undecided')
  return [
    r.unitLabel ?? '—',
    r.created_at.slice(0, 10),
    r.move_in_date ?? '—',
    r.monthly_income != null ? `$${r.monthly_income.toLocaleString()}` : '—',
    r.employer_name ?? '—',
    String(r.files),
    stamps,
    screening,
    r.ltb_records_found == null ? '—' : String(r.ltb_records_found),
    decision,
  ]
}

const HEAD = {
  zh: ['申请人', '房源', '提交', '期望入住', '申报月收入', '雇主', '材料', '第三方核验', '筛查', 'LTB 记录', '决定'],
  en: ['Applicant', 'Listing', 'Submitted', 'Move-in', 'Stated income/mo', 'Employer', 'Docs', 'Verified', 'Screening', 'LTB records', 'Decision'],
}

export default function ApplicantCompare({ rows, zh }: { rows: CompareRow[]; zh: boolean }) {
  if (rows.length < 2) return null
  return (
    <div className="mb-4 rounded-2xl border border-line-divider bg-white" data-testid="applicant-compare">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <div className="text-[14px] font-extrabold">{zh ? '并排对比 · 只列事实' : 'Side by side · facts only'}</div>
        <div className="text-[11.5px] text-body-3">{zh ? '申报数字来自申请表，核验章来自申请人本人授权的第三方核验；评分仅供参考，不排序。' : 'Stated figures are from the form; stamps are applicant-authorised third-party checks; the score is information and nothing here is ranked.'}</div>
      </div>
      <div className="px-2 pb-2 pt-2">
        <Table head={(zh ? HEAD.zh : HEAD.en)}>
          {rows.map((r) => {
            const cells = compareCells(r, zh)
            return (
              <Tr key={r.id}>
                <Td strong><Link href={`/landlord/applicants/${r.id}`} className="underline underline-offset-2">{r.name}</Link></Td>
                {cells.map((c, i) => <Td key={i} muted={i === 0 || i === 4} mono={i === 1 || i === 2 || i === 3 || i === 5 || i === 8}>{c}</Td>)}
              </Tr>
            )
          })}
        </Table>
      </div>
    </div>
  )
}
