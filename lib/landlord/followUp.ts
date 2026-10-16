// Post-screening follow-up e-mails · V1.0 阶段 1 · 甲 #3
// (design/v1-scope-and-roadmap-2026-10.md; research C1-3 / 缺口 2 in
// design/research/v1/landlord-retention-2026-10.md).
//
// Finding: nothing calls a landlord back after the screening report. Two
// e-mails, keyed on the landlord's FIRST scored screening:
//   d3  — ≥ 3 days after, no lease and no managed tenancy yet.
//   d14 — ≥ 14 days after, still nothing recorded. Different wording.
// At most one e-mail per landlord per sweep; each stage goes out once
// (landlord_followups unique (landlord_auth_id, stage), written only after
// Resend accepted the message). Test / reviewer accounts and @stayloop.ai
// addresses are never e-mailed.
//
// Layout of this file:
//   • Pure part (planFollowUps, isTestAccountUser, renderFollowUpEmail) —
//     no I/O, covered by tests/v1stage1_followUp.spec.ts.
//   • Server part (runLandlordFollowUps) — service role only, called from
//     app/api/agent/proactive/route.ts cron mode.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { writeAuditEvent } from '@/lib/agent/audit'

// ---------------------------------------------------------------------------
// Pure part
// ---------------------------------------------------------------------------

export type FollowUpStage = 'd3' | 'd14'
export const FOLLOWUP_STAGES: readonly FollowUpStage[] = ['d3', 'd14'] as const
export const FOLLOWUP_D3_DAYS = 3
export const FOLLOWUP_D14_DAYS = 14
/** A landlord whose first screening is older than this never gets a (late) follow-up —
 *  "你的筛查报告之后…" makes no sense months later. */
export const FOLLOWUP_MAX_AGE_DAYS = 60

export type FollowUpCandidate = {
  authId: string
  email: string | null
  /** test_account / muse_account / reviewer_account or an @stayloop.ai address. */
  isTest: boolean
  /** ISO timestamp of the landlord's FIRST scored screening (scored_at ?? created_at). */
  firstScreenedAt: string | null
  firstScreeningId: string | null
  /** Any lease_documents row owned by this landlord (any status). */
  hasLease: boolean
  /** Any households row created by or listing this landlord as a landlord member. */
  hasHousehold: boolean
  /** Stages already e-mailed (landlord_followups). */
  sent: readonly FollowUpStage[]
}

export type FollowUpPlan = {
  authId: string
  email: string
  stage: FollowUpStage
  screeningId: string | null
  daysSinceFirstScreening: number
}

export type FollowUpSkipReason = 'test_account' | 'no_email' | 'no_screening' | 'has_lease_or_household' | 'too_early' | 'already_sent' | 'too_old'

type AuthUserLike = { email?: string | null; user_metadata?: Record<string, unknown> | null }

/** Accounts that must never receive product e-mail: flagged test / Muse / reviewer accounts and our own domain. */
export function isTestAccountUser(u: AuthUserLike | null | undefined): boolean {
  if (!u) return true
  const md = (u.user_metadata ?? {}) as Record<string, unknown>
  if (md.test_account === true || md.muse_account === true || md.reviewer_account === true) return true
  const email = (u.email || '').trim().toLowerCase()
  if (!email) return true
  return email.endsWith('@stayloop.ai')
}

export function daysSince(iso: string, now: Date): number {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return Number.NaN
  return Math.floor((now.getTime() - t) / 86_400_000)
}

/** Why a candidate gets no e-mail this sweep, or null when one is due (the stage is in `stageFor`). */
export function skipReason(c: FollowUpCandidate, now: Date, opts: { maxAgeDays?: number } = {}): FollowUpSkipReason | null {
  if (c.isTest) return 'test_account'
  if (!c.email) return 'no_email'
  if (!c.firstScreenedAt) return 'no_screening'
  if (c.hasLease || c.hasHousehold) return 'has_lease_or_household'
  const days = daysSince(c.firstScreenedAt, now)
  if (!Number.isFinite(days)) return 'no_screening'
  const maxAge = opts.maxAgeDays ?? FOLLOWUP_MAX_AGE_DAYS
  if (days > maxAge) return 'too_old'
  if (c.sent.includes('d14')) return 'already_sent'
  if (days >= FOLLOWUP_D14_DAYS) return null
  if (days < FOLLOWUP_D3_DAYS) return 'too_early'
  return c.sent.includes('d3') ? 'already_sent' : null
}

