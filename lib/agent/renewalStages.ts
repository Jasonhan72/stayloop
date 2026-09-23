// Renewal touchpoints — 90 / 60 / 30 days before a lease ends (2026-09-22,
// EliseAI benchmark item F). Pure planner shared by both entry modes of
// /api/agent/proactive (user JWT + cron). Given the landlord's leases in the
// renewal window and every renewal-related action already proposed, it
// returns the pending actions that are still missing:
//
//   90d  (≤120 days)  send_renewal_letter — A/B rent options + TRREB market
//                     line; on approval the letter is really sent.
//   60d  (≤60 days)   renewal_checkpoint stage=60d — only when the letter was
//                     never approved: the N1 service deadline is close, the
//                     landlord acknowledges the card (executor just stamps it).
//   30d  (≤30 days)   send_message to the tenant asking for their intent —
//                     only when the letter WAS sent (otherwise a 30d
//                     checkpoint says "call the tenant yourself").
//
// Idempotency is by (lease_id, stage): each stage is proposed at most once
// per lease, ever — decided or not, we never re-nag.
import { daysBetween, isoDate, parseDateOnly, todayUtc } from '@/lib/dates'
import { guidelineFor } from '@/lib/ontario/rules'

// The guideline is per calendar year of the increase's effective date (RTA
// s.120; 2026 = 2.1%, 2027 = 1.9%) — see lib/ontario/rules.ts RENT_GUIDELINE.
// A renewal increase takes effect when the current term ends.
export const WINDOW_DAYS = 120
export const NOTICE_DAYS = 90

export type RenewalStage = '90d' | '60d' | '30d'

export type RenewalLease = {
  id: string
  tenant_name: string | null
  tenant_email: string | null
  unit_label: string | null
  monthly_rent: number | string | null
  end_date: string
}

export type ExistingRenewalAction = {
  action_type: string
  status: string
  metadata: { lease_id?: string; stage?: string; source?: string } | null
}

export type MarketLine = { period: string; avg_by_bed: Record<number, number> }

export type RenewalProposal = {
  user_id: string
  role: 'landlord'
  action_type: 'send_renewal_letter' | 'renewal_checkpoint' | 'send_message'
  title: string
  summary: string
  recipient_label: string | null
  data_scope: string[]
  excluded_data: string[]
  risk_level: 'low' | 'medium' | 'high'
  status: 'pending'
  requires_approval: true
  metadata: Record<string, unknown>
}

export function stageForDays(daysToEnd: number): RenewalStage | null {
  if (daysToEnd < 0) return null
  if (daysToEnd <= 30) return '30d'
  if (daysToEnd <= 60) return '60d'
  if (daysToEnd <= WINDOW_DAYS) return '90d'
  return null
}

export function marketLineText(m: MarketLine | null | undefined): string {
  if (!m) return ''
  const parts = [1, 2, 3]
    .filter((b) => Number.isFinite(m.avg_by_bed[b]))
    .map((b) => `${b === 3 ? '3+' : b} 房 $${Math.round(m.avg_by_bed[b]).toLocaleString()}`)
  if (!parts.length) return ''
  return `TRREB ${m.period} 均租：${parts.join(' · ')}。`
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString()
}

