'use client'

// Shared move-in checklist on a household (P2 2026-09-23). Either party
// ticks; the tick records who and when. Notes are free text (key counts,
// insurer + expiry) and are visible to both sides. No photos are stored.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { checklistWrite, moveInItemsFor, moveInProgress, normalizeChecklistNote, type ChecklistAction } from '@/lib/household/moveIn'

type Row = { item_key: string; done: boolean; done_by: string | null; done_at: string | null; note: string | null }

const GROUP_LABEL = {
  photos: { zh: '入住状态照片（7 天内拍完）', en: 'Move-in condition photos (within 7 days)' },
  handover: { zh: '交接实物', en: 'Handover' },
  paperwork: { zh: '文件与保险', en: 'Paperwork & insurance' },
}

export default function MoveInChecklist({ householdId, zh, compact = false, province = 'ON' }: { householdId: string; zh: boolean; compact?: boolean; province?: string | null }) {
  // The paperwork notes are the tenancy's province's (lib/household/moveIn, 2026-10-06).
  const items = moveInItemsFor(province)
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
  // Both parties edit this list; refresh when the tab comes back so a stale page does not
  // show (and act on) the state from when it was opened.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])
  if (!rows) return null
  const byKey = new Map(rows.map((r) => [r.item_key, r]))
  const progress = moveInProgress(rows, items)

  // Writes only the changed columns (checklistWrite): a tick never carries a note, a note
  // never carries who ticked — the other party's tick or note survives a stale page.
  async function write(key: string, action: ChecklistAction) {
    if (!user) return
    setBusy(key)
    const { error } = await supabase.from('move_in_checklist').upsert(checklistWrite(householdId, key, action), { onConflict: 'household_id,item_key' })
    setErr(error ? (error.code === '42501' || /row-level security/i.test(error.message) ? (zh ? '没有保存成功：只有这份租约的成员可以修改清单。' : 'Not saved: only members of this tenancy can edit the checklist.') : error.message) : null)
    await load()
    // Drop the local draft once saved so the input shows the stored value (and later edits by the other party).
    if (!error && action.kind === 'note') setNoteDraft((d) => { const n = { ...d }; delete n[key]; return n })
    setBusy(null)
  }

  const groups = (['photos', 'handover', 'paperwork'] as const).map((g) => ({ g, items: items.filter((i) => i.group === g) }))
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
                      <button type="button" role="checkbox" aria-checked={done} aria-label={zh ? it.label.zh : it.label.en} disabled={busy === it.key} onClick={() => void write(it.key, { kind: 'tick', done: !done, userId: user?.id ?? '' })}
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
                            onBlur={() => {
                              const draft = noteDraft[it.key]
                              if (draft === undefined) return
                              if (normalizeChecklistNote(draft) !== normalizeChecklistNote(r?.note)) void write(it.key, { kind: 'note', note: draft })
                              else setNoteDraft((d) => { const n = { ...d }; delete n[it.key]; return n })
                            }}
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
