// "今日" — what needs the person's attention today (proposal 2026-09-23
// §3.5, P2). Pure and deterministic: it folds the lifecycle rail (clocks,
// current steps, next actions) and the pending approvals into one short
// list. No model call, no scores, at most MAX_ITEMS entries.
import type { Lifecycle, Phase, Bi } from './stages'

export type TodayItem = {
  id: string
  kind: 'approval' | 'clock' | 'step' | 'next'
  tone: 'late' | 'warn' | 'info'
  text: Bi
  href?: string
  prompt?: Bi
}

export type TodayPending = { id: string; action_type: string; title: string }

export const MAX_ITEMS = 6

function clockItem(p: Phase): TodayItem | null {
  if (!p.clock) return null
  const c = p.clock
  // "Today" means within two weeks or overdue, whatever the rail's colour says.
  if (c.days > 14) return null
  const zh = c.days < 0 ? `${c.label.zh} ${c.date}（已过 ${-c.days} 天）` : c.days === 0 ? `${c.label.zh} 今天` : `${c.label.zh} ${c.date}（还有 ${c.days} 天）`
  const en = c.days < 0 ? `${c.label.en} ${c.date} (${-c.days} days ago)` : c.days === 0 ? `${c.label.en} today` : `${c.label.en} ${c.date} (${c.days} days)`
  return { id: `clock:${p.key}`, kind: 'clock', tone: c.tone === 'ok' ? 'info' : c.tone, text: { zh, en }, href: p.next?.href ?? p.steps.find((s) => s.state === 'current')?.href, prompt: p.next?.prompt }
}

export function buildToday(lifecycle: Lifecycle | null, pending: TodayPending[], todoHref: string, opts: { omitPending?: boolean } = {}): TodayItem[] {
  const out: TodayItem[] = []
  // 1) Approvals — always first, one line, never one per card. On the to-do
  // page itself the cards are listed right below, so the line is omitted
  // (three-role test report 2026-09-24, SL-L-02: 今日 and 待批准 showed the
  // same tasks twice).
  if (pending.length && !opts.omitPending) {
    out.push({
      id: 'approvals',
      kind: 'approval',
      tone: 'warn',
      text: pending.length === 1
        ? { zh: `等你点头：${pending[0].title}`, en: `Waiting on you: ${pending[0].title}` }
        : { zh: `${pending.length} 件事等你点头 · 最早：${pending[0].title}`, en: `${pending.length} waiting on you · first: ${pending[0].title}` },
      href: todoHref,
    })
  }
  if (!lifecycle) return out
  // 2) Clocks that are close (≤14 days) or overdue.
  const clocks = lifecycle.phases.map(clockItem).filter(Boolean) as TodayItem[]
  clocks.sort((a, b) => (a.tone === 'late' ? -1 : b.tone === 'late' ? 1 : 0))
  out.push(...clocks)
  // 3) Current steps with a detail line (e.g. "2 份未筛查", "1 期待付").
  for (const p of lifecycle.phases) {
    for (const s of p.steps) {
      // Only steps whose detail carries a count ("2 份未筛查"); static hints are not to-dos.
      if (s.state !== 'current' || !s.detail || !/^\d/.test(s.detail.zh)) continue
      // A step that only points at the to-do list ("2 条等你回复") is the same
      // cards as the approvals line / the list — never a second entry.
      if (s.href === todoHref && (pending.length || opts.omitPending)) continue
      out.push({ id: `step:${p.key}:${s.key}`, kind: 'step', tone: 'info', text: { zh: `${s.label.zh}：${s.detail.zh}`, en: `${s.label.en}: ${s.detail.en}` }, href: s.href, prompt: s.prompt })
    }
  }
  // 4) The current phase's next action when nothing above already points there.
  const cur = lifecycle.phases.find((p) => p.key === lifecycle.current)
  if (cur?.next && !out.some((i) => i.href && i.href === cur.next!.href)) {
    out.push({ id: `next:${cur.key}`, kind: 'next', tone: 'info', text: { zh: `下一步：${cur.next.label.zh}`, en: `Next: ${cur.next.label.en}` }, href: cur.next.href, prompt: cur.next.prompt })
  }
  // Dedupe by text, cap.
  const seen = new Set<string>()
  return out.filter((i) => (seen.has(i.text.zh) ? false : (seen.add(i.text.zh), true))).slice(0, MAX_ITEMS)
}
