'use client'

// Shared move-in checklist on a household (P2 2026-09-23). Either party
// ticks; the tick records who and when. Notes are free text (key counts,
// insurer + expiry) and are visible to both sides. No photos are stored.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { MOVE_IN_ITEMS, moveInProgress } from '@/lib/household/moveIn'

type Row = { item_key: string; done: boolean; done_by: string | null; done_at: string | null; note: string | null }

const GROUP_LABEL = {
  photos: { zh: '入住状态照片（7 天内拍完）', en: 'Move-in condition photos (within 7 days)' },
  handover: { zh: '交接实物', en: 'Handover' },
  paperwork: { zh: '文件与保险', en: 'Paperwork & insurance' },
}

export default function MoveInChecklist({ householdId, zh, compact = false }: { householdId: string; zh: boolean; compact?: boolean }) {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('move_in_checklist').select('item_key, done, done_by, done_at, note').eq('household_id', householdId)
    setRows((data ?? []) as Row[])
  }, [householdId])
  useEffect(() => { void load() }, [load])
  if (!rows) return null
  const byKey = new Map(rows.map((r) => [r.item_key, r]))
  const progress = moveInProgress(rows)

  async function toggle(key: string, nextDone: boolean, noteOnly = false) {
    if (!user) return
    setBusy(key)
    const prev = byKey.get(key)
    const note = (noteDraft[key] ?? prev?.note ?? '').trim().slice(0, 500) || null
    // A note edit must not re-stamp who ticked and when (review 2026-09-23).
    const row = noteOnly && prev
      ? { household_id: householdId, item_key: key, done: prev.done, done_by: prev.done_by, done_at: prev.done_at, note }
      : { household_id: householdId, item_key: key, done: nextDone, done_by: nextDone ? user.id : null, done_at: nextDone ? new Date().toISOString() : null, note }
    const { error } = await supabase.from('move_in_checklist').upsert(row, { onConflict: 'household_id,item_key' })
    setErr(error ? error.message : null)
    await load()
    setBusy(null)
  }

  const groups = (['photos', 'handover', 'paperwork'] as const).map((g) => ({ g, items: MOVE_IN_ITEMS.filter((i) => i.group === g) }))
  return (
    <section className="rounded-xl border border-line-divider bg-white p-5" data-testid="move-in-checklist">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-extrabold">{zh ? '入住清单' : 'Move-in checklist'}</h2>
        <span className="font-mono text-[11px] font-bold text-body-3">{progress.done}/{progress.total}</span>
      </div>
      <p className="mt-1 text-[11.5px] text-body-3">{zh ? '双方都能勾选，勾选记录谁在什么时候确认。押金与保险两条各带安省规则。' : 'Either party can tick; each tick records who and when. Deposit and insurance carry their Ontario rule.'}</p>
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
      <div className={'mt-3 space-y-4 ' + (compact ? 'text-[12.5px]' : 'text-[13px]')}>
        {groups.map(({ g, items }) => (
          <div key={g}>
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-body-3">{zh ? GROUP_LABEL[g].zh : GROUP_LABEL[g].en}</div>
            <div className="mt-1.5 divide-y divide-line-divider rounded-xl border border-line-divider">
              {items.map((it) => {
                const r = byKey.get(it.key)
                const done = !!r?.done
                return (
                  <div key={it.key} className="px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <button type="button" role="checkbox" aria-checked={done} aria-label={zh ? it.label.zh : it.label.en} disabled={busy === it.key} onClick={() => void toggle(it.key, !done)}
                        className="-m-1.5 flex h-9 w-9 flex-none items-center justify-center p-1.5">
                        <span className={'flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ' + (done ? 'bg-success text-white' : 'border border-line-strong text-body-3')}>{done ? '✓' : ''}</span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={done ? 'text-body' : 'text-body-2'}>{zh ? it.label.zh : it.label.en}
                          {r?.done_at && <span className="ml-2 font-mono text-[10.5px] text-body-3">{r.done_at.slice(0, 10)}{r.done_by === user?.id ? (zh ? ' · 我' : ' · me') : ''}</span>}
                        </div>
                        {it.note && !compact && <div className="mt-0.5 text-[11.5px] text-body-3">{zh ? it.note.zh : it.note.en}</div>}
                        {it.needsNote && (
                          <input
                            value={noteDraft[it.key] ?? r?.note ?? ''}
                            onChange={(e) => setNoteDraft((d) => ({ ...d, [it.key]: e.target.value }))}
                            onBlur={() => { if ((noteDraft[it.key] ?? '') !== (r?.note ?? '') && noteDraft[it.key] !== undefined) void toggle(it.key, done, true) }}
                            placeholder={zh ? it.needsNote.zh : it.needsNote.en}
                            className="mt-1 w-full max-w-[360px] rounded-md border border-line-divider px-2 py-1 text-[12px]"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
