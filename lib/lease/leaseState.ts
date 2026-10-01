// What can be done with a lease_documents row, decided in one place (sweep
// 2026-10-01). The detail page offered "send for signing" and "you can sign
// first" on imported and quick-entered leases, which have no terms document:
// sending always failed with a raw English 422 and signing stamped a landlord
// signature on nothing, after which the guard froze the row for good.

export type LeaseLike = {
  status: string | null
  terms?: unknown
  sent_at?: string | null
  signed_at?: string | null
  landlord_signature?: unknown
  tenant_signature?: unknown
}

/** A real terms document: both form schemas carry the landlord's legal name and a rent amount. */
export function leaseHasTerms(terms: unknown): boolean {
  const t = terms as { landlord_legal_name?: string; rent?: { amount?: number } } | null | undefined
  return !!t && !!t.landlord_legal_name && !!t.rent?.amount
}

const SIGNABLE = ['draft', 'sent', 'signed_tenant']
const SENDABLE = ['draft', 'sent']

export function leaseIsSignable(l: LeaseLike): boolean {
  return SIGNABLE.includes(String(l.status)) && leaseHasTerms(l.terms)
}

export function leaseIsSendable(l: LeaseLike): boolean {
  return SENDABLE.includes(String(l.status)) && leaseHasTerms(l.terms) && !l.tenant_signature
}

/** A draft nobody has seen yet: its terms may still change (the guard freezes them once sent). */
export function leaseIsEditableDraft(l: LeaseLike): boolean {
  return l.status === 'draft' && !l.sent_at && !l.signed_at && !l.landlord_signature && !l.tenant_signature
}

/** Unsigned and still in the signing flow: the landlord may delete (withdraw) it. Imported / quick-entered records are not. */
export function leaseIsWithdrawable(l: LeaseLike): boolean {
  return SENDABLE.includes(String(l.status)) && !l.signed_at && !l.landlord_signature && !l.tenant_signature
}

/** A record of an existing tenancy (imported file or quick entry), not a document signed here. */
export function leaseIsRecordOnly(l: LeaseLike): boolean {
  return l.status === 'imported' || ((l.status === 'active' || l.status === 'ended') && !leaseHasTerms(l.terms))
}

/** Route errors the landlord can act on, in words (the page used to print the route's English string). */
export function leaseActionErrorText(error: string | null | undefined, zh: boolean): string {
  const e = String(error || '')
  if (/terms incomplete|lease_no_terms/.test(e)) {
    return zh ? '这份租约没有完整的条款文档（导入或快速录入的记录），不能在线发送或签署。请用「起草这份租约的标准租约」生成一份可签署的租约。' : 'This lease has no full terms document (an imported or quick-entered record), so it cannot be sent or signed online. Use “Draft a standard lease for this tenancy” to make a signable one.'
  }
  if (/lease_not_sendable|lease_not_signable/.test(e)) {
    return zh ? '这份租约已不在待发送 / 待签署的状态（可能已经签署或已结束），页面已刷新，请看最新状态。' : 'This lease is no longer waiting to be sent or signed (it may have been signed or ended). The page has been refreshed to show its current state.'
  }
  if (/no tenant email/.test(e)) return zh ? '这份租约没有租客邮箱，无法发送签署邀请。' : 'This lease has no tenant email, so the signing invitation cannot be sent.'
  if (/already signed/.test(e)) return zh ? '租客已经签过字了。' : 'The tenant has already signed.'
  if (/hourly send limit/.test(e)) return zh ? '这一小时内发送次数已达上限，请稍后再试。' : 'Hourly send limit reached — try again later.'
  if (/has ended|lease_ended/.test(e)) return zh ? '这份租约已结束。' : 'This lease has ended.'
  if (/email failed|send failed/.test(e)) return zh ? '签署邀请邮件没有发出去，租客没有收到。请稍后再试。' : 'The signing invitation email did not go out; the tenant has not received it. Try again later.'
  if (/only the landlord|not the landlord/.test(e)) return zh ? '只有这份租约的房东可以这样做。' : 'Only the landlord on this lease can do that.'
  return e || (zh ? '操作失败' : 'Something went wrong')
}

/** Errors that mean the page showed an out-of-date lease: reload it. */
export function leaseErrorNeedsReload(error: string | null | undefined): boolean {
  return /lease_not_sendable|lease_not_signable|already signed|has ended|lease_ended/.test(String(error || ''))
}
