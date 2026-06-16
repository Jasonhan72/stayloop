'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import OnboardingStage from '@/components/OnboardingStage'
import { setAIName } from '@/lib/aiName'

const SUGGESTIONS = ['Luna', 'Mia', 'Aria', '小鹿', '木木', 'Echo', 'Nova', '豆包']

const HELPS = [
  '完成注册 · 身份 / 收入 / 推荐人',
  '从你的需求筛房源 · 提看房',
  '起草申请 · 跟进 · 准备查问',
  '入住 / 续约 / 维修 / 退租继续陪跑',
]

/**
 * Tenant onboarding · 起名 (VOL1)
 * Name your AI agent, then continue to 认证 1 级 · 90s 身份验证.
 */

export default function OnboardingNamePage() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const final = value.trim() || 'Luna'

  const submit = (name?: string) => {
    if (submitting) return
    setSubmitting(true)
    setAIName(name ?? final)
    router.push('/onboarding/tier1')
  }

  return (
    <OnboardingStage
      step={3}
      totalSteps={4}
      eyebrow="NAME YOUR AGENT"
      back={{ href: '/onboarding/meet', label: '回上一步' }}
    >
      <span
        className="pulse"
        style={{
          display: 'inline-block',
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 32% 28%, rgba(196,181,253,0.95), #7C3AED 65%)',
          boxShadow: '0 0 50px rgba(124,58,237,0.45)',
          marginBottom: 18,
        }}
      />

      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.18 }}>
        为你的 AI 助手起名
      </h1>
      <p style={{ fontSize: 14.5, color: '#3F3F46', lineHeight: 1.6, margin: '12px 0 22px' }}>
        她会读取你的专属记忆、理解你的进度，从这一刻起陪你走完注册 · 找房 · 申请 · 入住 · 以后所有事。
      </p>

      {/* @-prefixed name input */}
      <div style={{ textAlign: 'left', marginBottom: 18 }}>
        <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#71717A', marginBottom: 8 }}>
          助手名字
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 16px',
              border: '1.5px solid #C5BDAA',
              borderRadius: 12,
              background: '#fff',
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700, color: '#7C3AED' }}>@</span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Luna"
              autoFocus
              maxLength={20}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '0.01em',
                fontFamily: 'inherit',
                background: 'transparent',
              }}
            />
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                color: '#7C3AED',
                background: 'rgba(124,58,237,0.10)',
                padding: '4px 9px',
                borderRadius: 999,
              }}
            >
              随时可改
            </span>
          </div>
        </form>
      </div>

      {/* Suggestion chips */}
      <div style={{ textAlign: 'left', marginBottom: 22 }}>
        <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#71717A', marginBottom: 8 }}>
          热门选项 ↓
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setValue(s)}
              style={{
                padding: '7px 14px',
                background: value === s ? '#7C3AED' : '#fff',
                color: value === s ? '#fff' : '#5B21B6',
                border: '1px solid rgba(124,58,237,0.30)',
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* PREVIEW quote */}
      <div
        style={{
          textAlign: 'left',
          background: 'rgba(124,58,237,0.05)',
          border: '1px solid rgba(124,58,237,0.20)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 18,
        }}
      >
        <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7C3AED', marginBottom: 6 }}>
          PREVIEW · {final} 会说
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#3F3F46' }}>
          「Hi，我是 {final}。接下来 90 秒我会帮你完成身份验证，之后你提要求 · 我负责跑腿，关键决策始终是你的。」
        </p>
      </div>

      {/* Capabilities grid */}
      <div style={{ textAlign: 'left', marginBottom: 22 }}>
        <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#71717A', marginBottom: 8 }}>
          {final} 会帮你
        </div>
        <div className="grid grid-cols-2 gap-2">
          {HELPS.map((h, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                background: '#fff',
                border: '1px solid #E7E1D3',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 12,
                lineHeight: 1.45,
                color: '#3F3F46',
              }}
            >
              <span style={{ flexShrink: 0, fontWeight: 700, color: '#7C3AED' }}>{i + 1}</span>
              <span>{h}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => submit()}
        disabled={submitting}
        style={{
          width: '100%',
          padding: '14px',
          background: '#171717',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 14.5,
          fontWeight: 700,
          cursor: submitting ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? '...' : `下一步 · ${final} 陪你 90s 验证 →`}
      </button>

      <button
        type="button"
        onClick={() => submit('Luna')}
        disabled={submitting}
        style={{
          width: '100%',
          padding: '12px',
          background: 'transparent',
          color: '#71717A',
          border: 'none',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          marginTop: 8,
        }}
      >
        跳过 · 先用默认名
      </button>

      <p style={{ fontSize: 11.5, color: '#71717A', marginTop: 10, fontFamily: 'inherit' }}>
        你可以随时在设置 · 助手里重命名 · 调性格 / 语言 / 职责范围。
      </p>
    </OnboardingStage>
  )
}
