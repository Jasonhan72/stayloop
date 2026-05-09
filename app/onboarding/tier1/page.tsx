'use client'

import Link from 'next/link'
import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useI18n } from '@/lib/i18n'

type Step = 'intro' | 'capture-id' | 'selfie' | 'review'

export default function Tier1OnboardingPage() {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('intro')

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-[760px] px-5 py-12 sm:px-7 lg:py-20">
          <ProgressBar step={step} />
          {step === 'intro' && <IntroCard onStart={() => setStep('capture-id')} />}
          {step === 'capture-id' && (
            <CaptureCard
              title="第 1 步 / 3 · 拍摄证件"
              hint="护照、加拿大驾照或 PR 卡均可。证件四角清晰、文字可读。"
              ctaLabel="✓ 已拍摄 · 继续"
              onNext={() => setStep('selfie')}
              onBack={() => setStep('intro')}
              icon={<IdIcon />}
            />
          )}
          {step === 'selfie' && (
            <CaptureCard
              title="第 2 步 / 3 · 拍摄自拍"
              hint="对着摄像头眨眨眼，Persona 会做活体检测确认是你本人。"
              ctaLabel="✓ 已确认 · 继续"
              onNext={() => setStep('review')}
              onBack={() => setStep('capture-id')}
              icon={<SelfieIcon />}
            />
          )}
          {step === 'review' && <ReviewCard onBack={() => setStep('selfie')} />}
        </div>
      </main>
      <Footer />
    </>
  )
}

function ProgressBar({ step }: { step: Step }) {
  const idx = step === 'intro' ? 0 : step === 'capture-id' ? 1 : step === 'selfie' ? 2 : 3
  return (
    <div className="mb-10 flex items-center gap-3">
      <span className="tier-badge t1">TIER 1 · ID</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line-divider">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${(idx / 3) * 100}%`,
            background: 'linear-gradient(90deg, #6EE7B7, #34D399, #10B981)',
          }}
        />
      </div>
      <span className="font-mono text-[11px] text-body-3">{idx}/3</span>
    </div>
  )
}

function IntroCard({ onStart }: { onStart: () => void }) {
  const { t } = useI18n()
  return (
    <div className="sl-card mx-auto max-w-[580px] px-8 py-10 text-center sm:px-12 sm:py-12">
      <div className="orb tenant pulse mx-auto h-[88px] w-[88px]" style={{ color: '#7C3AED' }} />
      <h1 className="mt-6 text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
        {t('onb.hi')}
        <br />
        {t('onb.line2')}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-body-2">{t('onb.body')}</p>

      <ul className="my-7 rounded-xl bg-surface-chip p-5 text-left text-[13.5px] leading-relaxed text-body">
        {[t('onb.f1'), t('onb.f2'), t('onb.f3')].map((line, i) => (
          <li key={i} className="relative pl-6 leading-7">
            <span className="absolute left-0 font-bold text-brand">✓</span>
            {line}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <button onClick={onStart} className="sl-btn-primary w-full !py-[14px] !text-[15px]">
          {t('onb.cta1')}
        </button>
        <Link
          href="/listings"
          className="rounded-[10px] border border-line-strong bg-white px-5 py-[12px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand"
        >
          {t('onb.cta2')}
        </Link>
      </div>
      <p className="mt-4 text-[12px] text-body-3">{t('onb.foot')}</p>
    </div>
  )
}

function CaptureCard({
  title,
  hint,
  ctaLabel,
  onNext,
  onBack,
  icon,
}: {
  title: string
  hint: string
  ctaLabel: string
  onNext: () => void
  onBack: () => void
  icon: React.ReactNode
}) {
  return (
    <div className="sl-card mx-auto max-w-[580px] px-8 py-10 sm:px-12 sm:py-12">
      <h2 className="text-[22px] font-bold tracking-tight">{title}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-body-2">{hint}</p>

      {/* Mock capture surface */}
      <div className="my-8 flex aspect-[4/3] items-center justify-center rounded-2xl border-2 border-dashed border-line-strong bg-surface-chip text-body-3">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-brand">
            {icon}
          </span>
          <span className="text-[13px]">点击此处启动相机 / 上传图片</span>
          <span className="font-mono text-[11px] text-body-4">ENCRYPTED · PERSONA SDK</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-[10px] border border-line-strong bg-white px-5 py-[12px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand"
        >
          ← 返回
        </button>
        <button onClick={onNext} className="sl-btn-primary flex-1 !py-[14px]">
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}

function ReviewCard({ onBack }: { onBack: () => void }) {
  return (
    <div className="sl-card mx-auto max-w-[580px] px-8 py-10 text-center sm:px-12 sm:py-12">
      <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand/10 text-brand">
        <CheckIcon />
      </span>
      <h2 className="mt-5 text-[26px] font-bold tracking-tight">Tier 1 通过 ✓</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-body-2">
        身份已验证。Luna 已经在你的 Workspace 等你 — 现在就能浏览房源、提交看房意向。
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <Link href="/tenant/agent" className="sl-btn-primary w-full !py-[14px] !text-[15px]">
          打开我的 Workspace →
        </Link>
        <Link
          href="/listings"
          className="rounded-[10px] border border-line-strong bg-white px-5 py-[12px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand"
        >
          直接浏览房源
        </Link>
        <button
          onClick={onBack}
          className="text-[13px] text-body-3 transition hover:text-body"
        >
          重新拍摄
        </button>
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
function IdIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <line x1="14" y1="9" x2="19" y2="9" />
      <line x1="14" y1="13" x2="19" y2="13" />
    </svg>
  )
}
function SelfieIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="4" />
      <path d="M5 21c0-3.866 3.134-7 7-7s7 3.134 7 7" />
    </svg>
  )
}
