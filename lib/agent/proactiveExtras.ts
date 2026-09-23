// Two more proactive cards (proposal 2026-09-23 §3.3 / §3.4), planned as
// pure functions so the cron route stays a loader:
//   • invite reminder — a household invitation the tenant has not accepted
//     after INVITE_REMINDER_AFTER_DAYS → a `send_message` card to the tenant
//     (approval sends the email); one per invite, ever.
//   • re-list prompt — a signed lease whose end date passed within
//     RELIST_LOOKBACK_DAYS and no newer lease on the same unit → a
//     `relist_prompt` card (approval = acknowledged, nothing is sent); one
//     per lease, ever.
import { daysBetween, parseDateOnly, todayUtc } from '@/lib/dates'

export const INVITE_REMINDER_AFTER_DAYS = 3
export const RELIST_LOOKBACK_DAYS = 30

export type InviteRow = {
  id: string
  household_id: string
  invited_email: string
  invited_role: string
  invited_by: string | null
  created_at: string
  expires_at: string | null
  accepted_at: string | null
  declined_at: string | null
  revoked_at: string | null
  address?: string | null
  unit?: string | null
}

export type EndedLeaseRow = {
  id: string
  tenant_name: string | null
  unit_label: string | null
  end_date: string | null
  status: string | null
}

export type ExtraProposal = {
  user_id: string
  role: 'landlord'
  action_type: 'send_message' | 'relist_prompt'
  title: string
  summary: string
  recipient_label: string | null
  data_scope: string[]
  excluded_data: string[]
  risk_level: 'low'
  status: 'pending'
  requires_approval: true
  metadata: Record<string, unknown>
}

export function inviteNeedsReminder(inv: InviteRow, today: Date): boolean {
  if (inv.accepted_at || inv.declined_at || inv.revoked_at) return false
  if (inv.invited_role !== 'tenant') return false
  if (!inv.invited_by) return false
  if (inv.expires_at && new Date(inv.expires_at).getTime() <= today.getTime()) return false
  const age = (today.getTime() - new Date(inv.created_at).getTime()) / 86_400_000
  return age >= INVITE_REMINDER_AFTER_DAYS
}

export function buildInviteReminderProposal(userId: string, inv: InviteRow, today: Date): ExtraProposal {
  const unit = [inv.address, inv.unit ? `#${inv.unit}` : null].filter(Boolean).join(' ') || '你的租约'
  const ageDays = Math.floor((today.getTime() - new Date(inv.created_at).getTime()) / 86_400_000)
  const body =
    `您好，\n\n${unit} 的在管租约已在 Stayloop 建立，${ageDays} 天前向您发出了确认邀请，目前还没有接受。` +
    `接受后您可以看到同一份租约、租金记录与报修进度；不接受也不影响您的租约权利。` +
    `邀请链接在之前的邮件里（主题含「在管租约邀请」）。\n\n谢谢！\n\n` +
    `Hi,\n\nThe managed tenancy for ${unit} was set up on Stayloop and an invitation was sent to you ${ageDays} days ago; it has not been accepted yet. ` +
    `Accepting lets you see the same lease, the rent ledger and repair progress; declining does not affect your rights under the lease. ` +
    `The link is in the earlier email (subject contains "tenancy invitation").\n\nThank you!`
  return {
    user_id: userId,
    role: 'landlord',
    action_type: 'send_message',
    title: `在管租约 · 提醒租客确认邀请：${unit}`,
    summary: `${inv.invited_email} 收到在管租约邀请已 ${ageDays} 天，还没有接受。批准后我会发一封双语提醒邮件；这封信只提醒，不催租、不涉及租约条款。`,
    recipient_label: inv.invited_email,
    data_scope: ['邀请发出日期', '房源地址'],
    excluded_data: ['筛查报告', '租金记录'],
    risk_level: 'low',
    status: 'pending',
    requires_approval: true,
    metadata: {
      invite_id: inv.id,
      household_id: inv.household_id,
      stage: 'invite_reminder',
      to_email: inv.invited_email,
      subject: `请确认在管租约邀请 · ${unit} / Please confirm the tenancy invitation`,
      body,
      source: 'proactive_sweep',
    },
  }
}

export function leaseNeedsRelist(l: EndedLeaseRow, today: Date, newerLeaseOnUnit: boolean): boolean {
  if (!l.end_date || newerLeaseOnUnit) return false
  if (!['signed_both', 'active', 'ended', 'imported'].includes(l.status ?? '')) return false
  const end = parseDateOnly(l.end_date)
  if (!end) return false
  const d = daysBetween(end, todayUtc(today)) // days since the end
  return d >= 0 && d <= RELIST_LOOKBACK_DAYS
}

export function buildRelistProposal(userId: string, l: EndedLeaseRow, today: Date): ExtraProposal {
  const unit = l.unit_label || '该单元'
  const tenant = l.tenant_name || '租客'
  const since = l.end_date ? daysBetween(parseDateOnly(l.end_date) ?? todayUtc(today), todayUtc(today)) : 0
  return {
    user_id: userId,
    role: 'landlord',
    action_type: 'relist_prompt',
    title: `退租 → 重新挂牌：${unit} · 租约 ${l.end_date} 已到期`,
    summary:
      `${tenant} 在 ${unit} 的租约 ${l.end_date} 到期（已过 ${since} 天），没有新的租约。` +
      `如果租客已搬离，可以从上一次的房源信息一键重新挂牌；如果租客继续住，按 RTA s.38 已自动转为月租，不需要做任何事。` +
      `点「批准」表示你已知悉；这张卡不会发出任何邮件。`,
    recipient_label: null,
    data_scope: ['租约到期日'],
    excluded_data: ['筛查报告', '租金记录'],
    risk_level: 'low',
    status: 'pending',
    requires_approval: true,
    metadata: { lease_id: l.id, stage: 'relist', unit_label: l.unit_label, end_date: l.end_date, source: 'proactive_sweep' },
  }
}
