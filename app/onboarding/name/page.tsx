'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import OnboardingStage from '@/components/OnboardingStage'
import { setAIName } from '@/lib/aiName'

const SUGGESTIONS = ['Luna', 'Mira', 'Aria', 'Echo', 'Iris', 'Nova']

/**
 * Tenant onboarding · STEP 03
 * Name your AI agent. Default placeholder is Luna.
 * Persisted to localStorage so the rest of the app can read it back.
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
    router.push('/tenant/agent')
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
          width: 96,
          height: 96,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 32% 28%, rgba(196,181,253,0.95), #7C3AED 65%)',
          boxShadow: '0 0 50px rgba(124,58,237,0.45)',
          marginBottom: 22,
        }}
      />

      <h1
        style={{
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.18,
        }}
      >
        给她起个名字吧。
      </h1>
      <p
        style={{
          fontSize: 14.5,
          color: '#3F3F46',
          lineHeight: 1.6,
          margin: '12px 0 22px',
        }}
      >
        默认她叫 <b style={{ color: '#5B21B6' }}>Luna</b>，
        你也可以叫她任何让你舒服的名字。之后随时可以改。
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        style={{ marginBottom: 18 }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Luna"
          autoFocus
          maxLength={20}
          style={{
            width: '100%',
            padding: '16px 20px',
            border: '1.5px solid #C5BDAA',
            borderRadius: 12,
            fontSize: 22,
            fontWeight: 600,
            textAlign: 'center',
            letterSpacing: '0.01em',
            outline: 'none',
            fontFamily: 'inherit',
            background: '#fff',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#7C3AED')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#C5BDAA')}
        />
      </form>

      {/* Suggestion chips */}
      <div className="flex flex-wrap justify-center gap-2" style={{ marginBottom: 26 }}>
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
        {submitting ? '...' : `好的，叫她 ${final} →`}
      </button>

      <p
        style={{
          fontSize: 11.5,
          color: '#71717A',
          marginTop: 14,
          fontFamily: 'inherit',
        }}
      >
        下一步直接见 {final}，开始第一次对话。等你想提交看房意向时再做身份验证。
      </p>
    </OnboardingStage>
  )
}
