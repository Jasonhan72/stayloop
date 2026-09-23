// The applicant-side tracker (proposal 2026-09-23 §3.2 · tenant flow). Pure:
// one application row plus what the tenant can see downstream (a lease sent
// to their email, a household they were invited to) → an ordered list of
// steps. The tenant never sees the score — only that the landlord looked,
// that a screening was started, and the decision.
export type Bi = { zh: string; en: string }
export type TrackState = 'done' | 'current' | 'todo' | 'bad'
export type TrackStep = { key: string; label: Bi; state: TrackState; when?: string | null }

export type TrackInput = {
  status: string | null
  created_at: string
  viewed_at?: string | null
  screened_at?: string | null
  decision_notified_at?: string | null
  /** The lease addressed to the applicant's email, if any. */
  lease?: { status: string | null; sent_at?: string | null; signed_at?: string | null } | null
  /** The household created from that lease and whether the tenant joined it. */
  household?: { id: string; joined: boolean } | null
}

const SIGNED = new Set(['signed_both', 'active', 'ended', 'imported'])
const day = (s?: string | null) => (s ? s.slice(0, 10) : null)

export function applicationTrack(a: TrackInput): TrackStep[] {
  const declined = a.status === 'declined'
  const approved = a.status === 'approved'
  const decided = declined || approved || !!a.decision_notified_at
  const leaseSigned = !!a.lease && SIGNED.has(a.lease.status ?? '')
  const leaseSent = !!a.lease && (a.lease.status === 'sent' || a.lease.status === 'signed_tenant')
  const joined = !!a.household?.joined

  const steps: TrackStep[] = [
    { key: 'submitted', label: { zh: '已提交', en: 'Submitted' }, state: 'done', when: day(a.created_at) },
    { key: 'viewed', label: { zh: '房东已查看', en: 'Landlord opened it' }, state: a.viewed_at ? 'done' : 'current', when: day(a.viewed_at) },
    { key: 'screened', label: { zh: '筛查已发起', en: 'Screening started' }, state: a.screened_at ? 'done' : a.viewed_at ? 'current' : 'todo', when: day(a.screened_at) },
    {
      key: 'decision',
      label: declined ? { zh: '未被选中', en: 'Not selected' } : approved ? { zh: '已录取', en: 'Approved' } : { zh: '房东决定', en: 'Landlord decision' },
      state: declined ? 'bad' : decided ? 'done' : a.screened_at ? 'current' : 'todo',
      when: day(a.decision_notified_at),
    },
  ]
  if (declined) return steps
  steps.push(
    { key: 'lease', label: { zh: '租约待签', en: 'Lease to sign' }, state: leaseSigned ? 'done' : leaseSent ? 'current' : approved ? 'todo' : 'todo', when: day(a.lease?.signed_at ?? a.lease?.sent_at) },
    { key: 'tenancy', label: { zh: '在管租约', en: 'Managed tenancy' }, state: joined ? 'done' : a.household ? 'current' : 'todo' },
  )
  // "Current" is the first not-done step after the last done one; steps after
  // it stay todo so the row reads left to right.
  let seenCurrent = false
  for (const s of steps) {
    if (s.state === 'current') { if (seenCurrent) s.state = 'todo'; else seenCurrent = true }
  }
  return steps
}

/** Short status line for list rows: the current step or the final outcome. */
export function trackSummary(steps: TrackStep[], zh: boolean): { text: string; tone: 'ok' | 'bad' | 'wait' } {
  const bad = steps.find((s) => s.state === 'bad')
  if (bad) return { text: zh ? bad.label.zh : bad.label.en, tone: 'bad' }
  const cur = steps.find((s) => s.state === 'current')
  if (cur) return { text: zh ? `等待：${cur.label.zh}` : `Waiting: ${cur.label.en}`, tone: 'wait' }
  const last = [...steps].reverse().find((s) => s.state === 'done')
  return { text: last ? (zh ? last.label.zh : last.label.en) : '—', tone: 'ok' }
}
