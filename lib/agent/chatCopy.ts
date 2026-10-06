// Wording the conversation itself uses — the greeting that opens a new thread
// and the "✅ 已执行" line posted once an approved card has been carried out.
// Pure so the homepage film (components/home/ThreeRoleFilm.tsx) plays the
// product's own lines instead of a copy that drifts (user 2026-09-28: the hero
// animation must follow the current page design).
import type { Lang } from '@/lib/i18n'
import type { AgentRole } from './types'
import type { DecideOutcome } from './approval-engine'

export function greeting(role: AgentRole, name: string, lang: Lang): string {
  if (lang === 'en') {
    if (role === 'tenant')
      return `Hi, I'm ${name}. Tell me what kind of home you're after — area, budget, layout, hard requirements. Just say it, and I'll remember it all for you.`
    if (role === 'landlord')
      return `Hi, I'm ${name}. Leave applications, due diligence, compliance and renewals to me — you only nod at the 1–2 moments that matter.`
    return `Hi, I'm ${name}. Showings, prep packs, on-site feedback, settlement — I take the busywork so you can focus on people and judgment.`
  }
  if (role === 'tenant')
    return `你好,我是 ${name}。告诉我你想找什么样的家 —— 区域、预算、户型、硬条件,直接说就好,我都帮你记住。`
  if (role === 'landlord')
    return `你好,我是 ${name}。把申请、尽调、合规、续约交给我;关键的 1–2 个时刻,你点头就好。`
  return `你好,我是 ${name}。带看、准备包、现场反馈、结算 —— 行政杂活我来,你专心做人和判断。`
}

/** A monthly rent as people write it: "2,800", "2,853.20" — cents only when there
 *  are any (a guideline increase on $2,800 printed "$2,853.2" on the card, the
 *  executed line and the renewal letter). */
