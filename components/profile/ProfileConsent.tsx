'use client'

// Applicant pack · consent + the three actions it unlocks (V1.0 阶段 4 · G14).
//
// The consent text is the shared APPLICANT_PROFILE_CONSENT_TEXT (lib/profile/
// consent.ts). Ticking it writes consent_version / consent_at on the
// applicant's own row (the page owns the write); until it is ticked, preview,
// PDF export and the one-click fill on /apply stay disabled and say why.
import Link from 'next/link'
import { APPLICANT_PROFILE_CONSENT_TEXT, APPLICANT_PROFILE_CONSENT_VERSION } from '@/lib/profile/consent'

export type ProfileConsentProps = {
  zh: boolean
  /** The applicant has ticked the current consent version. */
  consented: boolean
  consentAt?: string | null
  busy?: boolean
  /** Signed-in state; anonymous visitors see the text and a sign-in link only. */
  signedIn: boolean
  onToggle: (next: boolean) => void
  onPreview: () => void
  onExport: () => void
  /** Where "apply with my pack" sends the applicant (the listings browser by default). */
  applyHref?: string
}

export default function ProfileConsent({ zh, consented, consentAt, busy, signedIn, onToggle, onPreview, onExport, applyHref = '/listings' }: ProfileConsentProps) {
  const text = APPLICANT_PROFILE_CONSENT_TEXT[zh ? 'zh' : 'en']
  const locked = !signedIn || !consented
  const why = !signedIn
    ? (zh ? '登录后才能出示申请包。' : 'Sign in to present your pack.')
    : (zh ? '勾选上面的同意后，才能预览、导出或在申请时一键填入。' : 'Tick the consent above to preview, export or fill an application with it.')
  return (
    <section className="rounded-xl border border-line-divider bg-white p-4 sm:p-5" data-testid="profile-consent">
      <h2 className="text-[16px] font-bold tracking-tight">{zh ? '出示前的同意' : 'Consent before presenting'}</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-body-3">
        {zh ? '申请包只在你出示时才会离开你的账号。这段话说明它去哪里、谁能看、怎么撤回。' : 'Your pack leaves your account only when you present it. This says where it goes, who sees it and how to withdraw it.'}
      </p>
      <div className="mt-3 rounded-lg bg-surface-chip px-4 py-3 text-[13px] leading-relaxed text-body-2" data-testid="profile-consent-text">
        <div className="font-semibold text-ink">{text.heading}</div>
        <p className="mt-1">{text.intro}</p>
        <ul className="mt-2 space-y-1">
          {text.points.map((pt) => (
            <li key={pt.title}><span className="font-semibold text-ink">{pt.title}</span> · {pt.body}</li>
          ))}
        </ul>
      </div>
      <label className="mt-3 flex items-start gap-2.5 text-[13.5px]">
        <input
          type="checkbox"
          className="mt-[3px] h-4 w-4 accent-brand"
          checked={consented}
          disabled={!signedIn || !!busy}
          onChange={(e) => onToggle(e.target.checked)}
          data-testid="profile-consent-checkbox"
        />
        <span>
          {text.affirm}
          <span className="ml-1.5 font-mono text-[10.5px] text-body-3">{APPLICANT_PROFILE_CONSENT_VERSION}</span>
          {consented && consentAt && (
            <span className="block text-[11.5px] text-body-3">
              {zh ? '同意于 ' : 'Agreed on '}
              {new Date(consentAt).toLocaleDateString(zh ? 'zh-CN' : 'en-CA')}
              {' · '}
              {zh ? '取消勾选即撤回' : 'untick to withdraw'}
            </span>
          )}
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onPreview} disabled={locked} className="sl-btn-secondary !px-4 !py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-50" data-testid="pack-preview">
          {zh ? '预览房东看到的样子' : 'Preview what a landlord sees'}
        </button>
        <button type="button" onClick={onExport} disabled={locked} className="sl-btn-primary !px-4 !py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-50" data-testid="pack-export">
          {zh ? '导出 PDF（打印）' : 'Export PDF (print)'}
        </button>
        {locked ? (
          <span className="sl-btn-ghost !px-3 !py-2 text-[13px] opacity-50" aria-disabled="true" data-testid="pack-apply-disabled">
            {zh ? '申请房源时一键填入' : 'Fill an application with it'}
          </span>
        ) : (
          <Link href={applyHref} className="sl-btn-ghost !px-3 !py-2 text-[13px]" data-testid="pack-apply">
            {zh ? '申请房源时一键填入 →' : 'Fill an application with it →'}
          </Link>
        )}
      </div>
      {locked && <p className="mt-2 text-[12px] text-body-3" data-testid="pack-locked-why">{why}</p>}
    </section>
  )
}