export function buildRenewalProposal(userId: string, l: RenewalLease, today: Date, market?: MarketLine | null): RenewalProposal {
  const rent = Number(l.monthly_rent) || 0
  const g = guidelineFor(l.end_date)
  const raised = Math.round(rent * (1 + g.pct / 100) * 100) / 100
  const end = parseDateOnly(l.end_date) ?? todayUtc(today)
  const noticeDeadline = new Date(end.getTime() - NOTICE_DAYS * 86_400_000)
  const daysToEnd = daysBetween(todayUtc(today), end)
  const tenant = l.tenant_name || '租客'
  const mkt = marketLineText(market)
  return {
    user_id: userId,
    role: 'landlord',
    action_type: 'send_renewal_letter',
    title: `续约窗口 · 90 天触点：${tenant} · ${l.end_date} 到期（还有 ${daysToEnd} 天）`,
    summary:
      `${l.unit_label || '你的单元'} 月租 $${fmt(rent)}。` +
      `方案 A 不涨续约；方案 B 按 ${g.year} 年指导上限 +${g.pct}% → $${fmt(raised)}` +
      (g.published ? '' : `（${g.year} 年指导比例尚未公布，暂按最新已公布值）`) +
      `（2018-11-15 后首次入住的单位不受上限约束）。` +
      (mkt ? `${mkt}` : '') +
      `N1/N2 需提前 ${NOTICE_DAYS} 天送达 — 最晚 ${isoDate(noticeDeadline)}。批准后我会把续约函真实发送给 ${l.tenant_email || tenant}。`,
    recipient_label: l.tenant_email || tenant,
    data_scope: ['租约条款摘要', '续约方案', '同区行情'],
    excluded_data: ['筛查报告', '收入证明原件'],
    risk_level: 'medium',
    status: 'pending',
    requires_approval: true,
    metadata: {
      lease_id: l.id,
      stage: '90d',
      tenant_name: l.tenant_name,
      tenant_email: l.tenant_email,
      unit_label: l.unit_label,
      current_rent: rent,
      guideline_rent: raised,
      guideline_pct: g.pct,
      guideline_year: g.year,
      end_date: l.end_date,
      notice_deadline: isoDate(noticeDeadline),
      market: market ? { period: market.period, avg_by_bed: market.avg_by_bed } : null,
      source: 'proactive_sweep',
    },
  }
}

export function buildCheckpointProposal(userId: string, l: RenewalLease, today: Date, stage: '60d' | '30d'): RenewalProposal {
  const end = parseDateOnly(l.end_date) ?? todayUtc(today)
  const noticeDeadline = new Date(end.getTime() - NOTICE_DAYS * 86_400_000)
  const daysToEnd = daysBetween(todayUtc(today), end)
  const daysToNotice = daysBetween(todayUtc(today), noticeDeadline)
  const tenant = l.tenant_name || '租客'
  const unit = l.unit_label || '你的单元'
  const summary =
    stage === '60d'
      ? `${unit} 的租约 ${l.end_date} 到期，续约函还没有发出。` +
        (daysToNotice >= 0
          ? `涨租的 N1 通知最晚 ${isoDate(noticeDeadline)} 送达（还有 ${daysToNotice} 天）。`
          : `涨租的 N1 通知 90 天期限（${isoDate(noticeDeadline)}）已过，本期只能按原租金续约或转为月租。`) +
        `到期不续签会自动转为月租（RTA s.38）。点「批准」表示你已知悉；上方 90 天那张卡仍可批准发送续约函。`
      : `${unit} 的租约 ${l.end_date} 到期（还有 ${daysToEnd} 天），续约函没有发出、也没有收到 ${tenant} 的意向。` +
        `建议直接致电或短信确认去留，好安排空置期。点「批准」表示你已知悉。`
  return {
    user_id: userId,
    role: 'landlord',
    action_type: 'renewal_checkpoint',
    title: stage === '60d'
      ? `续约窗口 · 60 天触点：${tenant} · N1 截止 ${isoDate(noticeDeadline)}`
      : `续约窗口 · 30 天触点：${tenant} · 请直接联系确认去留`,
    summary,
    recipient_label: null,
    data_scope: ['租约到期日'],
    excluded_data: ['筛查报告', '收入证明原件'],
    risk_level: 'low',
    status: 'pending',
    requires_approval: true,
    metadata: {
      lease_id: l.id,
      stage,
      tenant_name: l.tenant_name,
      tenant_email: l.tenant_email,
      unit_label: l.unit_label,
      end_date: l.end_date,
      notice_deadline: isoDate(noticeDeadline),
      source: 'proactive_sweep',
    },
  }
}

