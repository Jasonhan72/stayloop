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
    <div className="rounded-2xl border border-line-strong bg-white p-2 shadow-sm focus-within:border-brand">
      <div className="flex items-end gap-2">
        <textarea
          rows={1}
          value={value}
          disabled={disabled || sending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={`告诉 ${agentName} 你想做什么 —— 例如「帮我找 Line 1 沿线、$2400 以内、可养猫的一居」`}
          className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[14px] leading-relaxed text-body outline-none placeholder:text-body-4"
        />
        <button
          onClick={submit}
          disabled={disabled || sending || !value.trim()}
          className="sl-btn-primary !px-4 !py-[10px] !text-[13.5px] disabled:opacity-50"
        >
          {sending ? '…' : '发送'}
        </button>
      </div>
    </div>
  )
}