/** The stage due now: d14 once ≥ 14 days (even if d3 was never sent — never two in one sweep, never d3 after d14), else d3. */
export function stageFor(c: FollowUpCandidate, now: Date, opts: { maxAgeDays?: number } = {}): FollowUpStage | null {
  if (skipReason(c, now, opts) !== null) return null
  const days = daysSince(c.firstScreenedAt as string, now)
  return days >= FOLLOWUP_D14_DAYS ? 'd14' : 'd3'
}

/**
 * Decide which landlords get which e-mail this sweep. Pure: no I/O, no clock
 * of its own. One plan per landlord at most.
 */
export function planFollowUps(rows: readonly FollowUpCandidate[], now: Date, opts: { maxAgeDays?: number } = {}): FollowUpPlan[] {
  const out: FollowUpPlan[] = []
  const seen = new Set<string>()
  for (const c of rows) {
    if (seen.has(c.authId)) continue
    const stage = stageFor(c, now, opts)
    if (!stage) continue
    seen.add(c.authId)
    out.push({
      authId: c.authId,
      email: c.email as string,
      stage,
      screeningId: c.firstScreeningId,
      daysSinceFirstScreening: daysSince(c.firstScreenedAt as string, now),
    })
  }
  return out
}

// ---- e-mail copy -----------------------------------------------------------

export type FollowUpLang = 'zh' | 'en' | 'both'

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type Copy = {
  subject: string
  intro: string
  /** Three things, each [label, path, note]. */
  items: [string, string, string][]
  truth: string
  outro: string
}

export const FOLLOWUP_LINKS = {
  draftLease: '/landlord/leases/new',
  importLease: '/leases/import',
  screenAgain: '/screening/app',
} as const

