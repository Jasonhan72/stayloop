// Tiny Resend wrapper. Uses the bare REST API via fetch so we stay edge-safe
// on Cloudflare Pages without pulling in the Resend SDK (which currently ships
// Node-only helpers).
//
// Docs: https://resend.com/docs/api-reference/emails/send-email

export interface SendEmailArgs {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!apiKey || !from) {
    return { ok: false, error: 'RESEND_API_KEY or RESEND_FROM not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      // Bounded: a hung Resend call would stall the whole edge request.
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(args.to) ? args.to : [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `resend ${res.status}: ${body}` }
    }

    const data = (await res.json()) as { id?: string }
    return { ok: true, id: data.id }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'resend fetch failed' }
  }
}

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------

export interface NewApplicationEmailInput {
  applicantName: string
  applicantEmail: string
  propertyAddress: string
  monthlyRent: number | null
  monthlyIncome: number | null
  fileCount: number
  dashboardUrl: string
}

export function renderNewApplicationEmail(i: NewApplicationEmailInput): {
  subject: string
  html: string
  text: string
} {
  const subject = `New application from ${i.applicantName} — ${i.propertyAddress}`

  const rent = i.monthlyRent ? `$${i.monthlyRent.toLocaleString()}/mo` : 'N/A'
  const income = i.monthlyIncome ? `$${i.monthlyIncome.toLocaleString()}/mo` : 'N/A'
  const ratio =
    i.monthlyRent && i.monthlyIncome
      ? `${(i.monthlyIncome / i.monthlyRent).toFixed(1)}x rent`
      : '—'

  const text = `New rental application on Stayloop

Applicant: ${i.applicantName}
Email:     ${i.applicantEmail}
Property:  ${i.propertyAddress}
Rent:      ${rent}
Income:    ${income} (${ratio})
Documents: ${i.fileCount} uploaded

Review it here:
${i.dashboardUrl}

— Stayloop`

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <div style="font-size:11px;letter-spacing:0.12em;color:#06b6d4;text-transform:uppercase;font-weight:600;">Stayloop</div>
                <h1 style="margin:8px 0 0 0;font-size:20px;font-weight:700;color:#0f172a;">New rental application</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 24px 28px;color:#334155;font-size:14px;line-height:1.55;">
                <p style="margin:16px 0 8px 0;">
                  <strong style="color:#0f172a;">${escapeHtml(i.applicantName)}</strong>
                  just applied for:
                </p>
                <p style="margin:0 0 20px 0;color:#0f172a;font-weight:600;">${escapeHtml(i.propertyAddress)}</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
                  ${row('Email', escapeHtml(i.applicantEmail))}
                  ${row('Monthly rent', rent)}
                  ${row('Self-reported income', `${income} <span style="color:#64748b;">(${ratio})</span>`)}
                  ${row('Documents uploaded', String(i.fileCount))}
                </table>

                <div style="margin:28px 0 8px 0;">
                  <a href="${encodeURI(i.dashboardUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">Review application →</a>
                </div>

                <p style="margin:24px 0 0 0;font-size:12px;color:#94a3b8;">
                  You can run AI screening and LTB record search from the application detail page.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:11px;color:#94a3b8;">
                Stayloop · AI tenant screening for Ontario landlords · stayloop.ai
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}

export interface AgentMessageEmailInput {
  subject: string
  body: string // plain text — caller strips HTML; escaped here
}

// Generic "your counterparty's agent sent you a message" email. Body is plain
// text rendered as a minimal styled paragraph inside the standard Stayloop
// shell; the footer discloses agent authorship + human approval (bilingual).
export function renderAgentMessageEmail(i: AgentMessageEmailInput): {
  subject: string
  html: string
  text: string
} {
  const disclosureZh = '此邮件由发送方在 Stayloop 上批准后，由其 AI 代理发送。直接回复本邮件即可联系对方。'
  const disclosureEn = 'Sent by the sender’s AI agent on Stayloop, after their explicit approval. Reply to this email to reach them directly.'

  const text = `${i.body}

— ${disclosureEn}
${disclosureZh}`

  const bodyHtml = escapeHtml(i.body).replace(/\n/g, '<br>')

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <div style="font-size:11px;letter-spacing:0.12em;color:#06b6d4;text-transform:uppercase;font-weight:600;">Stayloop</div>
                <h1 style="margin:8px 0 0 0;font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(i.subject)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 24px 28px;color:#334155;font-size:14px;line-height:1.55;">
                <p style="margin:16px 0 0 0;">${bodyHtml}</p>
                <p style="margin:24px 0 0 0;font-size:12px;color:#94a3b8;">
                  ${escapeHtml(disclosureEn)}<br>${escapeHtml(disclosureZh)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:11px;color:#94a3b8;">
                Stayloop · AI tenant screening for Ontario landlords · stayloop.ai
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject: i.subject, html, text }
}

export interface RentReminderEmailInput {
  tenantName?: string | null
  unitLabel?: string | null
  monthlyRent: number
  dueDate: string // YYYY-MM-DD
}