export function rentAmount(n: number): string {
  return n.toLocaleString('en-CA', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
}

/** The line posted after an approved card ran: names the artifact by type — "续约函" only for
 *  renewals; the newer executors (rent_reminder / send_message) send other emails. */
export function executedText(i: { title: string | null | undefined; actionType: string | null | undefined; sentTo: string; rent?: number | null; zh: boolean; viaThread?: boolean }): string {
  const { title, actionType, rent, zh } = i
  // A message the tenant's AI Agent posted into the tenancy conversation is not an email to one person (找得到人 2026-09-30).
  if (i.viaThread) {
    return zh
      ? `✅ 已执行：「${title ?? '你批准的操作'}」— 消息已发到在管租约对话（对话里的每个人都能看到），对方会收到提醒。执行记录已写入审计日志。`
      : `✅ Done: "${title ?? 'the action you approved'}" — the message is in the tenancy conversation (everyone in it can see it) and they were notified. The execution was written to the audit log.`
  }
  // Role words the server uses instead of a personal address (relay), in the reader's language.
  const ROLE_EN: Record<string, string> = { 房东: 'your landlord', 租客: 'the tenant', 申请人: 'the applicant', 咨询的租客: 'the enquirer' }
  const sentTo = zh ? i.sentTo : (ROLE_EN[i.sentTo] ?? i.sentTo)
  const artifact = zh
    ? (actionType === 'send_renewal_letter'
        ? '续约函'
        : actionType === 'rent_reminder'
          ? '租金提醒'
          : actionType === 'maintenance_request'
            ? '报修工单'
            : '邮件')
    : (actionType === 'send_renewal_letter'
        ? 'renewal letter'
        : actionType === 'rent_reminder'
          ? 'rent reminder'
          : actionType === 'maintenance_request'
            ? 'maintenance request'
            : 'email')
  return zh
    ? `✅ 已执行：「${title ?? '你批准的操作'}」— ${artifact}已真实发送至 ${sentTo}${rent ? `（月租 $${rentAmount(rent)}）` : ''}。执行记录已写入审计日志。`
    : `✅ Done: "${title ?? 'the action you approved'}" — the ${artifact} was actually sent to ${sentTo}${rent ? ` (monthly rent $${rentAmount(rent)})` : ''}. The execution was written to the audit log.`
}

/**
 * Who a tenant's chat card really goes to. The executor ignores the model's free-text
 * recipient: a send_message / maintenance_request without an address always reaches the
 * tenant's CURRENT landlord (their tenancy conversation / ticket hub). A card that said
 * 「1001 Bay St 的房东」 delivered a question about another home to the current landlord
 * (review 2026-10-01), so the card shows this fixed recipient instead. null = not such a card.
 */
export function tenantCardRecipient(role: string | null | undefined, actionType: string | null | undefined, metadata: Record<string, unknown> | null | undefined, zh: boolean): string | null {
  if (role !== 'tenant') return null
  if (actionType === 'maintenance_request') return zh ? '你现在租住处的房东（在管租约报修）' : 'your current landlord (tenancy repair hub)'
  const to = metadata?.to_email
  if (actionType === 'send_message' && !(typeof to === 'string' && to.trim())) {
    return zh ? '你现在租住处的房东（在管租约对话）' : 'your current landlord (tenancy conversation)'
  }
  return null
}

/** A site path a card may link to (relist_prompt metadata.href): same-origin only. Rejects
 *  '//host' and '/\host' (protocol-relative), and any whitespace or backslash — browsers strip
 *  tabs / newlines from URLs, so '/\t/host' would also become '//host'. */
export function cardSitePath(v: unknown): string | null {
  return typeof v === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(v) ? v : null
}

// Approval-only cards: approving them records that the person has seen them; nothing is sent.
const ACKNOWLEDGE_TYPES = new Set(['renewal_checkpoint', 'relist_prompt'])
export function isAcknowledgeOnly(actionType: string | null | undefined): boolean {
  return ACKNOWLEDGE_TYPES.has(String(actionType ?? ''))
}

/** An executor ran and reported no recipient (acknowledgements, work-order decisions). */
export function executedPlainText(i: { title: string | null | undefined; actionType: string | null | undefined; zh: boolean }): string {
  const t = i.title ?? (i.zh ? '你批准的操作' : 'the action you approved')
  if (isAcknowledgeOnly(i.actionType)) {
    return i.zh ? `✅ 已记录：你已知悉「${t}」。这类卡片只做记录，没有发送任何东西。` : `✅ Noted: you acknowledged "${t}". Cards like this only record that — nothing was sent.`
  }
  return i.zh ? `✅ 已执行：「${t}」。执行记录已写入审计日志。` : `✅ Done: "${t}". The execution was written to the audit log.`
}

/** Anonymous preview: a sample card was "approved" — say plainly that nothing ran. */
export function previewApprovalText(zh: boolean): string {
  return zh ? '（预览模式：这张示范卡片不会真的执行。登录后，你批准的卡片才会真正发出。）' : "(Preview mode: this sample card doesn't actually run. Once you sign in, the cards you approve are really carried out.)"
}

/** The executor had already claimed this card (another page or tab ran it): nothing was sent twice. */
export function alreadyRanText(title: string | null | undefined, zh: boolean): string {
  const t = title ?? (zh ? '这张卡片' : 'this card')
  return zh ? `✅ 「${t}」已经在另一个页面或标签页里执行了，没有重复发送。` : `✅ "${t}" was already run from another page or tab — nothing was sent twice.`
}

/** A repair request whose ticket was filed but whose email to the landlord did not go out. */
export function ticketNotEmailedText(title: string | null | undefined, reason: string | null | undefined, zh: boolean): string {
  const t = title ?? (zh ? '报修' : 'the repair')
  const code = String(reason ?? '').trim()
  const why = !code || REASON_TEXT[code] ? executionReasonText(code || 'send failed', zh) : zh ? `邮件服务返回错误（${code.slice(0, 80)}）` : `the email service returned an error (${code.slice(0, 80)})`
  return zh
    ? `⚠️ 「${t}」：报修单已建在在管租约共享中心（房东在那里能看到），但通知邮件没有发出：${why}。`
    : `⚠️ "${t}": the repair ticket is on your shared tenancy hub (your landlord can see it there), but the notification email did not go out: ${why}.`
}

/** A quote approved, but no entry notice reached the tenant (no tenant email, or the send failed). */
export function quoteApprovedNoNoticeText(title: string | null | undefined, zh: boolean): string {
  const t = title ?? (zh ? '报价' : 'the quote')
  return zh
    ? `⚠️ 「${t}」：报价已批准；但进入通知没有发出（在管租约上没有租客邮箱，或邮件发送失败）。进入前请自己书面通知租客（RTA s.27，紧急件见 s.26）。`
    : `⚠️ "${t}": the quote is approved, but the entry notice did not go out (no tenant email on the tenancy, or the email failed). Give the tenant written notice yourself before entry (RTA s.27; emergencies s.26).`
}

/** A repair request that matched a ticket still open on the same tenancy (no second ticket). */
export function existingTicketText(title: string | null | undefined, zh: boolean): string {
  const t = title ?? (zh ? '报修' : 'the repair')
  return zh
    ? `✅ 已执行：「${t}」— 这个问题已经有一张未关闭的报修单，这次的说明并进了那张单，没有另开新单。`
    : `✅ Done: "${t}" — there is already an open repair ticket for this, so these details were added to it instead of opening a second one.`
}

type Bi = { zh: string; en: string }
const NEED_TENANCY: Bi = {
  zh: '你的账号上还没有已确认的在管租约或已签租约，不知道该发给哪位房东——先在「租约」里接受房东的邀请或导入已签租约（/leases/import）',
  en: "this account has no confirmed managed tenancy or signed lease yet, so there is no landlord to send it to — accept your landlord's invitation or import a signed lease (/leases/import) first",
}
const NO_TENANT_EMAIL: Bi = { zh: '档案里没有租客的邮箱', en: 'there is no tenant email on file' }
const NO_LEASE: Bi = { zh: '找不到对应的租约（或它不属于你）', en: 'the lease could not be found (or is not yours)' }
const NO_APP: Bi = { zh: '找不到对应的申请（或它不在你的房源上）', en: 'the application could not be found (or is not on your listing)' }
const NO_INTENT: Bi = { zh: '找不到对应的看房请求或房源', en: 'the showing request or listing could not be found' }
const SEND_ERROR: Bi = { zh: '发送服务暂时出错', en: 'the sending service had a temporary error' }
const SESSION: Bi = { zh: '登录已过期，请刷新页面后再试', en: 'your sign-in expired — refresh the page and try again' }
const NO_CANDIDATE: Bi = { zh: '没有符合资质的服务商可派，请在报修单上手动指派', en: 'no qualified provider is available — assign one on the ticket' }
const NO_TERMS: Bi = { zh: '这份租约没有完整的条款文档（导入或快速录入的记录），不能在线发送签署', en: 'this lease has no full terms document (an imported or quick-entered record), so it cannot be sent for signing online' }
const NO_INVITE: Bi = { zh: '找不到对应的在管租约邀请（或它不是你发出的）', en: 'the tenancy invitation could not be found (or you did not send it)' }
const WO_MOVED_ON: Bi = { zh: '工单已经往下走了（可能已在工单上处理过），这张卡片不再适用', en: 'the work order has moved on (it may have been handled on the work order itself), so this card no longer applies' }
const NOT_LANDLORD: Bi = { zh: '只有这处房屋的房东可以这样做', en: 'only the landlord of this home can do that' }

// Reason codes the execute route returns (C2) → what actually happened, in the reader's language.
const REASON_TEXT: Record<string, Bi> = {
  expired: { zh: '这张卡片已过期', en: 'this card has expired' },
  stale_approval: { zh: '批准已经是很久以前的事，为免发出过时的内容没有执行', en: 'the approval is too old, so nothing outdated was sent' },
  no_executor_for_type: { zh: '这类卡片没有可执行的步骤，批准不会发送或改变任何东西', en: 'this kind of card has nothing that can run — approving it sends or changes nothing' },
  'action is not pending': { zh: '这张卡片已经不在待批准状态（可能在别的页面处理过，或已失效）', en: 'this card is no longer waiting for approval (it was handled on another page, or expired)' },
  interrupted: { zh: '批准后页面在倒计时期间被关闭或刷新，所以还没有执行', en: 'the page was closed or reloaded during the countdown, so it never ran' },
  undo_failed: { zh: '你点了撤销，但撤销没有成功（网络或服务器出错），所以它停在「已批准」，不会自动执行', en: "you pressed Undo but it didn't go through (network or server error), so it is held as approved and won't run on its own" },
  no_landlord_on_file: NEED_TENANCY,
  no_household_on_file: NEED_TENANCY,
  lease_ended: { zh: '这份租约已经结束', en: 'this lease has ended' },
  lease_superseded: { zh: '这份租约已被新的租约取代', en: 'a newer lease replaced this one' },
  province_unsupported: { zh: '这封续约函按安省规则写成，而这份租约不在安省；该省的续约触点会另出卡片', en: "this renewal letter is written to Ontario's rules and the lease is in another province; that province's renewal touchpoint comes as its own card" },
  tenant_leaving: { zh: '租客已经表示要搬走', en: 'the tenant has said they are leaving' },
  tenant_answered: { zh: '租客已经在共享中心回复了续约意向，这封询问没有再发', en: 'the tenant already answered about renewal on the shared hub, so this question was not sent' },
  past_n1_deadline: { zh: '已经过了 N1 涨租通知的送达截止日（涨租须提前 90 天书面通知）', en: 'the N1 deadline has passed (a rent increase needs 90 days of written notice)' },
  decision_changed: { zh: '这位申请人的决定已经改了，这封通知没有发出', en: 'the decision on this application has changed, so this notice was not sent' },
  // One code for every executor that returns it: a decision notice, a lease invitation, a showing / question answer.
  already_notified: { zh: '对方已经收到过这件事的通知（在别的页面或卡片里已经发出），这张没有再发', en: 'the other side was already notified of this from another page or card, so this one was not sent' },
  arrears_changed: { zh: '欠款情况变了（有账期已记录付款），还款计划没有发出', en: 'the arrears changed (a period was recorded as paid), so the payment plan was not sent' },
  invite_closed: { zh: '邀请已被接受或撤回', en: 'the invitation was already accepted or withdrawn' },
  past_due_date: { zh: '这期租金的到期日已经过了', en: "this rent period's due date has passed" },
  period_paid: { zh: '这期租金已记录付款', en: 'this rent period is already recorded as paid' },
  listing_inactive: { zh: '房源已下架', en: 'the listing is no longer active' },
  ticket_closed: { zh: '这张报修单已经关闭', en: 'this repair ticket is already closed' },
  quote_changed: { zh: '报价在你批准之后变了，请先看新的报价', en: 'the quote changed after you approved it — review the new one first' },
  quote_expired: { zh: '报价已过有效期', en: 'the quote has expired' },
  no_candidate: NO_CANDIDATE,
  no_candidate_choose_on_ticket: NO_CANDIDATE,
  pro_required: { zh: '派给已核验服务商网络需要 Pro，可以改派给你自己的联系人', en: 'the verified provider network needs Pro — you can dispatch to your own contact instead' },
  work_order_already_answered: { zh: '服务商已经回应了这张工单', en: 'the provider already responded to this work order' },
  work_order_not_found: { zh: '找不到这张工单', en: 'the work order could not be found' },
  'work order not found': { zh: '找不到这张工单', en: 'the work order could not be found' },
  'ticket not found': { zh: '找不到这张报修单', en: 'the repair ticket could not be found' },
  'this ticket already has an open work order': { zh: '这张报修单已经有一张进行中的工单', en: 'this ticket already has an open work order' },
  'message body is empty': { zh: '消息还没有正文', en: 'the message has no text yet' },
  'hourly send limit reached': { zh: '这一小时的发送次数用完了，一小时后再试', en: "this hour's send limit is used up — try again in an hour" },
  no_tenant_email: NO_TENANT_EMAIL,
  'lease has no tenant email on file': NO_TENANT_EMAIL,
  'tenant has no email': NO_TENANT_EMAIL,
  'applicant has no email': { zh: '申请里没有申请人的邮箱', en: 'the application has no applicant email' },
  'no valid recipient email': { zh: '卡片上没有有效的收件人', en: 'the card has no valid recipient' },
  'recipient is not a counterparty on any of your leases or applications': { zh: '收件人不是你任何租约或申请上的对方', en: 'the recipient is not a party to any of your leases or applications' },
  'lease_id missing': NO_LEASE,
  'lease not found or not yours': NO_LEASE,
  'application_id missing': NO_APP,
  'application not found': NO_APP,
  'application is not on your listing': NO_APP,
  'decision missing': { zh: '卡片上没有写明决定', en: 'the card does not say which decision' },
  'intent_id missing': NO_INTENT,
  'intent not found': NO_INTENT,
  'listing is not yours': NO_INTENT,
  'ticket title missing': { zh: '报修单还没有标题', en: 'the repair ticket has no title yet' },
  'ticket_id missing': { zh: '卡片上没有对应的报修单', en: 'the card is not linked to a repair ticket' },
  'work_order_id missing': { zh: '卡片上没有对应的工单', en: 'the card is not linked to a work order' },
  'reminder has no due date': { zh: '提醒上没有到期日', en: 'the reminder has no due date' },
  invoice_amount: { zh: '账单金额无效', en: 'the invoice amount is invalid' },
  'send failed': SEND_ERROR,
  'thread unavailable': SEND_ERROR,
  'message insert failed': SEND_ERROR,
  'ticket insert failed': SEND_ERROR,
  network: { zh: '执行请求没有送达服务器', en: 'the request never reached the server' },
  // Sweep 2026-10-01: reasons the execute route, the marketplace and the card sweeps now emit.
  already_executed: { zh: '这张卡片已经执行过了（可能在另一个页面或标签页），不会再发送一次', en: 'this card has already run (perhaps from another page or tab) — it will not be sent again' },
  in_flight: { zh: '另一个页面正在执行这张卡片（这里没有重复发送），稍后刷新查看结果', en: 'another page is running this card right now (nothing was sent twice here) — refresh shortly to see how it went' },
  'state changed, retry': { zh: '卡片的状态刚刚变了，请再试一次', en: 'the card changed just now — try again' },
  preview_unavailable: { zh: '暂时生成不了预览', en: 'the preview could not be built right now' },
  withdrawn: { zh: '你撤回了这张卡片，它没有执行', en: 'you withdrew this card, so it did not run' },
  superseded: { zh: '已经有一张更新的卡片取代了它', en: 'a newer card replaced it' },
  dispatched: { zh: '这张报修单已经派出了工单', en: 'a work order was already dispatched for this ticket' },
  ticket_status_changed: { zh: '报修单的状态已经变了（可能已在报修单上处理），这张派单建议不再适用', en: "the repair ticket's status changed (it may have been handled on the ticket), so this dispatch suggestion no longer applies" },
  decided_on_work_order: { zh: '你已经在工单上直接做了决定', en: 'you already decided this on the work order itself' },
  work_order_closed: { zh: '工单已被取消或婉拒', en: 'the work order was cancelled or declined' },
  work_order_moved_on: WO_MOVED_ON,
  'not the landlord of this household': NOT_LANDLORD,
  'not the landlord of this work order': NOT_LANDLORD,
  'provider not verified': { zh: '这位服务商还没有通过核验', en: 'this provider has not been verified yet' },
  'provider_id or a valid external_email required': { zh: '卡片上没有服务商，也没有有效的联系人邮箱', en: 'the card has neither a provider nor a valid contact email' },
  application_withdrawn: { zh: '申请人已经撤回了申请，这封通知没有发出', en: 'the applicant withdrew the application, so this notice was not sent' },
  'lease has no end date': { zh: '这份租约没有到期日，没法写续约函', en: 'this lease has no end date, so a renewal letter cannot be written' },
  no_renewal_option_chosen: { zh: '还没有选续约方案（不涨，或按当年指导上限）', en: 'no renewal option was chosen yet (no increase, or the guideline for the year)' },
  lease_not_sendable: { zh: '这份租约已不在可发送签署的状态（可能已签署、已结束，或是导入的记录）', en: 'this lease can no longer be sent for signing (it may be signed, ended, or an imported record)' },
  lease_no_terms: NO_TERMS,
  'lease terms incomplete — fill the form first': NO_TERMS,
  'lease has no tenant email': NO_TENANT_EMAIL,
  'tenant has already signed': { zh: '租客已经签过字了', en: 'the tenant has already signed' },
  'email failed': SEND_ERROR,
  'invite_id missing': NO_INVITE,
  'invite not found or not yours': NO_INVITE,
  'action not found': { zh: '找不到这张卡片', en: 'this card could not be found' },
  'not your action': { zh: '这张卡片不属于当前登录的账号', en: 'this card belongs to a different account' },
  no_session: SESSION,
  'Invalid session': SESSION,
  'Authentication required': SESSION,
}
const STATUS_WORD: Record<string, Bi> = {
  pending: { zh: '待批准', en: 'pending' },
  rejected: { zh: '已拒绝', en: 'rejected' },
  expired: { zh: '已失效', en: 'expired' },
}

/** What a failed execution means, in plain words — never a raw code alone, never a guess (the old
 *  fallback told every failure to "check the tenant's email"). */
export function executionReasonText(reason: string | null | undefined, zh: boolean): string {
  const code = String(reason ?? '').trim()
  const hit = REASON_TEXT[code]
  if (hit) return zh ? hit.zh : hit.en
  const state = code.match(/^action is (\w+), not approved$/)
  if (state) {
    const w = STATUS_WORD[state[1]]
    return zh ? `这张卡片的状态已变为「${w?.zh ?? state[1]}」` : `this card is now ${w?.en ?? state[1]}`
  }
  if (code.startsWith('provider_not_eligible')) return zh ? '服务商的资质已不再覆盖这个工种或城市' : "the provider's credentials no longer cover this trade or city"
  if (code.startsWith('entry_window')) return zh ? '到场时间不符合 RTA s.27（须提前 24 小时书面通知，8:00–20:00）' : 'the visit time is outside RTA s.27 (24 hours’ written notice, 8 am–8 pm)'
  // canAct refused: the work order is no longer in the status this card is about.
  if (code.startsWith('not_from_')) return zh ? WO_MOVED_ON.zh : WO_MOVED_ON.en
  if (code.startsWith('quote_')) return zh ? '报价无效或已变动' : 'the quote is invalid or changed'
  const http = code.match(/^http (\d{3})$/)
  if (http) return zh ? `服务器返回错误（HTTP ${http[1]}）` : `the server returned an error (HTTP ${http[1]})`
  const shown = code.slice(0, 80) || (zh ? '未知原因' : 'unknown reason')
  return zh ? `执行没有完成（${shown}）` : `it did not complete (${shown})`
}

/** Approved, but the run failed or never happened: the card stays on the to-do list with a retry. */
export function notExecutedText(reason: string | null | undefined, zh: boolean): string {
  const why = executionReasonText(reason, zh)
  return zh
    ? `⚠️ 批准已记录，但还没有执行：${why}。这张卡片留在待办里，标着「已批准，尚未执行」——可以点「现在执行」重试，或点「放弃」。不会重复发送。`
    : `⚠️ Your approval was recorded, but it hasn't run: ${why}. The card stays in your to-dos as "Approved · not run yet" — tap "Run now" to retry or "Drop" to give it up. Nothing will be sent twice.`
}

/** Undo (or 放弃) arrived after the card had already run, here or in another tab: say so — never "taken back". */
export function alreadyRanCannotTakeBackText(title: string | null | undefined, zh: boolean): string {
  const t = title ?? (zh ? '这张卡片' : 'this card')
  return zh
    ? `⚠️ 撤回没有生效：「${t}」已经执行了（可能是另一个页面或标签页在倒计时结束后执行的），已经发出的内容撤不回来。`
    : `⚠️ It couldn't be taken back: "${t}" had already run (another page or tab may have run it when its countdown ended) — what was sent can't be recalled.`
}

/** The undo did not reach the database: the row is still approved. It is held on the to-do list, never run on a timer. */
export function undoFailedText(title: string | null | undefined, zh: boolean): string {
  const t = title ?? (zh ? '这张卡片' : 'this card')
  return zh
    ? `⚠️ 撤销没有成功（网络或服务器出错）：「${t}」没有恢复成待批准，但不会再自动执行。它留在待办里，标着「已批准，尚未执行」——点「放弃」才算撤回，点「现在执行」会照常发出。`
    : `⚠️ The undo didn't go through (network or server error): "${t}" is not back to pending, but it won't run on its own. It stays in your to-dos as "Approved · not run yet" — tap "Drop" to take it back, or "Run now" to send it.`
}

/** The collapsed line a decided card leaves in the chat, from what the decision actually became.
 *  null = no line (undone back to pending, rolled back on an error, nothing happened). Callers that
 *  report no outcome (the homepage film) keep the button they pressed. */
export type DecidedRowKind = 'approved' | 'rejected' | 'abandoned' | 'expired' | 'not_run'
export function decidedRowFor(outcome: DecideOutcome | null | undefined | void, decision: 'approved' | 'rejected', stalledCard = false): DecidedRowKind | null {
  if (outcome == null) return decision === 'approved' ? 'approved' : stalledCard ? 'abandoned' : 'rejected'
  switch (outcome) {
    case 'executed':
    case 'already_ran':
    case 'stalled':
    case 'preview':
      return 'approved'
    case 'rejected': return 'rejected'
    case 'abandoned': return 'abandoned'
    case 'expired': return 'expired'
    case 'not_run': return 'not_run'
    default: return null
  }
}

/** The card changed under us (decided on another page, undone, expired): nothing ran here. */
export function notRunText(title: string | null | undefined, reason: string | null | undefined, zh: boolean): string {
  const t = title ?? (zh ? '这张卡片' : 'this card')
  return zh ? `⚠️ 「${t}」没有执行：${executionReasonText(reason, zh)}。我重新读取了待办。` : `⚠️ "${t}" did not run: ${executionReasonText(reason, zh)}. I re-read your to-dos.`
}

/** The executor found the card no longer valid (C2 expired:true, or no executor): nothing ran, the card is gone. */
export function cardExpiredText(title: string | null | undefined, reason: string | null | undefined, zh: boolean): string {
  const t = title ?? (zh ? '这张卡片' : 'this card')
  const why = executionReasonText(reason, zh)
  return zh
    ? `⚠️ 「${t}」没有执行：${why}。卡片已失效，已从待办里移除，什么也没有发出。`
    : `⚠️ "${t}" did not run: ${why}. The card is no longer valid and was removed from your to-dos — nothing was sent.`
}