function copyFor(stage: FollowUpStage, lang: 'zh' | 'en'): Copy {
  const L = FOLLOWUP_LINKS
  if (lang === 'zh') {
    if (stage === 'd3') {
      return {
        subject: '你的筛查报告之后：把租约录进来，续约 / 报修 / 催租都会自动跟进',
        intro: '几天前你在 Stayloop 做了一次租客筛查。报告只是第一步——把租约录进来，AI 助理才能替你跟进后面的事：到期前 90 / 60 / 30 天的续约提醒、租客报修的派单、每月的租金提醒。',
        items: [
          ['起草安省标准租约', L.draftLease, '按录取的申请人直接生成，电子签约。'],
          ['导入已签的租约', L.importLease, '已经签了纸质租约？上传或填三样：地址、租金、起止日。'],
          ['再筛一位申请人', L.screenAgain, '还在比较人选？免费档每月 3 次。'],
        ],
        truth: '一句真话：Stayloop 不经手租金。租金提醒和记录都在你和租客之间，钱不经过我们。',
        outro: '不想再收到这类提醒？回复这封邮件告诉我们即可。',
      }
    }
    return {
      subject: '还没录入租约？只要地址、租金、起止日三样',
      intro: '两周前你在 Stayloop 做过租客筛查，账号里还没有任何租约。录入只要三样——地址、租金、起止日——之后续约窗口、N1 截止日、租客报修和每月租金提醒就都有人盯着。',
      items: [
        ['起草安省标准租约', L.draftLease, '新租客还没签？从申请人直接生成，电子签约。'],
        ['导入已签的租约', L.importLease, '已有租约：填地址、租金、起止日，或上传 PDF 让 AI 抽取。'],
        ['再筛一位申请人', L.screenAgain, '人选变了？再筛一位，免费档每月 3 次。'],
      ],
      truth: '一句真话：Stayloop 不经手租金，只做提醒与记录。',
      outro: '不想再收到这类提醒？回复这封邮件告诉我们即可。',
    }
  }
  if (stage === 'd3') {
    return {
      subject: 'After your screening report: record the lease, and renewals, repairs and rent reminders follow automatically',
      intro: 'A few days ago you screened a tenant on Stayloop. The report is only the first step — once the lease is recorded, your AI Agent can follow up on what comes next: renewal touchpoints 90 / 60 / 30 days before the end, dispatching repair requests, and monthly rent reminders.',
      items: [
        ['Draft the Ontario Standard Lease', L.draftLease, 'Generated from the approved applicant, signed electronically.'],
        ['Import a signed lease', L.importLease, 'Already signed on paper? Upload it, or enter three things: address, rent, dates.'],
        ['Screen another applicant', L.screenAgain, 'Still comparing? The free plan includes 3 screenings a month.'],
      ],
      truth: 'One plain fact: Stayloop never handles rent. Reminders and records stay between you and your tenant; no money passes through us.',
      outro: 'Don’t want these reminders? Reply to this e-mail and we’ll stop.',
    }
  }
  return {
    subject: 'No lease recorded yet? It only takes the address, the rent and the dates',
    intro: 'Two weeks ago you screened a tenant on Stayloop, and there is still no lease in your account. Recording one takes three things — address, rent, start and end dates — and from then on the renewal window, the N1 deadline, repair requests and monthly rent reminders are watched for you.',
    items: [
      ['Draft the Ontario Standard Lease', L.draftLease, 'New tenant not signed yet? Generate it from the applicant and sign electronically.'],
      ['Import a signed lease', L.importLease, 'Existing lease: enter address, rent and dates, or upload the PDF for the AI to extract.'],
      ['Screen another applicant', L.screenAgain, 'Changed your mind on the applicant? Screen another; the free plan includes 3 a month.'],
    ],
    truth: 'One plain fact: Stayloop never handles rent — reminders and records only.',
    outro: 'Don’t want these reminders? Reply to this e-mail and we’ll stop.',
  }
}

function sectionText(c: Copy, site: string): string {
  return [
    c.intro,
    '',
    ...c.items.map(([label, path, note], i) => `${i + 1}. ${label} — ${note}\n   ${site}${path}`),
    '',
    c.truth,
    '',
    c.outro,
  ].join('\n')
}

function sectionHtml(c: Copy, site: string): string {
  const items = c.items
    .map(([label, path, note]) => `<li style="margin:0 0 10px 0;"><a href="${site}${path}" style="color:#00ACE4;font-weight:600;text-decoration:none;">${esc(label)}</a><br><span style="color:#4A4A6A;">${esc(note)}</span></li>`)
    .join('')
  return `<p style="margin:0 0 14px 0;">${esc(c.intro)}</p><ol style="margin:0 0 14px 20px;padding:0;">${items}</ol><p style="margin:0 0 14px 0;color:#1B1B3C;">${esc(c.truth)}</p><p style="margin:0;font-size:12px;color:#6E6E8A;">${esc(c.outro)}</p>`
}

/**
 * Render one follow-up e-mail. `lang='both'` (the default — accounts store no
 * UI language) puts Chinese first, then English, under a bilingual subject.
 */
