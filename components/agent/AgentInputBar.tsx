'use client'

import { useState } from 'react'

export default function AgentInputBar({
  agentName,
  disabled,
  onSend,
}: {
  agentName: string
  disabled?: boolean
  onSend: (message: string) => void | Promise<void>
}) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    const msg = value.trim()
    if (!msg || sending) return
    setSending(true)
    setValue('')
    try {
      await onSend(msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-line-strong bg-white shadow-sm transition focus-within:border-brand focus-within:shadow-md">
      <textarea
        rows={3}
        value={value}
        disabled={disabled || sending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        aria-label={`Message ${agentName}`}
        placeholder={`告诉 ${agentName} 你想做什么 —— 例如「帮我找 Line 1 沿线、$2400 以内、可养猫的一居」`}
        className="block max-h-60 min-h-[92px] w-full resize-none bg-transparent px-4 pt-3.5 text-[14.5px] leading-relaxed text-body outline-none placeholder:text-body-4"
      />
      <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
        <span className="font-mono text-[11px] text-body-4">↵ 发送 · Shift + ↵ 换行</span>
        <button
          onClick={submit}
          disabled={disabled || sending || !value.trim()}
          className="sl-btn-primary !px-4 !py-[9px] !text-[13.5px] disabled:opacity-50"
        >
          {sending ? '…' : '发送 →'}
        </button>
      </div>
    </div>
  )
}
