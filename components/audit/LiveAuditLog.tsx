'use client'

// The account's real audit trail (节点 2 · 清楚, 2026-09-26). /tenant/audit
// and /landlord/audit were design samples behind the demo gate while the
// assistant panel listed real events — the "审计记录冲突" of the external
// review. Each row answers: when · as which hat · did what · on which matter ·
// with what result. Rows come from agent_audit_events under the caller's own
// RLS (actor = self); conversation turns and session bookkeeping are not
// audit events and are filtered out.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { useReportLiveRows } from '@/lib/liveRows'
import { auditActionLabel } from '@/lib/agent/ideas'
import type { WorkspaceRole } from '@/components/workspace/rail'

type Row = { id: string; action: string; created_at: string; actor_type: string | null; acting_role: string | null; matter_type: string | null; matter_id: string | null; target_type: string | null; target_id: string | null; metadata: Record<string, unknown> | null }

const NOT_AUDIT = /session|turn$|thread_|_turn|reflect/
const HAT: Record<string, { zh: string; en: string }> = { tenant: { zh: '租客', en: 'Tenant' }, landlord: { zh: '房东', en: 'Landlord' }, agent: { zh: '经纪', en: 'Agent' }, provider: { zh: '服务商', en: 'Provider' }, admin: { zh: '管理员', en: 'Admin' }, self: { zh: '本人', en: 'Self' } }
const MATTER: Record<string, { zh: string; en: string }> = { lease: { zh: '租约', en: 'Lease' }, application: { zh: '申请', en: 'Application' }, household: { zh: '在管租约', en: 'Tenancy' }, work_order: { zh: '工单', en: 'Work order' }, ticket: { zh: '报修', en: 'Ticket' }, listing: { zh: '房源', en: 'Listing' }, screening: { zh: '筛查', en: 'Screening' } }

function matterHref(role: WorkspaceRole, type: string | null, id: string | null): string | null {
  if (!type || !id) return null
  switch (type) {
    case 'household': return `/h/${id}`
    case 'application': return role === 'landlord' ? `/landlord/applicants/${id}` : `/tenant/applications/${id}`
    case 'lease': return role === 'landlord' ? '/landlord/leases' : '/tenant/lease'
    case 'work_order': case 'ticket': return role === 'landlord' ? '/landlord/maintenance' : '/tenant/maintenance'
    case 'listing': return '/dashboard'
    case 'screening': return `/screening/app?screening=${id}`
    default: return null
  }
}

function outcome(r: Row, zh: boolean): { text: string; tone: 'ok' | 'bad' | 'muted' } {
  const m = r.metadata ?? {}
  if (m.ok === false || typeof m.error === 'string') return { text: zh ? `失败${typeof m.error === 'string' ? `：${(m.error as string).slice(0, 60)}` : ''}` : `Failed${typeof m.error === 'string' ? `: ${(m.error as string).slice(0, 60)}` : ''}`, tone: 'bad' }
  if (typeof m.sent_to === 'string') return { text: zh ? `已发送至 ${m.sent_to}` : `Sent to ${m.sent_to}`, tone: 'ok' }
  if (r.action.startsWith('executed_')) return { text: zh ? '已执行' : 'Done', tone: 'ok' }
  if (r.action === 'approval_undone' || r.action.includes('rejected')) return { text: zh ? '已撤销 / 拒绝' : 'Undone / declined', tone: 'muted' }
  return { text: '—', tone: 'muted' }
}

export default function LiveAuditLog({ role }: { role: WorkspaceRole }) {
  const auth = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'
  const [rows, setRows] = useState<Row[] | null>(null)
  useReportLiveRows('audit', rows ? rows.length : null)
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let cancelled = false
    supabase.from('agent_audit_events').select('id, action, created_at, actor_type, acting_role, matter_type, matter_id, target_type, target_id, metadata').eq('actor_id', auth.user.id).order('created_at', { ascending: false }).limit(120)
      .then(({ data }) => { if (!cancelled) setRows(((data ?? []) as Row[]).filter((r) => !NOT_AUDIT.test(r.action)).slice(0, 60)) })
    return () => { cancelled = true }
  }, [auth.loading, auth.user])
  if (!rows || rows.length === 0) return null
  const hatOf = (r: Row) => {
    const k = r.acting_role ?? (typeof r.metadata?.role === 'string' ? (r.metadata.role as string) : null) ?? (r.actor_type === 'system' ? 'system' : null)
    return k === 'system' ? (zh ? '系统' : 'System') : k && HAT[k] ? (zh ? HAT[k].zh : HAT[k].en) : '—'
  }
  return (
    <div className="mb-6 rounded-2xl border border-line-divider bg-white p-5" data-testid="live-audit">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '审计 · 真实记录' : 'AUDIT · LIVE'}</div>
        <div className="text-[11.5px] text-body-3">{zh ? '谁 · 以什么身份 · 做了什么 · 对象 · 结果。对话轮次不是审计事件。' : 'Who · as which hat · did what · on which matter · with what result. Chat turns are not audit events.'}</div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          <thead className="font-mono text-[10.5px] uppercase tracking-eyebrowLg text-body-3">
            <tr>{[zh ? '时间' : 'When', zh ? '身份' : 'Hat', zh ? '动作' : 'Action', zh ? '对象' : 'Matter', zh ? '结果' : 'Result'].map((h) => <th key={h} className="py-2 pr-3 font-bold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line-divider">
            {rows.map((r) => {
              const href = matterHref(role, r.matter_type, r.matter_id)
              const o = outcome(r, zh)
              const m = r.matter_type && MATTER[r.matter_type] ? (zh ? MATTER[r.matter_type].zh : MATTER[r.matter_type].en) : null
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-[11px] text-body-3">{new Date(r.created_at).toLocaleString(zh ? 'zh-CN' : 'en-CA', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                  <td className="py-2 pr-3">{hatOf(r)}</td>
                  <td className="py-2 pr-3">{auditActionLabel(r.action, lang, r.metadata || undefined)}</td>
                  <td className="py-2 pr-3">{m ? (href ? <Link href={href} className="underline underline-offset-2">{m}<span className="ml-1 font-mono text-[10.5px] text-body-3">{r.matter_id!.slice(0, 8)}</span></Link> : m) : '—'}</td>
                  <td className={'py-2 ' + (o.tone === 'bad' ? 'text-danger' : o.tone === 'ok' ? 'text-success' : 'text-body-3')}>{o.text}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
