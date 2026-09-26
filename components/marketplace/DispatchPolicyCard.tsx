'use client'

// Services marketplace P2 (V0.6): the landlord's dispatch policy. Reads and
// writes the caller's own dispatch_policies row through RLS; the rule lives in
// lib/marketplace/dispatchPolicy.ts and the server enforces it. Payment stays
// offline — this only decides WHO gets the job and whether an emergency quote
// under a cap may go ahead without a click.
import { useEffect, useState } from 'react'
import { SectionCard } from '@/components/workspace'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { DEFAULT_POLICY, EMERGENCY_CAP_MAX, normalizePolicy, type DispatchMode, type DispatchPolicy, MODE_LABEL } from '@/lib/marketplace/dispatchPolicy'
import { TRADES, type Trade } from '@/lib/marketplace/trades'

export type PolicyProvider = { id: string; name: string; coveredTrades: Trade[] }

const MODES: { key: DispatchMode; zh: string; en: string; zhSub: string; enSub: string }[] = [
  { key: 'suggest', ...MODE_LABEL.suggest, zhSub: '每张报修都给你一张派单卡，你点了才派。', enSub: 'Every ticket becomes a dispatch card; nothing is sent until you approve.' },
  { key: 'auto_emergency', ...MODE_LABEL.auto_emergency, zhSub: '无暖气、停水、燃气、门锁这类紧急件立即派给排第一的服务商；其余仍给你卡片。', enSub: 'No heat, water, gas or locks go straight to the top provider; everything else is a card.' },
  { key: 'auto_all', ...MODE_LABEL.auto_all, zhSub: '每张报修都立即派给排第一的服务商，你会收到通知，可在工单页取消或改派。', enSub: 'Every ticket goes to the top provider at once; you are notified and can cancel or reassign.' },
]

export default function DispatchPolicyCard({ providers, zh }: { providers: PolicyProvider[]; zh: boolean }) {
  const auth = useAuth()
  const [policy, setPolicy] = useState<DispatchPolicy>({ ...DEFAULT_POLICY, preferred: {} })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (auth.loading || !auth.user) return
    supabase.from('dispatch_policies').select('mode, emergency_auto_approve, emergency_cap, preferred').eq('landlord_auth_id', auth.user.id).maybeSingle()
      .then(({ data }) => { setPolicy(normalizePolicy(data as never)); setLoaded(true) })
  }, [auth.loading, auth.user])

  async function save(next: DispatchPolicy) {
    if (!auth.user) return
    setPolicy(next); setSaving(true); setMsg(null)
    const { error } = await supabase.from('dispatch_policies').upsert({ landlord_auth_id: auth.user.id, ...next, updated_at: new Date().toISOString() })
    setSaving(false)
    setMsg(error ? error.message : (zh ? '已保存' : 'Saved'))
  }

  const trades = TRADES.filter((t) => providers.some((p) => p.coveredTrades.includes(t.key)))

  return (
    <SectionCard className="mb-4" title={zh ? '派单策略' : 'Dispatch policy'} meta={saving ? '…' : msg ?? ''}>
      <div data-testid="dispatch-policy" className={loaded ? '' : 'opacity-50'}>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <label key={m.key} className={'cursor-pointer rounded-xl border p-3 text-[13px] ' + (policy.mode === m.key ? 'border-brand bg-brand/5' : 'border-line-divider bg-white')}>
              <input type="radio" name="dispatch-mode" className="mr-2" checked={policy.mode === m.key} disabled={!loaded} onChange={() => save({ ...policy, mode: m.key })} />
              <span className="font-bold">{zh ? m.zh : m.en}</span>
              <span className="mt-1 block text-[12px] leading-relaxed text-body-3">{zh ? m.zhSub : m.enSub}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-line-divider p-3 text-[13px]">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-[3px]" checked={policy.emergency_auto_approve} disabled={!loaded} onChange={(e) => save({ ...policy, emergency_auto_approve: e.target.checked })} />
            <span>
              <span className="font-bold">{zh ? '紧急报价预授权' : 'Pre-approve emergency quotes'}</span>
              <span className="mt-1 block text-[12px] leading-relaxed text-body-3">{zh ? '紧急件的报价不超过下面的上限时直接批准并通知租客（RTA s.26 紧急进入），你会收到通知；超过上限仍需你点头。最终账单仍不得超出报价 10%。非紧急报价永远需要你批准。' : 'An emergency quote at or under the cap is approved at once and the tenant is notified (RTA s.26 emergency entry); you get a notification. Above the cap it still needs you. The invoice still may not exceed the quote by more than 10%. Non-emergency quotes always need your approval.'}</span>
            </span>
          </label>
          <div className="mt-2 flex items-center gap-2 pl-6">
            <span className="text-[12.5px] text-body-2">{zh ? '上限 $' : 'Cap $'}</span>
            <input type="number" inputMode="numeric" min={0} max={EMERGENCY_CAP_MAX} step={50} value={policy.emergency_cap} disabled={!loaded || !policy.emergency_auto_approve}
              onChange={(e) => setPolicy({ ...policy, emergency_cap: Number(e.target.value) })}
              onBlur={() => save(normalizePolicy(policy))}
              className="w-28 rounded-lg border border-line-divider px-2 py-1 text-[16px] md:text-[13px]" />
            <span className="text-[11.5px] text-body-3">{zh ? `最高 $${EMERGENCY_CAP_MAX}` : `max $${EMERGENCY_CAP_MAX}`}</span>
          </div>
        </div>

        <div className="mt-4 text-[13px]">
          <div className="font-bold">{zh ? '各工种首选' : 'Preferred per trade'}</div>
          <p className="mt-1 text-[12px] text-body-3">{zh ? '首选排在候选第一位（前提是资质仍有效、覆盖该城市）；没设时按你以前验收过的单数、评分、接单率排序。' : 'Your pick is tried first (while its credentials are valid and it serves the city); otherwise ranked by jobs you accepted, ratings and acceptance rate.'}</p>
          {trades.length === 0 ? <p className="mt-2 text-[12px] text-body-3">{zh ? '精选网络里还没有资质齐全的服务商。' : 'No fully credentialed provider in the network yet.'}</p> : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {trades.map((t) => (
                <label key={t.key} className="flex min-w-0 items-center gap-2">
                  <span className="w-20 flex-none text-[12.5px] text-body-2">{zh ? t.zh : t.en}</span>
                  <select value={policy.preferred[t.key] ?? ''} disabled={!loaded}
                    onChange={(e) => { const preferred = { ...policy.preferred }; if (e.target.value) preferred[t.key] = e.target.value; else delete preferred[t.key]; save({ ...policy, preferred }) }}
                    className="min-w-0 flex-1 rounded-lg border border-line-divider bg-white px-2 py-1.5 text-[16px] md:text-[12.5px]">
                    <option value="">{zh ? '自动排序' : 'Auto-rank'}</option>
                    {providers.filter((p) => p.coveredTrades.includes(t.key)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
