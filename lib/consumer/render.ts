// Disclosure pack → printable HTML (V0.8, G19). Pure: same `.sheet` + toolbar
// convention as lib/generateReport.ts / lib/profile/exportPack.ts — an A4 sheet
// on screen, the same sheet in print. Every user string goes through esc().
//
// s.12(5): the first page tells the applicant, in plain words, what this is,
// that they can dispute any line, that corrections are free, and how to reach
// us; s.12(9): plain language throughout — codes never appear, only labels.
import type { ConsumerAlert, ConsumerLang, DisclosurePack, PackItem, PackScreening } from './types'
import { alertBanner } from './alerts'

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const T = (lang: ConsumerLang, zh: string, en: string) => (lang === 'zh' ? zh : en)

function when(iso: string | null | undefined, lang: ConsumerLang): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return esc(iso)
  return esc(d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
}

const KIND_LABEL: Record<PackItem['kind'], { zh: string; en: string }> = {
  fact: { zh: '档案事实', en: 'Facts on file' },
  forensic_flag: { zh: '筛查标记', en: 'Screening signals' },
  public_record: { zh: '公开记录', en: 'Public records' },
  credit: { zh: '信用', en: 'Credit' },
  verification: { zh: '本人授权核验', en: 'Verification you authorised' },
}

const ACTION_LABEL: Record<string, { zh: string; en: string }> = {
  corrected: { zh: '已更正', en: 'Corrected' },
  supplemented: { zh: '已补充说明', en: 'Supplemented' },
  deleted: { zh: '已删除', en: 'Deleted' },
  maintained: { zh: '维持原记录（理由见注）', en: 'Maintained (see note)' },
}

/** The rights paragraph (s.12(5), s.12.1, s.12(13), s.12(8), s.13) — shared with the pack page and the notice letter. */
export function rightsParagraph(lang: ConsumerLang): string[] {
  return lang === 'zh'
    ? [
        '这是什么：Stayloop 档案里关于你的全部信息的性质与实质——房东筛查时读到的事实、筛查标记、公开记录命中、你授权过的核验，以及 3 年内查阅过这份档案的人和 1 年内收到报告的人。',
        '提出争议：任何一条你认为不准确或不完整，都可以在线提出争议。我们会在合理时间内核实，然后更正、补充、删除，或说明为什么维持；结果会通知你，也会通知 60 天内收到过报告的人。',
        '身份警示：你可以要求在档案上放一条身份警示（例如「我的身份信息曾被冒用」），此后每一次披露都会带上它，6 年后自动到期，也可以随时撤销。',
        '免费：索取档案、提出争议、设置警示都不收费。',
        '时限：电子方式即时；邮寄或电话方式 2 个工作日内。',
        '联系我们：privacy@stayloop.ai。有受训人员解释档案内容。',
      ]
    : [
        'What this is: the nature and substance of everything in Stayloop’s file about you — the facts a landlord’s screening read, screening signals, public-record hits, verification you authorised, everyone who looked at this file in the last 3 years and everyone who received a report in the last year.',
        'Dispute: any line you believe is inaccurate or incomplete can be disputed online. We verify within a reasonable time, then correct, supplement, delete, or explain why it stands; you are told the result, and so is anyone who received the report in the last 60 days.',
        'Identity alert: you can ask us to put an alert on your file (for example “my identity was misused”); every later disclosure carries it, it expires after 6 years, and you can remove it any time.',
        'Free: asking for your file, disputing an item and setting an alert cost nothing.',
        'Timing: electronic disclosure is immediate; by mail or phone, within 2 business days.',
        'Contact: privacy@stayloop.ai. Trained staff can explain the file.',
      ]
}

