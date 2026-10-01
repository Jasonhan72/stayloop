// The delegation confirmation email — shared by the proposal (POST /api/delegations)
// and the resend action (POST /api/delegations/[id] { action: 'resend' }). Whether it
// actually left is stored on the row (link_emailed / link_emailed_at), so the client
// book never says 「链接已发到客户邮箱」 for a send that failed (sweep 2026-10-01).
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, renderAgentMessageEmail } from '@/lib/email'
import { ensureThread, replyTokenFor } from '@/lib/threads/server'
import { replyAddress } from '@/lib/threads/emailReply'
import { ACTION_LABEL, BASIS_VERSION, SCOPE_LABEL, type DelegationAction, type DelegationScope } from '@/lib/delegations/shared'

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')

export type LinkEmailArgs = {
  delegationId: string
  token: string
  /** Where the link goes: the delegation's principal_email (the address the confirm is bound to). */
  to: string
  clientName: string
  clientId: string | null
  clientRole: string | null
  agentAuthId: string
  agent: { legal_name: string; reco_number: string; brokerage_name: string }
  scope: DelegationScope[]
  actions: DelegationAction[]
  expiresAt: string
}

export async function sendDelegationLink(admin: SupabaseClient, a: LinkEmailArgs): Promise<boolean> {
  const link = `${SITE()}/delegate/${a.token}`
  const scopeZh = a.scope.map((s) => SCOPE_LABEL[s]?.zh ?? s).join('、'); const scopeEn = a.scope.map((s) => SCOPE_LABEL[s]?.en ?? s).join(', ')
  const actZh = a.actions.map((x) => ACTION_LABEL[x]?.zh ?? x).join('、'); const actEn = a.actions.map((x) => ACTION_LABEL[x]?.en ?? x).join(', ')
  const until = a.expiresAt.slice(0, 10)
  const p = a.agent
  const subject = `经纪 ${p.legal_name} 请你确认委托 / ${p.legal_name} asks you to confirm a delegation`
  const text =
    `${a.clientName} 你好，\n\n经纪 ${p.legal_name}（RECO 注册号 ${p.reco_number} · ${p.brokerage_name}）请求你确认一份 Stayloop 委托：\n\n  • 范围：${scopeZh}\n  • 允许的动作：${actZh}\n  • 有效期至：${until}\n  • 依据：你们已签署的书面代表协议（${BASIS_VERSION}）\n\n请用这个邮箱（${a.to}）登录 Stayloop 后打开链接确认；你随时可以在「设置 → 委托」里撤销，撤销立即生效。\n${link}\n\n` +
    `Hi ${a.clientName},\n\n${p.legal_name} (RECO #${p.reco_number}, ${p.brokerage_name}) asks you to confirm a Stayloop delegation:\n\n  • Scope: ${scopeEn}\n  • Allowed actions: ${actEn}\n  • Until: ${until}\n  • Basis: your signed written representation agreement (${BASIS_VERSION})\n\nSign in to Stayloop with this email (${a.to}) and open the link to confirm; you can revoke any time under Settings → Delegations, effective immediately.\n${link}`
  const { html, text: plain } = renderAgentMessageEmail({ subject, body: text })
  // Relay (消息系统 A 期): the client's reply lands in the agent ↔ client conversation.
  const th = a.clientId ? await ensureThread(admin, 'agent_client', a.clientId, { title: a.clientName, createdBy: a.agentAuthId }) : null
  const tok = th ? await replyTokenFor(admin, th.id, a.to, { kind: a.clientRole === 'landlord' ? 'landlord' : 'tenant', userId: null, label: a.clientName }) : null
  const sent = await sendEmail({ to: a.to, subject, html, text: plain, replyTo: tok ? replyAddress(tok) : undefined, fromName: `${p.legal_name} 经 Stayloop` })
  // Best-effort: before the A8 migration the columns do not exist and this is a no-op.
  await admin.from('delegations').update({ link_emailed: sent.ok, link_emailed_at: new Date().toISOString() }).eq('id', a.delegationId).then(() => undefined, () => undefined)
  return sent.ok
}
