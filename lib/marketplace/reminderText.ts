// The credential-expiry reminder a provider is sent (lib/marketplace/sweep.ts), as words only. Pure.
// Until 2026-11-23 there was one wording — 「派单会跳过你」 — which is true of a plumber and false of a
// paralegal: nothing is ever dispatched to a professional-only record. What lapses for them is the
// 「牌照已核」 mark in the directory, and their form is on its own page.
import { onboardHref } from './onboardKind'

export function credentialReminderText(o: {
  /** the record lists professional services and nothing that is dispatched (isProfessionalOnly) */
  professionalOnly: boolean
  name: string
  /** the bulleted credentials, one language per block */
  zhLines: string
  enLines: string
  /** days left on the soonest one; negative = already expired */
  worst: number
  /** the site origin, no trailing slash */
  site: string
}): { subject: string; body: string; url: string } {
  const url = onboardHref(o.professionalOnly ? 'professional' : 'repair')
  const link = `${o.site}${url}`
  if (o.professionalOnly) {
    const subject = o.worst < 0
      ? '牌照已过期 · 目录不再显示「已核」 / Licence expired · no longer shown as verified'
      : `牌照 ${o.worst} 天后到期 / Licence expires in ${o.worst} day(s)`
    const body =
      `您好，${o.name}，\n\n${o.zhLines}\n\n到期的牌照不再算数，目录里会显示「牌照待核或已过期」，直到你在入驻页更新编号与到期日并由 Stayloop 重新核验。更新：${link}\n\n` +
      `Hi ${o.name},\n\n${o.enLines}\n\nAn expired licence no longer counts, and the directory shows it as pending or expired until you update the number and expiry on the onboarding page and Stayloop re-verifies it. Update: ${link}`
    return { subject, body, url }
  }
  const subject = o.worst < 0 ? `资质已过期 · 派单已跳过你 / Credential expired · dispatch paused` : `资质 ${o.worst} 天后到期 / Credential expires in ${o.worst} day(s)`
  const body =
    `您好，${o.name}，\n\n${o.zhLines}\n\n到期的资质不再计入工种覆盖，派单会跳过你，直到你在入驻页更新编号与到期日并由 Stayloop 重新核验。更新：${link}\n\n` +
    `Hi ${o.name},\n\n${o.enLines}\n\nAn expired credential no longer counts toward trade coverage and dispatch skips you until you update the number and expiry on the onboarding page and Stayloop re-verifies it. Update: ${link}`
  return { subject, body, url }
}