function renderItems(items: PackItem[], lang: ConsumerLang): string {
  if (!items.length) return `<p class="meta">${T(lang, '这份筛查没有记录到具体事项。', 'No specific items were recorded in this screening.')}</p>`
  const groups = new Map<PackItem['kind'], PackItem[]>()
  for (const it of items) groups.set(it.kind, [...(groups.get(it.kind) ?? []), it])
  const disputeHint = T(lang, '这条不对？→ 在线提出争议（在你的档案页点这一条旁的「这条不对」）', 'Not right? → dispute it online (open this line on your file page)')
  return Array.from(groups.entries())
    .map(([kind, list]) => `<h4>${esc(KIND_LABEL[kind][lang])}</h4><table><tbody>${list
      .map((it) => `<tr data-ref="${esc(it.ref)}"><td class="lab">${esc(it.label)}${it.severity ? ` <span class="sev">${esc(it.severity)}</span>` : ''}</td><td>${esc(it.detail ?? '—')}${it.unverified ? `<div class="unv">${T(lang, '未经佐证：这是同名或未核实的记录，不能单独作为不利依据。', 'Not corroborated: a same-name or unverified record; it cannot stand alone as adverse information.')}</div>` : ''}<div class="hint">${esc(disputeHint)}</div></td></tr>`)
      .join('')}</tbody></table>`)
    .join('')
}

function renderScreening(s: PackScreening, i: number, lang: ConsumerLang): string {
  const corr = s.corrections.length
    ? `<h4>${T(lang, '更正记录', 'Corrections')}</h4><table><tbody>${s.corrections.map((c) => `<tr><td class="lab">${esc(ACTION_LABEL[c.action]?.[lang] ?? c.action)}</td><td>${esc(c.item_label ?? c.item_ref ?? '')}${c.note ? `<div class="meta">${esc(c.note)}</div>` : ''}<div class="meta">${when(c.created_at, lang)}</div></td></tr>`).join('')}</tbody></table>`
    : ''
  return `<section class="scr">
  <h3>${i + 1} · ${T(lang, '筛查', 'Screening')} ${when(s.created_at, lang)}</h3>
  <div class="meta">${T(lang, '房东', 'Landlord')}: ${esc(s.landlord_name ?? T(lang, '未留姓名', 'name not on file'))} · ${T(lang, '物业', 'Property')}: ${esc(s.property ?? '—')} · ${T(lang, '结论', 'Conclusion')}: ${esc(s.tier_label ?? '—')}${s.ai_score != null ? ` · ${T(lang, '总分', 'score')} ${esc(s.ai_score)}/100` : ''}${s.notice_confirmed_how ? ` · ${T(lang, '书面通知确认', 'notice confirmed')}: ${esc(s.notice_confirmed_how)}` : ''}</div>
  ${s.summary ? `<p class="sum">${esc(s.summary)}</p>` : ''}
  ${renderItems(s.items, lang)}
  ${corr}
  <h4>${T(lang, '信息来源', 'Sources')}</h4><p class="meta">${s.sources.map(esc).join(' · ') || '—'}</p>
  <h4>${T(lang, '档案里的文件', 'Documents in the file')}</h4><p class="meta">${s.documents.length ? s.documents.map((d) => `${esc(d.kind)} · ${esc(d.name)}`).join('<br>') : '—'}</p>
</section>`
}

function renderAlert(alert: ConsumerAlert | null, lang: ConsumerLang): string {
  if (!alert) return ''
  const b = alertBanner(alert, lang)
  return `<div class="alert"><strong>${esc(b.title)}</strong><div>${esc(b.body)}</div><div class="meta">${esc(b.meta)}</div></div>`
}