export function renderFollowUpEmail(stage: FollowUpStage, lang: FollowUpLang = 'both', site = SITE()): { subject: string; html: string; text: string } {
  const parts: Copy[] = lang === 'both' ? [copyFor(stage, 'zh'), copyFor(stage, 'en')] : [copyFor(stage, lang)]
  const subject = parts.map((p) => p.subject).join(' / ')
  const text = parts.map((p) => sectionText(p, site)).join('\n\n— — —\n\n')
  const body = parts.map((p) => sectionHtml(p, site)).join('<hr style="border:0;border-top:1px solid #E3F2FC;margin:20px 0;">')
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F3F8FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1B1B3C;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F8FC;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #D3E3EF;">
          <tr><td style="padding:24px 28px 8px 28px;">
            <div style="font-size:11px;letter-spacing:0.12em;color:#00ACE4;text-transform:uppercase;font-weight:600;">Stayloop</div>
            <h1 style="margin:8px 0 0 0;font-size:19px;font-weight:700;color:#1B1B3C;">${esc(parts[0].subject)}</h1>
          </td></tr>
          <tr><td style="padding:8px 28px 24px 28px;font-size:14px;line-height:1.6;">${body}</td></tr>
          <tr><td style="padding:16px 28px;background:#F3F8FC;border-top:1px solid #D3E3EF;font-size:11px;color:#6E6E8A;">
            Stayloop · ${esc(site.replace(/^https?:\/\//, ''))}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Server part (service role)
// ---------------------------------------------------------------------------

export const FOLLOWUP_ACTION = 'landlord_followup_emailed'
/** Auth lookups are one call per landlord; keep a sweep bounded. */
const MAX_CANDIDATES_PER_SWEEP = 100

export type FollowUpSweepResult = {
  sent: number
  skipped: number
  /** Per-reason counts, for the cron response / logs. */
  reasons: Partial<Record<FollowUpSkipReason | 'send_failed', number>>
}

/**
 * Cron body: find landlords whose first scored screening is ≥ 3 / 14 days old
 * with no lease or managed tenancy, send the stage that is due, record it.
 * Called from /api/agent/proactive cron mode (service role).
 */
export async function runLandlordFollowUps(admin: SupabaseClient, now = new Date()): Promise<FollowUpSweepResult> {
  const result: FollowUpSweepResult = { sent: 0, skipped: 0, reasons: {} }
  const bump = (k: keyof FollowUpSweepResult['reasons']) => { result.reasons[k] = (result.reasons[k] ?? 0) + 1; result.skipped++ }

  // 1. Every landlord row — screenings.landlord_id may hold landlords.id (legacy)
  //    OR the auth id (dual-ID invariant), so build both directions.
  const { data: llRows, error: llErr } = await admin.from('landlords').select('id, auth_id')
  if (llErr) throw new Error(`followups: landlords read failed: ${llErr.message}`)
  const toAuthId = new Map<string, string>()
  const idsOf = new Map<string, string[]>() // auth id → [landlords.id, auth id]
  for (const r of (llRows ?? []) as { id: string; auth_id: string | null }[]) {
    if (!r.auth_id) continue
    toAuthId.set(r.id, r.auth_id)
    toAuthId.set(r.auth_id, r.auth_id)
    idsOf.set(r.auth_id, Array.from(new Set([...(idsOf.get(r.auth_id) ?? []), r.id, r.auth_id])))
  }

  // 2. First scored screening per landlord (oldest first; cheap enough at the
  //    current scale — a few hundred rows).
  const { data: scr, error: scrErr } = await admin
    .from('screenings')
    .select('id, landlord_id, created_at, scored_at')
    .eq('status', 'scored')
    .order('created_at', { ascending: true })
    .limit(5000)
  if (scrErr) throw new Error(`followups: screenings read failed: ${scrErr.message}`)
  const first = new Map<string, { id: string; at: string }>()
  for (const s of (scr ?? []) as { id: string; landlord_id: string; created_at: string | null; scored_at: string | null }[]) {
    // No landlords row → not a landlord (an agent screening under delegation,
    // or a deleted account): nothing to call back.
    const auth = toAuthId.get(s.landlord_id)
    if (!auth) continue
    const at = s.scored_at ?? s.created_at
    if (!at) continue
    const cur = first.get(auth)
    if (!cur || new Date(at).getTime() < new Date(cur.at).getTime()) first.set(auth, { id: s.id, at })
  }
  if (first.size === 0) return result

  // 3. Already-sent stages — only landlords that still have an unsent stage go on.
  const authIds = Array.from(first.keys())
  const { data: sentRows, error: sentErr } = await admin.from('landlord_followups').select('landlord_auth_id, stage').in('landlord_auth_id', authIds)
  if (sentErr) throw new Error(`followups: landlord_followups read failed: ${sentErr.message}`)
  const sentBy = new Map<string, FollowUpStage[]>()
  for (const r of (sentRows ?? []) as { landlord_auth_id: string; stage: FollowUpStage }[]) {
    sentBy.set(r.landlord_auth_id, [...(sentBy.get(r.landlord_auth_id) ?? []), r.stage])
  }

  // 4. Cheap pre-filter on the clock before any auth / lease lookups.
  const pre = authIds.filter((a) => {
    const c: FollowUpCandidate = { authId: a, email: 'x', isTest: false, firstScreenedAt: first.get(a)!.at, firstScreeningId: null, hasLease: false, hasHousehold: false, sent: sentBy.get(a) ?? [] }
    const why = skipReason(c, now)
    if (why) { bump(why); return false }
    return true
  }).slice(0, MAX_CANDIDATES_PER_SWEEP)
  if (pre.length === 0) return result

  // 5. Leases / managed tenancies for the remaining landlords, in two queries.
  const allIds = pre.flatMap((a) => idsOf.get(a) ?? [a])
  const [leaseQ, hhQ, memQ] = await Promise.all([
    admin.from('lease_documents').select('landlord_id').in('landlord_id', allIds).limit(2000),
    admin.from('households').select('created_by').in('created_by', pre).limit(2000),
    admin.from('household_members').select('user_id').eq('role', 'landlord').in('user_id', pre).limit(2000),
  ])
  for (const q of [leaseQ, hhQ, memQ]) if (q.error) throw new Error(`followups: lease/household read failed: ${q.error.message}`)
  const withLease = new Set<string>()
  for (const r of (leaseQ.data ?? []) as { landlord_id: string | null }[]) { const a = r.landlord_id ? toAuthId.get(r.landlord_id) : null; if (a) withLease.add(a) }
  const withHousehold = new Set<string>()
  for (const r of (hhQ.data ?? []) as { created_by: string }[]) withHousehold.add(r.created_by)
  for (const r of (memQ.data ?? []) as { user_id: string }[]) withHousehold.add(r.user_id)

  // 6. Auth user per remaining landlord (e-mail + test flags).
  const candidates: FollowUpCandidate[] = []
  for (const a of pre) {
    const f = first.get(a)!
    let email: string | null = null
    let isTest = true
    try {
      const { data } = await admin.auth.admin.getUserById(a)
      const u = data?.user
      if (u) { email = u.email ?? null; isTest = isTestAccountUser({ email: u.email, user_metadata: u.user_metadata as Record<string, unknown> }) }
    } catch { /* unresolvable user → treated as test (never e-mailed) */ }
    candidates.push({ authId: a, email, isTest, firstScreenedAt: f.at, firstScreeningId: f.id, hasLease: withLease.has(a), hasHousehold: withHousehold.has(a), sent: sentBy.get(a) ?? [] })
  }
  for (const c of candidates) { const why = skipReason(c, now); if (why) bump(why) }

  // 7. Send, then record — only a delivered message writes the stamp.
  const plans = planFollowUps(candidates, now)
  for (const p of plans) {
    const mail = renderFollowUpEmail(p.stage, 'both')
    const res = await sendEmail({ to: p.email, subject: mail.subject, html: mail.html, text: mail.text })
    if (!res.ok) { console.warn('[followups] send failed', p.stage, res.error); bump('send_failed'); continue }
    const { error: insErr } = await admin.from('landlord_followups').insert({ landlord_auth_id: p.authId, screening_id: p.screeningId, stage: p.stage, sent_at: now.toISOString() })
    if (insErr) {
      // 23505 = a parallel sweep beat us to it; the e-mail went out either way, count it once here.
      if (insErr.code !== '23505') console.warn('[followups] stamp failed', p.stage, insErr.message)
    }
    await writeAuditEvent(admin, {
      actorId: p.authId,
      actorType: 'system',
      action: FOLLOWUP_ACTION,
      targetType: 'screening',
      targetId: p.screeningId,
      actingRole: 'landlord',
      metadata: { stage: p.stage, screening_id: p.screeningId, days_since_first_screening: p.daysSinceFirstScreening, email_id: res.id ?? null },
    })
    result.sent++
  }
  return result
}
