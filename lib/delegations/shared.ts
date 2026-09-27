// Delegations · pure helpers (节点 5 「租赁事务主记录与经纪委托」, 2026-09-27).
// A delegation is the client's written say-so that a RECO-registered agent
// may act for them on Stayloop: who (principal → delegate), for what (scope),
// which actions, until when, on which basis version. Proposed by the agent
// from the client table, confirmed by the principal through an emailed link
// while signed in with that email, revoked by either side at once.

export const DELEGATION_SCOPES = ['listing', 'search', 'matter'] as const
export type DelegationScope = (typeof DELEGATION_SCOPES)[number]
export const SCOPE_LABEL: Record<DelegationScope, { zh: string; en: string; hint: { zh: string; en: string } }> = {
  listing: { zh: '出租（房东客户）', en: 'Leasing (landlord client)', hint: { zh: '替房东处理房源、申请人与筛查', en: 'Handle the landlord’s listings, applicants and screenings' } },
  search: { zh: '找房（租客客户）', en: 'Home search (tenant client)', hint: { zh: '替租客找房、约看、递申请', en: 'Search, book showings and apply for the tenant' } },
  matter: { zh: '事务跟进', en: 'Matter follow-up', hint: { zh: '进入客户的租赁事务与对话', en: 'Enter the client’s rental matters and threads' } },
}
export const DELEGATION_ACTIONS = ['screen', 'message', 'view_documents', 'draft_lease'] as const
export type DelegationAction = (typeof DELEGATION_ACTIONS)[number]
export const ACTION_LABEL: Record<DelegationAction, { zh: string; en: string }> = {
  screen: { zh: '代客发起筛查', en: 'Run screenings for the client' },
  message: { zh: '在对话里代为发言', en: 'Post in threads for the client' },
  view_documents: { zh: '查看申请材料', en: 'View application documents' },
  draft_lease: { zh: '起草租约', en: 'Draft leases' },
}
export const BASIS_VERSION = 'TRESA-2024-representation-v1'
export const MAX_MONTHS = 12
export const DELEGATION_STATUSES = ['pending', 'active', 'revoked', 'expired'] as const
export type DelegationStatus = (typeof DELEGATION_STATUSES)[number]
export const STATUS_LABEL: Record<DelegationStatus, { zh: string; en: string; tone: 'warn' | 'ok' | 'neutral' | 'danger' }> = {
  pending: { zh: '待客户确认', en: 'Awaiting the client', tone: 'warn' },
  active: { zh: '有效', en: 'Active', tone: 'ok' },
  revoked: { zh: '已撤销', en: 'Revoked', tone: 'danger' },
  expired: { zh: '已到期', en: 'Expired', tone: 'neutral' },
}

export type DelegationRow = {
  id: string
  principal_auth_id: string | null
  principal_email: string
  principal_name: string | null
  delegate_auth_id: string
  client_id: string | null
  scope: DelegationScope[]
  allowed_actions: DelegationAction[]
  starts_at: string
  expires_at: string
  basis_version: string
  status: DelegationStatus
  confirmed_at: string | null
  revoked_at: string | null
  created_at: string
}

export type ProposalInput = { client_id: string; scope: unknown; allowed_actions: unknown; months: unknown }
export function validateProposal(p: ProposalInput): { ok: true; value: { client_id: string; scope: DelegationScope[]; allowed_actions: DelegationAction[]; months: number } } | { ok: false; reason: string } {
  if (!/^[0-9a-f-]{36}$/i.test(String(p.client_id || ''))) return { ok: false, reason: 'client_id' }
  const scope = Array.isArray(p.scope) ? (p.scope.filter((s) => (DELEGATION_SCOPES as readonly string[]).includes(String(s))) as DelegationScope[]) : []
  if (!scope.length) return { ok: false, reason: 'scope' }
  const actions = Array.isArray(p.allowed_actions) ? (p.allowed_actions.filter((a) => (DELEGATION_ACTIONS as readonly string[]).includes(String(a))) as DelegationAction[]) : []
  if (!actions.length) return { ok: false, reason: 'allowed_actions' }
  const months = Number(p.months)
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) return { ok: false, reason: 'months' }
  return { ok: true, value: { client_id: String(p.client_id), scope: Array.from(new Set(scope)), allowed_actions: Array.from(new Set(actions)), months } }
}

/** Live = confirmed, not revoked, not past its end. */
export function isDelegationLive(d: Pick<DelegationRow, 'status' | 'expires_at'>, now = new Date()): boolean {
  return d.status === 'active' && new Date(d.expires_at).getTime() > now.getTime()
}

export function daysLeft(d: Pick<DelegationRow, 'expires_at'>, now = new Date()): number {
  return Math.ceil((new Date(d.expires_at).getTime() - now.getTime()) / 86_400_000)
}

/** "正在代表：某房东 · 出租 · 到期 2027-03-01" — the strip on every agent page. */
export function representingLine(d: Pick<DelegationRow, 'principal_name' | 'principal_email' | 'scope' | 'expires_at'>, zh: boolean): string {
  const who = d.principal_name || d.principal_email
  const scope = d.scope.map((s) => (zh ? SCOPE_LABEL[s].zh : SCOPE_LABEL[s].en)).join(zh ? '、' : ', ')
  const until = d.expires_at.slice(0, 10)
  return zh ? `正在代表：${who} · ${scope} · 到期 ${until}` : `Representing: ${who} · ${scope} · until ${until}`
}

/** May this delegation be used for the action right now? */
export function allows(d: Pick<DelegationRow, 'status' | 'expires_at' | 'allowed_actions'> | null | undefined, action: DelegationAction, now = new Date()): boolean {
  return !!d && isDelegationLive(d, now) && d.allowed_actions.includes(action)
}
