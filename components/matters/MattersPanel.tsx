'use client'

// The account's rental matters (节点 5): one card per tenancy-in-progress,
// application → screening → decision → lease → managed tenancy → repairs,
// with a link into each part and the delegated agent when there is one.
// Data = my_matters() (SECURITY DEFINER, party-checked, score-free). Sits on
// /x/progress, which the plan turns into the matter page.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { matterLinks, matterStage, matterTitle, STAGE_LABEL, STAGE_ORDER, type MatterSummary } from '@/lib/matters/shared'

export default function MattersPanel({ role, zh }: { role: 'tenant' | 'landlord' | 'agent'; zh: boolean }) {
  const auth = useAuth()
  const [rows, setRows] = useState<MatterSummary[] | null>(null)
  useEffect(() => {
    if (auth.loading || !auth.user) return
    let on = true
    supabase.rpc('my_matters').then(({ data, error }) => { if (!on) return; if (error) { console.warn('[matters]', error.message); setRows([]) } else setRows((Array.isArray(data) ? data : []) as MatterSummary[]) })
    return () => { on = false }
  }, [auth.loading, auth.user])
  if (rows === null) return null
  return (
    <div data-testid="matters-panel">
      <div className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '租赁事务' : 'RENTAL MATTERS'} <span className="ml-1 text-body-3">{rows.length}</span></div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line-divider bg-white p-5 text-[13px] text-body-3">{zh ? (role === 'agent' ? '客户确认委托后，TA 的租赁事务会出现在这里。' : '申请、租约或在管租约出现后，每件事在这里有一张卡：从申请到退租，同一个编号。') : (role === 'agent' ? 'Once a client confirms a delegation, their matters appear here.' : 'Each application, lease or tenancy becomes one card here — one id from application to move-out.')}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((m) => {
            const stage = matterStage(m)
            const idx = STAGE_ORDER.indexOf(stage)
            const links = matterLinks(m, role)
            return (
              <div key={m.id} className="rounded-2xl border border-line-divider bg-white p-4" data-testid="matter-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-[14px] font-bold">{matterTitle(m)}</div>
                  <span className="font-mono text-[10px] text-body-3" title={m.id}>{zh ? '事务' : 'matter'} {m.id.slice(0, 8)}</span>
                </div>
                <ol className="mt-2 flex flex-wrap gap-1" aria-label={zh ? '阶段' : 'stages'}>
                  {STAGE_ORDER.map((s, i) => <li key={s} className={'rounded-full px-2 py-[2px] font-mono text-[10px] font-bold ' + (i < idx ? 'bg-success/10 text-success' : i === idx ? 'bg-brand text-white' : 'bg-surface-chip text-body-3')}>{zh ? STAGE_LABEL[s].zh : STAGE_LABEL[s].en}</li>)}
                </ol>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
                  {links.map((l) => <Link key={l.key} href={l.href} className="font-semibold text-brand underline underline-offset-2">{zh ? l.zh : l.en}</Link>)}
                  <span className="text-body-3">{zh ? `对话 ${m.threads}` : `${m.threads} thread(s)`}</span>
                </div>
                {m.delegation && role !== 'agent' && <div className="mt-2 rounded-lg bg-agent/[0.06] px-2.5 py-1.5 text-[12px] text-body" data-testid="matter-delegation">{zh ? `受托经纪：${m.delegation.delegate_name || '—'} · ${m.delegation.scope.join('、')} · 到期 ${m.delegation.expires_at.slice(0, 10)}` : `Delegated agent: ${m.delegation.delegate_name || '—'} · ${m.delegation.scope.join(', ')} · until ${m.delegation.expires_at.slice(0, 10)}`}</div>}
                {role === 'agent' && <div className="mt-2 text-[11.5px] text-body-3">{zh ? `委托人：${m.tenant_email || '房东'}` : `Principal: ${m.tenant_email || 'landlord'}`}</div>}
              </div>
            )
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] text-body-3">{zh ? '一件事一个编号：申请、筛查、租约、在管租约、工单、对话与文件都挂在它上面；审计与导出也带它。这里只有状态，没有分数。' : 'One id per matter: application, screening, lease, tenancy, work orders, threads and files hang off it; audit rows and exports carry it. States only, never scores.'}</p>
    </div>
  )
}
