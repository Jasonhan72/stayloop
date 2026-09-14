'use client'

// "找经纪帮我完成" — the tenant picks a VERIFIED agent from Stayloop's
// directory and contacts them directly. Stayloop does not dispatch, does not
// take part in the trade and charges nothing (design/roles-and-agent-
// verification-2026-09.md §4, user decision 2026-09-13). Every card shows
// the registered name, permitted descriptor and brokerage (O. Reg. 567/05
// s.12.1) and links to RECO's register and complaints desk.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { AgentBadge } from '@/components/AgentBadge'
import { RECO_REGISTER_URL, categoryLabel, type AgentProfile } from '@/lib/agentProfile'

type Row = Pick<AgentProfile, 'auth_id' | 'legal_name' | 'reco_number' | 'category' | 'brokerage_name' | 'business_email' | 'business_phone' | 'crea_member' | 'verified_at' | 'status'>

export function AgentPicker({ zh, listingAddress, onClose, excludeAuthIds = [] }: { zh: boolean; listingAddress: string; onClose: () => void; excludeAuthIds?: Array<string | null | undefined> }) {
  const lang: 'zh' | 'en' = zh ? 'zh' : 'en'
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    // agent_directory = the public columns of verified profiles only; the
    // base table stays self/admin (review 2026-09-14: the table-wide grant
    // exposed admin review notes and trade names to anon).
    supabase.from('agent_directory')
      .select('auth_id, legal_name, reco_number, category, brokerage_name, business_email, business_phone, crea_member, verified_at, status')
      .order('verified_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        // Cross-hat rule: the listing's own landlord (who may also be an
        // agent) and the viewer never appear as a pick for this listing.
        const ex = new Set(excludeAuthIds.filter((x): x is string => !!x))
        setRows(((data || []) as Row[]).filter(r => !ex.has(r.auth_id)))
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const subject = encodeURIComponent(zh ? `Stayloop 房源咨询：${listingAddress}` : `Stayloop listing enquiry: ${listingAddress}`)
  const body = encodeURIComponent(zh ? `你好，我在 Stayloop 上看到 ${listingAddress}，想请你协助看房 / 申请。` : `Hello, I found ${listingAddress} on Stayloop and would like your help with a showing / application.`)

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/50 p-3" onClick={onClose}>
      <div className="max-h-full w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '找经纪帮我完成' : 'Find an agent to help'}</div>
            <h3 className="mt-1 text-[18px] font-bold tracking-tight">{zh ? '在 Stayloop 上认证的经纪' : 'Agents verified on Stayloop'}</h3>
          </div>
          <button onClick={onClose} className="-mr-2 min-h-[44px] px-3 text-body-3">{zh ? '关闭' : 'Close'}</button>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
          {zh
            ? '你直接联系经纪，由你们双方约定服务与代表关系。Stayloop 不是经纪公司，不参与交易，不向你或经纪收取任何费用。经纪在提供服务前应给你 RECO Information Guide 并签订书面代表协议。'
            : 'You contact the agent directly and agree the services and representation between you. Stayloop is not a brokerage, takes no part in the trade and charges neither you nor the agent. Before any service the agent should give you the RECO Information Guide and a written representation agreement.'}
        </p>
        <div className="mt-4 space-y-3">
          {rows === null && <div className="h-16 animate-pulse rounded-xl bg-surface-muted" />}
          {rows && rows.length === 0 && (
            <div className="rounded-xl border border-line-divider p-4 text-[13px] text-body-3">
              {zh ? '目前还没有完成认证的经纪。你可以直接在 RECO 注册库查找持牌经纪。' : 'No verified agents yet. You can look up a registered agent on the RECO register.'}{' '}
              <a href={RECO_REGISTER_URL} target="_blank" rel="noopener noreferrer" className="underline">RECO ↗</a>
            </div>
          )}
          {rows?.map(a => (
            <div key={a.auth_id} className="rounded-xl border border-line-divider p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[15px] font-bold">{a.legal_name}</div>
                <AgentBadge agent={a} lang={lang} compact />
              </div>
              <div className="mt-0.5 text-[12.5px] text-body-2">{categoryLabel(a.category, lang)}{a.crea_member ? ' · REALTOR®' : ''} · <b>{a.brokerage_name}</b>{zh ? '（经纪公司）' : ' (brokerage)'}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {a.business_email && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(a.business_email) && <a href={`mailto:${encodeURIComponent(a.business_email)}?subject=${subject}&body=${body}`} className="sl-btn-primary !px-4 !py-2 text-[13px]">{zh ? '发邮件' : 'Email'}</a>}
                {a.business_phone && <a href={`tel:${a.business_phone.replace(/[^\d+]/g, '')}`} className="rounded-full border border-line-strong px-4 py-2 text-[13px] font-semibold">{zh ? '打电话' : 'Call'}</a>}
                {!a.business_email && !a.business_phone && <span className="text-[12px] text-body-3">{zh ? '未留联系方式' : 'No contact details given'}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-[11.5px] leading-relaxed text-body-3">
          {zh ? '你是持牌经纪？' : 'Are you a registered agent?'} <Link href="/agent/verify" className="underline">{zh ? '在 Stayloop 上完成认证' : 'Get verified on Stayloop'}</Link>
        </div>
      </div>
    </div>
  )
}
