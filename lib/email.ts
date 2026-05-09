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
                  <a href="${i.dashboardUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">Review application →</a>
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
