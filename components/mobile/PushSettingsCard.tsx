'use client'

// 通知 — three positions, like Muse's "off / dial down / default"
// (2026-09-22). Off = no subscription; 少 = only cards waiting for your
// decision; 默认 = those plus genuinely new events (a new application, a
// showing request). Nothing "done" is ever pushed.
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { disablePush, enablePush, getPushState, setPushLevel, type PushState } from '@/lib/push/client'
import type { PushLevel } from '@/lib/push/notify'

export default function PushSettingsCard({ live, frameless = false }: { live: boolean; /** Inside another card (the assistant's settings tab): no card chrome of its own. */ frameless?: boolean }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const refresh = async () => { try { setState(await getPushState()) } catch { setState({ supported: false, needsInstall: false, permission: 'unsupported', subscribed: false, level: 'default' }) } }
  useEffect(() => { void refresh() }, [])

  const choose = async (pos: 'off' | PushLevel) => {
    if (!live) return
    setBusy(true); setNote(null)
    try {
      if (pos === 'off') { await disablePush() }
      else if (!state?.subscribed) {
        const r = await enablePush(pos)
        if (!r.ok) setNote(r.reason === 'denied' ? (zh ? '浏览器已拒绝通知权限；请在浏览器设置里重新允许。' : 'Notifications are blocked in the browser; re-allow them in the browser settings.') : (zh ? `没能开启：${r.reason}` : `Could not enable: ${r.reason}`))
      } else { await setPushLevel(pos) }
      await refresh()
    } finally { setBusy(false) }
  }

  const [testMsg, setTestMsg] = useState<string | null>(null)
  const sendTest = async () => {
    setBusy(true); setTestMsg(null)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const res = await fetch('/api/push/test', { method: 'POST', headers: { Authorization: `Bearer ${sess.session?.access_token ?? ''}` } })
      const j = (await res.json().catch(() => ({}))) as { sent?: number; error?: string }
      setTestMsg(res.ok ? (zh ? `已发送到 ${j.sent ?? 0} 台设备。` : `Sent to ${j.sent ?? 0} device(s).`) : (zh ? `发送失败：${j.error || res.status}` : `Failed: ${j.error || res.status}`))
    } finally { setBusy(false) }
  }
  const current: 'off' | PushLevel = state?.subscribed ? state.level : 'off'
  const seg = (pos: 'off' | PushLevel, label: string) => (
    <button
      type="button"
      key={pos}
      disabled={busy || !live || !state?.supported}
      onClick={() => choose(pos)}
      className={'flex-1 rounded-full px-3 py-2 text-[13px] font-semibold transition disabled:opacity-60 ' + (current === pos ? 'bg-brand text-white' : 'bg-white text-body-2')}
    >
      {label}
    </button>
  )

  return (
    <div className={frameless ? '' : 'sl-card p-5'}>
      <div className="flex items-center justify-between">
        <h4 className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '通知 · 推到这台设备' : 'NOTIFICATIONS · THIS DEVICE'}</h4>
        {state?.subscribed && <span className="rounded-full px-2 py-[2px] font-mono text-[10px] font-bold" style={{ background: 'rgba(106,179,68,.12)', color: '#3F7D20' }}>{zh ? '已开' : 'ON'}</span>}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
        {zh ? '只推需要你决定的事和真正新的事；做完的事不推，去活动日志看。' : 'Only things that need your decision and things that are genuinely new. Nothing "done" is pushed — that is what the activity log is for.'}
      </p>
      <div className="mt-3 flex gap-1 rounded-full border border-line-divider bg-surface p-1">
        {seg('off', zh ? '关' : 'Off')}
        {seg('quiet', zh ? '少 · 只推等你批准的' : 'Less · approvals only')}
        {seg('default', zh ? '默认 · 加上新申请等' : 'Default · plus new events')}
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-body-3">
        {!live
          ? (zh ? '登录后可开启。' : 'Sign in to enable.')
          : state && !state.supported
            ? state.needsInstall
              ? (zh ? 'iPhone 上需要先「分享 → 添加到主屏幕」，从主屏打开后这里才能开启。' : 'On iPhone, first Share → "Add to Home Screen" and open Stayloop from there; then you can turn this on.')
              : (zh ? '这个浏览器不支持推送。' : 'This browser does not support push.')
            : state?.permission === 'denied'
              ? (zh ? '浏览器已拒绝通知权限。' : 'Notifications are blocked in the browser.')
              : (zh ? '每台设备各自设置。' : 'Set per device.')}
        {note ? ` ${note}` : ''}
      </p>
      {state?.subscribed && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" disabled={busy} onClick={sendTest} className="rounded-full border border-line-divider bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-body-2 disabled:opacity-60">{zh ? '发一条测试通知' : 'Send a test notification'}</button>
          {testMsg && <span className="text-[12px] text-body-3">{testMsg}</span>}
        </div>
      )}
    </div>
  )
}
