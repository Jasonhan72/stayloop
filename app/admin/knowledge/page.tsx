'use client'

// /admin/knowledge — the knowledge base: every source's current version and freshness, and the change
// queue (a source got a new version → which sections changed → which rules cite them → human review).
// Marking a change reviewed / no impact / rule updated clears the「待核对」badge on /rules and in the
// assistant. The rules table itself is edited in code (lib/ontario/rules.ts), never here.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useAdmin } from '@/lib/useAdmin'
import { useT } from '@/lib/i18n'

type SourceRow = { key: string; title: string; authority_level: number; url: string; refresh_every: string; document_id: string | null; consolidated_date: string | null; fetched_at: string | null; version_hash: string | null; chunks: number; stale: boolean }
type ChangeRow = { id: string; source_key: string; source_title: string; old_date: string | null; new_date: string | null; detected_at: string; sections_added: string[]; sections_removed: string[]; sections_changed: string[]; affected_rule_ids: string[]; status: 'pending' | 'reviewed' | 'no_impact' | 'rule_updated'; note: string | null; reviewed_at: string | null }

const STATUS_LABEL: Record<ChangeRow['status'], { zh: string; en: string }> = {
  pending: { zh: '待看', en: 'Pending' }, reviewed: { zh: '已看', en: 'Reviewed' }, no_impact: { zh: '无影响', en: 'No impact' }, rule_updated: { zh: '规则已更新', en: 'Rule updated' },
}