// Friendly bilingual rent reminder — landlord approved it on the agent page,
// the agent sends it. Deliberately warm, not a demand letter.
export function renderRentReminderEmail(i: RentReminderEmailInput): {
  subject: string
  html: string
  text: string
} {
  const tenant = i.tenantName || 'Tenant'
  const unit = i.unitLabel || 'your unit'
  const amount = `$${(i.monthlyRent || 0).toLocaleString()}`
  const subject = `租金提醒 · ${unit} · ${i.dueDate} — Rent reminder`

  const text = `Hi ${tenant},

A friendly reminder that your rent for ${unit} is due soon:

  • Amount:   ${amount}
  • Due date: ${i.dueDate}

If you've already arranged payment, please ignore this note. Questions? Just reply to this email.

— Sent by the landlord's AI assistant on Stayloop, after landlord approval.
你好 ${tenant}，友情提醒：${unit} 的租金 ${amount} 将于 ${i.dueDate} 到期。如已安排付款请忽略本邮件；有任何问题直接回复即可。此邮件由房东在 Stayloop 上批准后由其 AI 助手发送。`

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <div style="font-size:11px;letter-spacing:0.12em;color:#06b6d4;text-transform:uppercase;font-weight:600;">Stayloop</div>
                <h1 style="margin:8px 0 0 0;font-size:20px;font-weight:700;color:#0f172a;">租金提醒 · Rent reminder</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 24px 28px;color:#334155;font-size:14px;line-height:1.55;">
                <p style="margin:16px 0 8px 0;">Hi <strong style="color:#0f172a;">${escapeHtml(tenant)}</strong>, a friendly reminder that your rent is due soon:</p>
                <p style="margin:0 0 8px 0;">你好 ${escapeHtml(tenant)}，友情提醒：您的租金即将到期。</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
                  ${row('Unit · 单元', escapeHtml(unit))}
                  ${row('Amount · 金额', amount)}
                  ${row('Due date · 到期日', escapeHtml(i.dueDate))}
                </table>

                <p style="margin:20px 0 0 0;">If you've already arranged payment, please ignore this note. Questions? Just reply to this email.<br>如已安排付款请忽略本邮件；有任何问题直接回复即可。</p>

                <p style="margin:24px 0 0 0;font-size:12px;color:#94a3b8;">
                  Sent by the landlord's AI assistant on Stayloop, after landlord approval. · 此邮件由房东在 Stayloop 上批准后由其 AI 助手发送。
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:11px;color:#94a3b8;">
                Stayloop · AI tenant screening for Ontario landlords · stayloop.ai
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#64748b;width:160px;">${label}</td>
    <td style="padding:6px 0;color:#0f172a;">${value}</td>
  </tr>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── Household invite ────────────────────────────────────────────────────────

function esc(x: string): string {
  return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface HouseholdInviteEmailInput {
  inviterName: string
  address: string
  roleZh: string
  roleEn: string
  joinUrl: string
}

/**
 * Deliberately sparse: no rent, no dates, no lease details. The recipient has
 * not consented to receiving those over email, and an invite that carries the
 * whole tenancy is a phishing template. Address + inviter + role is enough to
 * decide whether to click.
 */
export function renderHouseholdInviteEmail(i: HouseholdInviteEmailInput): {
  subject: string
  html: string
  text: string
} {
  const subject = `${i.inviterName} 邀请你共同管理 ${i.address} — Stayloop invitation`
  const text = `${i.inviterName} 邀请你以「${i.roleZh}」身份加入 ${i.address} 的在管租约。

在 Stayloop 上,租约各方可以在一个地方对话、报修、收租金提醒。

接受或拒绝邀请:
${i.joinUrl}

${i.inviterName} invited you to join the managed tenancy at ${i.address} as ${i.roleEn}. Accept or decline at the link above. If you don't recognize this, you can safely ignore this email or decline at the link.

— Stayloop · www.stayloop.ai`
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <div style="font-size:18px;font-weight:800;margin-bottom:4px">stay<span style="color:#1B1B3C">loop.AI</span></div>
  <p style="font-size:15px;line-height:1.7"><strong>${esc(i.inviterName)}</strong> 邀请你以「<strong>${esc(i.roleZh)}</strong>」身份加入 <strong>${esc(i.address)}</strong> 的在管租约。</p>
  <p style="font-size:13px;color:#555;line-height:1.7">在 Stayloop 上,租约各方可以在一个地方对话、报修、收租金提醒。点击下方按钮查看详情后再决定接受或拒绝。</p>
  <p style="margin:24px 0"><a href="${esc(i.joinUrl)}" style="background:#1B1B3C;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px">查看邀请 · View invitation</a></p>
  <p style="font-size:12px;color:#888;line-height:1.6">${esc(i.inviterName)} invited you to join the managed tenancy at ${esc(i.address)} as ${esc(i.roleEn)}. If you don't recognize this, ignore this email or decline at the link.</p>
</div>`
  return { subject, html, text }
}