export function renderDisclosurePack(pack: DisclosurePack, lang: ConsumerLang = pack.lang): string {
  const title = T(lang, '我的筛查档案', 'My screening file')
  const rights = rightsParagraph(lang).map((p) => `<li>${esc(p)}</li>`).join('')
  const viewers = pack.viewers.length
    ? `<table><thead><tr><th>${T(lang, '时间', 'When')}</th><th>${T(lang, '谁', 'Who')}</th><th>${T(lang, '看了什么', 'What')}</th></tr></thead><tbody>${pack.viewers.map((v) => `<tr><td>${when(v.when, lang)}</td><td>${esc(v.name)} <span class="meta">${esc(v.role)}</span></td><td>${esc(v.what)}</td></tr>`).join('')}</tbody></table>`
    : `<p class="meta">${T(lang, '3 年内没有记录到查阅。', 'No access recorded in the last 3 years.')}</p>`
  const recipients = pack.recipients.length
    ? `<table><thead><tr><th>${T(lang, '收到时间', 'Received')}</th><th>${T(lang, '谁', 'Who')}</th></tr></thead><tbody>${pack.recipients.map((r) => `<tr><td>${when(r.received_at, lang)}</td><td>${esc(r.name)} <span class="meta">${esc(r.role)}</span></td></tr>`).join('')}</tbody></table>`
    : `<p class="meta">${T(lang, '1 年内没有记录到报告收件人。', 'No report recipient recorded in the last year.')}</p>`
  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en-CA'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · Stayloop</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9eef3; color: #1B1B3C; font: 13px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; }
  .toolbar { width: 210mm; max-width: 100%; margin: 0 auto 12px auto; padding: 12px 0 0 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: #475569; }
  .toolbar button { font: inherit; font-weight: 700; color: #fff; background: #1B1B3C; border: 0; border-radius: 999px; padding: 8px 18px; cursor: pointer; }
  .sheet { width: 210mm; max-width: 100%; margin: 0 auto; background: #fff; padding: 18mm 16mm 16mm 16mm; box-shadow: 0 2px 24px rgba(15, 23, 42, 0.18); overflow: hidden; }
  h1 { font-size: 22px; margin: 0 0 4px 0; }
  h2 { font-size: 16px; margin: 22px 0 8px 0; border-bottom: 1px solid #D3E3EF; padding-bottom: 4px; }
  h3 { font-size: 14px; margin: 18px 0 4px 0; }
  h4 { font-size: 12px; margin: 12px 0 4px 0; color: #4A4A6A; letter-spacing: .04em; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px 0; }
  th, td { text-align: left; vertical-align: top; padding: 5px 6px; border-bottom: 1px solid #EEF5FA; }
  th { font-size: 11px; color: #6E6E8A; }
  td.lab { width: 36%; font-weight: 600; }
  .meta { color: #6E6E8A; font-size: 11.5px; }
  .sum { background: #F3F8FC; border-radius: 8px; padding: 8px 10px; }
  .hint { color: #0094C6; font-size: 11px; margin-top: 2px; }
  .unv { color: #9A3412; font-size: 11px; margin-top: 2px; }
  .sev { font-size: 10px; color: #6E6E8A; font-weight: 400; }
  .alert { background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 10px 12px; margin: 10px 0; }
  .rights li { margin: 0 0 6px 0; }
  .fp { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; word-break: break-all; }
  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
    .sheet { width: auto; max-width: none; margin: 0; padding: 0; box-shadow: none; overflow: visible; }
  }
</style>
</head>
<body>
<div class="toolbar no-print">
  <span>${esc(title)} · ${T(lang, '生成于', 'generated')} ${when(pack.generated_at, lang)}</span>
  <button type="button" onclick="window.print()">${T(lang, '打印 / 保存为 PDF', 'Print / Save as PDF')}</button>
</div>
<div class="sheet">
  <h1>${esc(title)}</h1>
  <div class="meta">${esc(pack.name ?? '')}${pack.name ? ' · ' : ''}${esc(pack.email)} · ${T(lang, '请求编号', 'request')} ${esc(pack.request_id)} · ${T(lang, '生成于', 'generated')} ${when(pack.generated_at, lang)}</div>
  ${renderAlert(pack.alert, lang)}
  <h2>${T(lang, '你的权利', 'Your rights')}</h2>
  <ul class="rights">${rights}</ul>
  <h2>${T(lang, '档案内容', 'What is in the file')} <span class="meta">(${pack.screenings.length})</span></h2>
  ${pack.screenings.length ? pack.screenings.map((s, i) => renderScreening(s, i, lang)).join('') : `<p class="meta">${T(lang, '没有匹配到筛查记录。', 'No screening matched this request.')}</p>`}
  <h2>${T(lang, '3 年内查阅过这份档案的人', 'Who looked at this file in the last 3 years')}</h2>
  ${viewers}
  <h2>${T(lang, '1 年内收到报告的人', 'Who received a report in the last year')}</h2>
  ${recipients}
  <h2>${T(lang, '内容指纹', 'Content fingerprint')}</h2>
  <p class="meta">${T(lang, '以下为本披露包所依据的结构化记录（JSON，键排序后）的 SHA-256。', 'SHA-256 of the structured record (JSON, keys sorted) this pack was rendered from.')}</p>
  <p class="fp">${esc(pack.fingerprint ?? '')}</p>
  <p class="meta">Stayloop Inc. · privacy@stayloop.ai · ${T(lang, '按《消费者报告法》（安省）s.12 披露', 'Disclosed under the Consumer Reporting Act (Ontario), s.12')}</p>
</div>
</body>
</html>`
}