export default function AdminKnowledgePage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { loading, role } = useAdmin()
  const [sources, setSources] = useState<SourceRow[]>([])
  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const call = useCallback(async (method: string, body?: unknown) => {
    const { data: sess } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/knowledge', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token ?? ''}` }, body: body ? JSON.stringify(body) : undefined })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((j as { error?: string }).error || `HTTP ${res.status}`)
    return j
  }, [])
  const load = useCallback(async () => {
    try { const j = (await call('GET')) as { sources: SourceRow[]; changes: ChangeRow[] }; setSources(j.sources); setChanges(j.changes); setErr(null) } catch (e) { setErr((e as Error).message) }
  }, [call])
  useEffect(() => { if (!loading && role) void load() }, [loading, role, load])

  const setStatus = async (c: ChangeRow, status: ChangeRow['status']) => {
    setBusy(c.id)
    try { await call('PATCH', { id: c.id, status, note: notes[c.id] ?? c.note ?? '' }); await load() } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  if (loading) return null
  if (!role) return <div style={{ background: '#F3F8FC', minHeight: '100vh' }}><Header variant="solid" /><div className="mx-auto max-w-[800px] px-5 py-16 text-center text-body-2">{zh ? '仅限管理员。' : 'Admins only.'} <Link href="/" className="text-brand underline-offset-2 hover:underline">{zh ? '回首页' : 'Back home'}</Link></div></div>

  const pending = changes.filter((c) => c.status === 'pending')
  const staleCount = sources.filter((s) => s.stale).length
  return (
    <div style={{ background: '#F3F8FC', minHeight: '100vh' }}>
      <Header variant="solid" />
      <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-7">
        <Link href="/admin" className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3 hover:text-brand">← STAYLOOP ADMIN</Link>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-tight">{zh ? '知识库' : 'Knowledge base'}</h1>
        <p className="mt-2 max-w-[760px] text-[13.5px] text-body-2">
          {zh ? '每周一自动重读全部来源；原文变了就生成新版本并进这里的队列。队列里「待看」的变动会让涉及的规则在站上标「待核对」。规则表本身只在代码里改（lib/ontario/rules.ts）。' : 'Every source is re-read on Mondays; a changed text becomes a new version and lands in this queue. A pending change marks the rules it touches as "pending review" on the site. The rules table itself is edited in code (lib/ontario/rules.ts).'}
        </p>
        {err && <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">{err}</div>}

        <div className="mt-6 flex flex-wrap gap-3 text-[13px]">
          <span className="rounded-full border border-line-divider bg-white px-3 py-1" data-testid="kb-stats">{zh ? `来源 ${sources.length} 份 · 过期 ${staleCount} · 待看变动 ${pending.length}` : `${sources.length} sources · ${staleCount} stale · ${pending.length} pending changes`}</span>
        </div>

        <section className="mt-6 rounded-2xl border border-line-divider bg-white p-5" data-testid="kb-changes">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '变动队列' : 'Change queue'}</div>
          {changes.length === 0 && <p className="mt-3 text-[13.5px] text-body-3">{zh ? '还没有检测到变动。' : 'No changes detected yet.'}</p>}
          <div className="mt-3 divide-y divide-line-divider">
            {changes.map((c) => (
              <div key={c.id} className="py-3" data-testid="kb-change">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className={`rounded-full px-2 py-[2px] text-[11px] font-bold ${c.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-surface-chip text-body-2'}`}>{zh ? STATUS_LABEL[c.status].zh : STATUS_LABEL[c.status].en}</span>
                  <span className="font-semibold">{c.source_title}</span>
                  <span className="text-body-3">{c.old_date || '—'} → {c.new_date || '—'} · {zh ? '发现于' : 'detected'} {c.detected_at.slice(0, 10)}</span>
                </div>
                <div className="mt-1 text-[12.5px] text-body-2">
                  {zh ? '新增' : 'Added'} {c.sections_added.length} · {zh ? '删除' : 'Removed'} {c.sections_removed.length} · {zh ? '改动' : 'Changed'} {c.sections_changed.length}
                  {c.sections_changed.length > 0 && <span className="text-body-3">：{c.sections_changed.slice(0, 12).join('、')}{c.sections_changed.length > 12 ? ' …' : ''}</span>}
                </div>
                <div className="mt-1 text-[12.5px]">
                  {zh ? '涉及规则：' : 'Rules: '}
                  {c.affected_rule_ids.length ? c.affected_rule_ids.map((r) => <a key={r} href={`/rules#${r}`} className="mr-1.5 font-mono text-[11.5px] text-brand hover:underline">{r}</a>) : <span className="text-body-3">{zh ? '无' : 'none'}</span>}
                </div>
                {c.status === 'pending' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input value={notes[c.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))} placeholder={zh ? '备注（可选）' : 'Note (optional)'} className="sl-input !w-[260px] !py-1 !text-[12.5px]" />
                    {(['reviewed', 'no_impact', 'rule_updated'] as const).map((st) => (
                      <button key={st} type="button" disabled={busy === c.id} onClick={() => void setStatus(c, st)} className="rounded-full border border-line-strong px-3 py-1 text-[12.5px] font-semibold hover:border-brand hover:text-brand disabled:opacity-50">{zh ? STATUS_LABEL[st].zh : STATUS_LABEL[st].en}</button>
                    ))}
                  </div>
                )}
                {c.status !== 'pending' && c.note && <div className="mt-1 text-[12px] text-body-3">{zh ? '备注：' : 'Note: '}{c.note}</div>}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-line-divider bg-white p-5" data-testid="kb-sources">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '来源与版本' : 'Sources and versions'}</div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-body-3"><th className="py-1 pr-3">{zh ? '来源' : 'Source'}</th><th className="py-1 pr-3">{zh ? '级别' : 'Level'}</th><th className="py-1 pr-3">{zh ? '合并 / 更新日' : 'As of'}</th><th className="py-1 pr-3">{zh ? '上次抓取' : 'Fetched'}</th><th className="py-1 pr-3">{zh ? '块' : 'Chunks'}</th><th className="py-1">{zh ? '状态' : 'Status'}</th></tr></thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.key} className="border-t border-line-divider">
                    <td className="py-1.5 pr-3"><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{s.title}</a><div className="font-mono text-[10.5px] text-body-3">{s.key}</div></td>
                    <td className="py-1.5 pr-3">{s.authority_level}</td>
                    <td className="py-1.5 pr-3">{s.consolidated_date || '—'}</td>
                    <td className="py-1.5 pr-3">{s.fetched_at ? s.fetched_at.slice(0, 10) : '—'}</td>
                    <td className="py-1.5 pr-3">{s.chunks}</td>
                    <td className="py-1.5">{s.stale ? <span className="rounded-full bg-danger/10 px-2 py-[2px] text-[11px] font-bold text-danger">{zh ? '过期' : 'stale'}</span> : <span className="text-success">✓</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
