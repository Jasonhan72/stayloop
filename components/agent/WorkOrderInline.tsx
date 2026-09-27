'use client'

// A work-order approval card shows the live work order and its thread inline
// (节点 5: "维修全套动作从卡片直接完成并回写"). The landlord can approve /
// reject / rework / dispute / mark paid right here; the server expires the
// matching pending card after a hub-style decision, and the caller refreshes
// the to-do list.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import WorkOrderCard, { type WorkOrderLite } from '@/components/marketplace/WorkOrderCard'
import ThreadPanel from '@/components/threads/ThreadPanel'
import { WORK_ORDER_COLUMNS } from '@/lib/marketplace/workOrders'
import { notifyPendingChanged } from '@/lib/agent/pendingCount'

export default function WorkOrderInline({ workOrderId, zh }: { workOrderId: string; zh: boolean }) {
  const [wo, setWo] = useState<WorkOrderLite | null | 'missing'>(null)
  const [name, setName] = useState<string | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('work_orders').select(WORK_ORDER_COLUMNS).eq('id', workOrderId).maybeSingle()
    const row = (data as unknown as WorkOrderLite | null) ?? null
    setWo(row ?? 'missing')
    if (row?.provider_id) {
      const { data: p } = await supabase.from('provider_directory').select('legal_name, trade_name').eq('id', row.provider_id).maybeSingle()
      if (p) setName((p as { trade_name: string | null; legal_name: string }).trade_name || (p as { legal_name: string }).legal_name)
    }
  }, [workOrderId])
  useEffect(() => { void load() }, [load])
  if (!wo || wo === 'missing') return null
  return (
    <div className="mt-4 space-y-2" data-testid="work-order-inline">
      <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">{zh ? '工单 · 可直接操作' : 'WORK ORDER · ACT HERE'}</div>
      <WorkOrderCard wo={wo} viewer="landlord" zh={zh} providerName={name} onChange={async () => { await load(); notifyPendingChanged() }} compact />
      <ThreadPanel kind="work_order" refId={wo.id} viewer="landlord" zh={zh} compact title={zh ? '工单对话' : 'Work-order thread'} />
    </div>
  )
}
