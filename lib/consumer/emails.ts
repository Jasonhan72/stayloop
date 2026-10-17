// Email templates for the consumer file flow (V0.8, G19). Bilingual (zh first,
// en after — the applicant chose a language on the request but the mailbox may
// be read by someone else). Plain, no marketing. The token appears ONLY in the
// confirmation email; every other mail links to a token-free page.
import type { ConsumerDispute, ConsumerLang } from './types'

type Mail = { subject: string; html: string; text: string }

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function wrap(title: string, paragraphs: string[], cta?: { href: string; label: string }): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f8fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1B1B3C;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #D3E3EF;">
<tr><td style="padding:24px 28px 8px 28px;"><div style="font-size:11px;letter-spacing:.12em;color:#00ACE4;text-transform:uppercase;font-weight:600;">Stayloop</div><h1 style="margin:8px 0 0 0;font-size:19px;font-weight:700;">${esc(title)}</h1></td></tr>
<tr><td style="padding:8px 28px 24px 28px;font-size:14px;line-height:1.65;">${paragraphs.map((p) => `<p style="margin:0 0 12px 0;">${p}</p>`).join('')}${cta ? `<p style="margin:16px 0 0 0;"><a href="${esc(cta.href)}" style="display:inline-block;background:#00ACE4;color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:10px 20px;">${esc(cta.label)}</a></p><p style="margin:8px 0 0 0;font-size:12px;color:#6E6E8A;word-break:break-all;">${esc(cta.href)}</p>` : ''}</td></tr>
<tr><td style="padding:12px 28px 20px 28px;font-size:11.5px;color:#6E6E8A;border-top:1px solid #EEF5FA;">Stayloop Inc. · privacy@stayloop.ai · 索取档案、提出争议、设置身份警示都免费 / Asking for your file, disputing an item and setting an identity alert are free.</td></tr>
</table></td></tr></table></body></html>`
}

export function confirmRequestEmail(i: { link: string; lang: ConsumerLang }): Mail {
  const subject = '确认是你 · 查看我的筛查档案 / Confirm it’s you · view my screening file'
  const zh = `有人用这个邮箱在 Stayloop 申请查看「我的筛查档案」。如果是你本人，点下面的链接继续（24 小时内有效，只能用这个链接打开）。如果不是你，忽略这封邮件即可，什么都不会发生。`
  const en = `Someone asked to see “my screening file” on Stayloop with this email address. If that was you, open the link below to continue (valid 24 hours; the file opens only through this link). If it wasn’t you, ignore this email — nothing happens.`
  const html = wrap(i.lang === 'zh' ? '确认是你 · 查看我的筛查档案' : 'Confirm it’s you · my screening file', [esc(zh), esc(en)], { href: i.link, label: i.lang === 'zh' ? '打开我的筛查档案' : 'Open my screening file' })
  const text = `${zh}\n\n${en}\n\n${i.link}\n\n— Stayloop · privacy@stayloop.ai`
  return { subject, html, text }
}

export function adminReviewEmail(i: { requestId: string; emailMasked: string; reason: 'needs_review' | 'mail' | 'phone'; dueAt: string | null; candidates: number; queueUrl: string }): Mail {
  const why = i.reason === 'needs_review' ? '邮箱链上的筛查与申请人填的姓名 / 出生日期对不上（或零命中），需要人工复核 / name or date of birth did not match the email chain (or no candidate) — human review' : `申请人选择${i.reason === 'mail' ? '邮寄' : '电话'}方式，需要人工处理 / applicant chose ${i.reason} delivery — manual handling`
  const subject = `消费者档案请求需要处理 · ${i.requestId.slice(0, 8)} / Consumer file request needs handling`
  const lines = [`请求 ${esc(i.requestId)} · ${esc(i.emailMasked)} · 候选筛查 ${i.candidates} 份`, esc(why), i.dueAt ? `时限 / due: ${esc(i.dueAt)}（《消费者报告法》s.12(8) 两个工作日）` : '']
  const html = wrap('消费者档案请求 / Consumer file request', lines.filter(Boolean), { href: i.queueUrl, label: '打开队列 / Open the queue' })
  return { subject, html, text: `${lines.filter(Boolean).join('\n')}\n${i.queueUrl}` }
}

export function adminDisputeEmail(i: { disputeId: string; requestId: string; emailMasked: string; itemLabel: string | null; statement: string; queueUrl: string }): Mail {
  const subject = `收到一条争议 · ${i.disputeId.slice(0, 8)} / New dispute filed`
  const lines = [`请求 ${esc(i.requestId)} · ${esc(i.emailMasked)}`, `事项 / item: ${esc(i.itemLabel ?? '—')}`, `申请人说明 / statement: ${esc(i.statement)}`, '《消费者报告法》s.13(1)：合理时间内核实后更正 / 补充 / 删除 / 维持（写明理由）。']
  const html = wrap('收到一条争议 / New dispute', lines, { href: i.queueUrl, label: '打开队列 / Open the queue' })
  return { subject, html, text: `${lines.join('\n')}\n${i.queueUrl}` }
}

const RESULT_LABEL: Record<string, { zh: string; en: string }> = {
  corrected: { zh: '已更正', en: 'corrected' },
  supplemented: { zh: '已补充说明', en: 'supplemented' },
  deleted: { zh: '已删除', en: 'deleted' },
  maintained: { zh: '维持原记录', en: 'maintained' },
}

export function applicantDisputeResultEmail(i: { dispute: Pick<ConsumerDispute, 'item_label' | 'status' | 'resolution_note'>; lang: ConsumerLang; fileUrl: string }): Mail {
  const r = RESULT_LABEL[i.dispute.status] ?? { zh: i.dispute.status, en: i.dispute.status }
  const subject = `你的争议已处理：${r.zh} / Your dispute has been resolved: ${r.en}`
  const zh = `你对「${i.dispute.item_label ?? '档案中的一项'}」提出的争议已处理，结果：${r.zh}。${i.dispute.resolution_note ? `说明：${i.dispute.resolution_note}` : ''} 60 天内收到过这份报告的人已同时收到更正通知。如仍有异议，回复本邮件或写信到 privacy@stayloop.ai。`
  const en = `Your dispute about “${i.dispute.item_label ?? 'an item in your file'}” has been resolved: ${r.en}. ${i.dispute.resolution_note ? `Note: ${i.dispute.resolution_note}` : ''} Everyone who received this report in the last 60 days has been sent a correction notice. If you still disagree, reply to this email or write to privacy@stayloop.ai.`
  const html = wrap(i.lang === 'zh' ? '你的争议已处理' : 'Your dispute has been resolved', [esc(zh), esc(en)], { href: i.fileUrl, label: i.lang === 'zh' ? '再次索取我的档案' : 'Ask for my file again' })
  return { subject, html, text: `${zh}\n\n${en}\n\n${i.fileUrl}` }
}

export function correctionNoticeEmail(i: { recipientName: string | null; screeningId: string; applicantLabel: string; action: string; itemLabel: string | null; note: string | null; reportUrl: string }): Mail {
  const r = RESULT_LABEL[i.action] ?? { zh: i.action, en: i.action }
  const subject = `筛查档案更正通知 · ${i.applicantLabel} / Correction notice for a screening file`
  const zh = `${i.recipientName ? `${i.recipientName}，` : ''}你在 Stayloop 收到过的一份筛查报告（${i.applicantLabel}）中，申请人对「${i.itemLabel ?? '一项内容'}」提出了争议，经核实后：${r.zh}。${i.note ? `说明：${i.note}` : ''} 依据《消费者报告法》s.13(2)，我们通知 60 天内收到过该报告的每一位收件人。报告页顶部现在显示这条更正记录；请以更正后的内容为准。`
  const en = `${i.recipientName ? `${i.recipientName}, ` : ''}a screening report you received on Stayloop (${i.applicantLabel}) was disputed by the applicant regarding “${i.itemLabel ?? 'an item'}”; after verification it was ${r.en}. ${i.note ? `Note: ${i.note}` : ''} Under Consumer Reporting Act s.13(2) we notify everyone who received the report in the last 60 days. The report page now shows this correction; please rely on the corrected content.`
  const html = wrap('筛查档案更正通知 / Correction notice', [esc(zh), esc(en)], { href: i.reportUrl, label: '打开报告 / Open the report' })
  return { subject, html, text: `${zh}\n\n${en}\n\n${i.reportUrl}` }
}
