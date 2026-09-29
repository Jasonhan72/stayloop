// Wording the conversation itself uses — the greeting that opens a new thread
// and the "✅ 已执行" line posted once an approved card has been carried out.
// Pure so the homepage film (components/home/ThreeRoleFilm.tsx) plays the
// product's own lines instead of a copy that drifts (user 2026-09-28: the hero
// animation must follow the current page design).
import type { Lang } from '@/lib/i18n'
import type { AgentRole } from './types'

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
export function executedText(i: { title: string | null | undefined; actionType: string | null | undefined; sentTo: string; rent?: number | null; zh: boolean }): string {
  const { title, actionType, sentTo, rent, zh } = i
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
