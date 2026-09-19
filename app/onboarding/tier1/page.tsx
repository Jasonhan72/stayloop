'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useI18n } from '@/lib/i18n'
import { useAIName } from '@/lib/aiName'
import { SampleBanner } from '@/components/SampleNotice'

type Step = 'intro' | 'capture-id' | 'selfie' | 'review'

export default function Tier1OnboardingPage() {
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const [step, setStep] = useState<Step>('intro')

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-[760px] px-5 py-12 sm:px-7 lg:py-20">
          {/* This flow is a product preview: the photo never leaves the browser
              and nothing is verified. Real identity verification runs through
              the Veriff link a landlord sends with a screening (/verify/<token>). */}
          <SampleBanner
            zh={zh}
            text={{
              zh: '产品预览：本页不会上传、保存或核验任何证件——你选择的照片只留在这台设备的浏览器里，也不会因此获得身份章。真实的身份核验通过房东随筛查发给你的 Veriff 安全链接完成。',
              en: 'Product preview: this page does not upload, store or verify any document — the photo you pick stays in this browser, and no identity stamp is issued. Real identity verification happens through the secure Veriff link a landlord sends you with a screening.',
            }}
          />
          <ProgressBar step={step} />
          {step === 'intro' && <IntroCard onStart={() => setStep('capture-id')} />}
          {step === 'capture-id' && (
            <CaptureCard
              title={zh ? '第 1 步 / 3 · 拍摄证件' : 'Step 1 / 3 · Capture your ID'}
              hint={
                zh
                  ? '护照、加拿大驾照或 PR 卡均可。证件四角清晰、文字可读。'
                  : 'A passport, Canadian driver’s licence, or PR card all work. Make sure all four corners are sharp and the text is readable.'
              }
              ctaLabel={zh ? '✓ 已拍摄 · 继续' : '✓ Captured · Continue'}
              onNext={() => setStep('selfie')}
              onBack={() => setStep('intro')}
              icon={<IdIcon />}
            />
          )}
          {step === 'selfie' && (
            <CaptureCard
              title={zh ? '第 2 步 / 3 · 拍摄自拍' : 'Step 2 / 3 · Take a selfie'}
              hint={
                zh
                  ? '预览步骤：真实核验时，Veriff 会在这一步做活体检测确认是你本人。这里不会检测任何内容。'
                  : 'Preview step: in the real flow Veriff runs a liveness check here to confirm it’s really you. Nothing is checked on this page.'
              }
              ctaLabel={zh ? '✓ 已确认 · 继续' : '✓ Confirmed · Continue'}
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
  const { lang } = useI18n()
  const idx = step === 'intro' ? 0 : step === 'capture-id' ? 1 : step === 'selfie' ? 2 : 3
  return (
    <div className="mb-10 flex items-center gap-3">
      <span className="tier-badge t1">{lang === 'zh' ? '🪪 身份章 · ID' : '🪪 Identity stamp · ID'}</span>
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
  const { t, lang } = useI18n()
  const name = useAIName()
  return (
    <div className="sl-card mx-auto max-w-[580px] px-8 py-10 text-center sm:px-12 sm:py-12">
      <div className="orb tenant pulse mx-auto h-[88px] w-[88px]" style={{ color: '#00ACE4' }} />
      <h1 className="mt-6 text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
        {lang === 'en' ? `Hi, I'm ${name}.` : `嗨，我是 ${name}。`}
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
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // v5.4: 实时重试引导 per v54-passport-stamps —— 照片模糊/证件不支持当场提示重试（Findigs 同款规范）
  const accept = (f: File | null | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setError(zh ? '请上传图片文件（JPG / PNG / HEIC）。' : 'Please upload an image file (JPG / PNG / HEIC).')
      return
    }
    if (f.size > 15 * 1024 * 1024) {
      setError(zh ? '图片过大,请控制在 15MB 以内。' : 'Image is too large — please keep it under 15MB.')
      return
    }
    setError(null)
    setFileName(f.name)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }

  const openPicker = () => inputRef.current?.click()

  return (
    <div className="sl-card mx-auto max-w-[580px] px-8 py-10 sm:px-12 sm:py-12">
      <h2 className="text-[22px] font-bold tracking-tight">{title}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-body-2">{hint}</p>

      {/* Real capture surface — click to open camera / file picker, or drag-drop */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label={zh ? '上传或拍摄证件照片' : 'Upload or capture an ID photo'}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openPicker()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          accept(e.dataTransfer.files?.[0])
        }}
        className={
          'my-8 flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-surface-chip text-body-3 transition ' +
          (dragging ? 'border-brand bg-brand/5' : 'border-line-strong hover:border-brand')
        }
      >
        {preview ? (
          <div className="relative h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={zh ? '证件预览' : 'ID preview'} className="h-full w-full object-contain" />
            <span className="absolute bottom-2 right-2 rounded-md bg-white/90 px-2 py-1 font-mono text-[10px] font-bold text-brand">
              {zh ? '✓ 已选择 · 点击重拍' : '✓ Selected · Tap to retake'}
            </span>
          </div>
        ) : (
          <div className="pointer-events-none flex flex-col items-center gap-3 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-brand">
              {icon}
            </span>
            <span className="text-[13px]">{zh ? '点击此处启动相机 / 上传图片' : 'Tap here to open the camera / upload an image'}</span>
            <span className="text-[12px] text-body-4">{zh ? '或把图片拖到这里' : 'or drag an image here'}</span>
            <span className="font-mono text-[11px] text-body-4">{zh ? '预览 · 不上传' : 'PREVIEW · NOT UPLOADED'}</span>
          </div>
        )}
      </div>

      {error && <p className="-mt-4 mb-4 text-[12.5px] font-semibold text-danger">{error}</p>}
      {fileName && !error && (
        <p className="-mt-4 mb-4 truncate font-mono text-[11px] text-body-3">{zh ? '已选择' : 'Selected'} · {fileName}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-[10px] border border-line-strong bg-white px-5 py-[12px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand"
        >
          {zh ? '← 返回' : '← Back'}
        </button>
        <button
          onClick={onNext}
          disabled={!preview}
          className={
            'sl-btn-primary flex-1 !py-[14px] ' + (!preview ? 'cursor-not-allowed opacity-50' : '')
          }
        >
          {preview ? ctaLabel : zh ? '请先上传 / 拍摄' : 'Upload or capture first'}
        </button>
      </div>
    </div>
  )
}

function ReviewCard({ onBack }: { onBack: () => void }) {
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const name = useAIName()
  return (
    <div className="sl-card mx-auto max-w-[580px] px-8 py-10 text-center sm:px-12 sm:py-12">
      <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand/10 text-brand">
        <CheckIcon />
      </span>
      <h2 className="mt-5 text-[26px] font-bold tracking-tight">{zh ? '预览结束' : 'End of preview'}</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-body-2">
        {zh
          ? <>这只是流程预览：没有上传任何证件，你的身份也没有被核验。真实的身份核验通过房东随筛查发给你的 Veriff 安全链接完成。{name} 已经在你的 Workspace 等你 — 现在就能浏览房源。</>
          : <>This was a preview of the flow: no document was uploaded and your identity has not been verified. Real identity verification happens through the secure Veriff link a landlord sends you with a screening. {name} is already waiting in your Workspace — you can browse listings right now.</>}
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <Link href="/tenant/agent" className="sl-btn-primary w-full !py-[14px] !text-[15px]">
          {zh ? '打开我的 Workspace →' : 'Open my Workspace →'}
        </Link>
        <Link
          href="/listings"
          className="rounded-[10px] border border-line-strong bg-white px-5 py-[12px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand"
        >
          {zh ? '直接浏览房源' : 'Browse listings directly'}
        </Link>
        <button
          onClick={onBack}
          className="text-[13px] text-body-3 transition hover:text-body"
        >
          {zh ? '重新拍摄' : 'Retake'}
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