export function buildIntentAskProposal(userId: string, l: RenewalLease, today: Date): RenewalProposal {
  const end = parseDateOnly(l.end_date) ?? todayUtc(today)
  const daysToEnd = daysBetween(todayUtc(today), end)
  const tenant = l.tenant_name || '租客'
  const unit = l.unit_label || '你的单元'
  const body =
    `${tenant} 您好，\n\n${unit} 的租约将于 ${l.end_date} 到期（还有 ${daysToEnd} 天）。此前已把续约方案发给您，` +
    `为了安排接下来的事项，想请您在方便时回复一下：是否续约、或计划搬离的日期。\n\n` +
    `按安省《住宅租赁法》，租约到期不续签会自动转为月租，您的权利不受影响；搬离需提前 60 天以 N9 表格书面通知。\n\n谢谢！\n\n` +
    `Hi ${tenant},\n\nThe lease for ${unit} ends on ${l.end_date} (${daysToEnd} days from now). We sent the renewal options earlier — ` +
    `when convenient, could you let us know whether you plan to renew or your intended move-out date?\n\n` +
    `Under Ontario's RTA a lease that is not renewed continues month-to-month with your rights unchanged; moving out needs 60 days' written notice (Form N9).\n\nThank you!`
  return {
    user_id: userId,
    role: 'landlord',
    action_type: 'send_message',
    title: `续约窗口 · 30 天触点：向 ${tenant} 确认续约意向`,
    summary:
      `续约函已发出、还没有回音。批准后我会给 ${l.tenant_email} 发一封双语邮件，请 ${tenant} 回复是否续约或搬离日期。`,
    recipient_label: l.tenant_email,
    data_scope: ['租约到期日', '续约意向询问'],
    excluded_data: ['筛查报告', '续约方案金额'],
    risk_level: 'low',
    status: 'pending',
    requires_approval: true,
    metadata: {
      lease_id: l.id,
      stage: '30d',
      to_email: l.tenant_email,
      subject: `续约意向确认 · ${unit} · ${l.end_date} 到期 / Renewal intent · ${unit}`,
      body,
      tenant_name: l.tenant_name,
      tenant_email: l.tenant_email,
      unit_label: l.unit_label,
      end_date: l.end_date,
      source: 'proactive_sweep',
    },
  }
}

/**
 * The planner. `existing` must contain every renewal-related action already
 * proposed for the leases in question (any status). Returns the proposals to
 * insert, in lease order, at most one per lease per stage.
 */
export function planRenewalActions(
  userId: string,
  leases: RenewalLease[],
  existing: ExistingRenewalAction[],
  today: Date,
  market?: MarketLine | null,
): RenewalProposal[] {
  const seen = new Set<string>()
  const letterSent = new Set<string>()
  for (const a of existing) {
    const lid = a.metadata?.lease_id
    if (!lid) continue
    // Legacy rows (before stages) have no `stage`; a renewal letter without a
    // stage is the 90d touchpoint.
    const stage = a.metadata?.stage ?? (a.action_type === 'send_renewal_letter' ? '90d' : null)
    if (stage) seen.add(`${lid}:${stage}`)
    if (a.action_type === 'send_renewal_letter' && a.status === 'approved') letterSent.add(lid)
  }
  const out: RenewalProposal[] = []
  for (const l of leases) {
    const end = parseDateOnly(l.end_date)
    if (!end) continue
    const days = daysBetween(todayUtc(today), end)
    const stage = stageForDays(days)
    if (!stage) continue
    // 90d — always the first touchpoint, even when the lease enters the
    // window late (e.g. imported at 50 days): the letter is the action that
    // matters, the checkpoints only make sense on top of it.
    if (!seen.has(`${l.id}:90d`)) {
      out.push(buildRenewalProposal(userId, l, today, market))
      seen.add(`${l.id}:90d`)
      // Nothing else for this lease this run — give the landlord one card.
      continue
    }
    if (stage === '60d' && !seen.has(`${l.id}:60d`) && !letterSent.has(l.id)) {
      out.push(buildCheckpointProposal(userId, l, today, '60d'))
      seen.add(`${l.id}:60d`)
    }
    if (stage === '30d' && !seen.has(`${l.id}:30d`)) {
      out.push(letterSent.has(l.id) && l.tenant_email
        ? buildIntentAskProposal(userId, l, today)
        : buildCheckpointProposal(userId, l, today, '30d'))
      seen.add(`${l.id}:30d`)
    }
  }
  return out
}

/** Latest TRREB quarter → market line, from trreb_rent_stats rows. */
export function marketFromRows(rows: { period: string; bed_type: number; avg_rent: number | string }[] | null | undefined): MarketLine | null {
  if (!rows || !rows.length) return null
  // Periods sort lexically ('2026 Q1' < '2026 Q2'); pick the latest.
  const latest = rows.map((r) => r.period).sort().at(-1)!
  const avg_by_bed: Record<number, number> = {}
  for (const r of rows) if (r.period === latest) avg_by_bed[r.bed_type] = Number(r.avg_rent)
  return { period: latest, avg_by_bed }
}
