// The AI Agent panel's four tabs (2026-11-27, user: 「把我们 agent 的控制页面也改成和这个类似，
// 尤其是功能上」, with four screenshots of the Muse panel): 任务 · 批准 · 身份 · 收件.
//
//   tasks      what it does on a schedule (例行任务) and what happened today
//   approvals  what waits on the person, and the record of every card it ever proposed
//   identity   who it is: name · 风格, 人设, 记忆 — plus the model and push it runs with
//   inbox      what other people wrote to the person (the message centre's threads)
//
// Pure: the page, the panel and the tests share it.

export type PanelTab = 'tasks' | 'approvals' | 'identity' | 'inbox'
/** What a ?panel= link may ask for: a tab, or 'memory' = 身份 opened on its 记忆 page. */
export type PanelRequest = PanelTab | 'memory'

export const PANEL_TABS: readonly PanelTab[] = ['tasks', 'approvals', 'identity', 'inbox']

export function isPanelTab(v: unknown): v is PanelTab {
  return typeof v === 'string' && (PANEL_TABS as readonly string[]).includes(v)
}

/** ?panel=… → a request, or null for anything else. The three names the panel had until
 *  2026-11-27 keep working, because links to them are out there (the progress page's 记忆 line,
 *  bookmarks): todo → 批准 (what waits on you), memory → 身份 › 记忆, settings → 身份. */
export function panelRequest(v: string | null | undefined): PanelRequest | null {
  if (isPanelTab(v)) return v
  if (v === 'memory') return 'memory'
  if (v === 'todo') return 'approvals'
  if (v === 'settings') return 'identity'
  return null
}

export function tabOfRequest(r: PanelRequest): PanelTab {
  return r === 'memory' ? 'identity' : r
}
