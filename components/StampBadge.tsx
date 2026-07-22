'use client'

/**
 * v5.4 Passport Stamps — presentation components.
 *
 * StampBadge  — compact pill replacing the old '认证 N 级' text badges.
 *               Keeps the existing `tier-badge tN` class for color styling
 *               (classes defined in app/globals.css — do not rename).
 * StampRow    — icon row for applicant cards (landlord view): stamped icons
 *               bright with a small green ✓ dot, unstamped gray.
 */

import { STAMPS, STAMP_CHECK_GREEN } from '@/lib/passportStamps'
import { useT } from '@/lib/i18n'

function clampTier(tier: number): number {
  return Math.min(Math.max(Math.round(tier), 0), 4)
}

/** Compact pill: `2/4 章` with a tiny green ✓ when at least one stamp is earned. */
export function StampBadge({ tier, className = '' }: { tier: number; className?: string }) {
  const { lang } = useT()
  const t = clampTier(tier)
  return (
    <span className={`tier-badge t${Math.max(t, 1)} ${className}`.trim()}>
      {t >= 1 && (
        <span
          aria-hidden
          className="mr-1 inline-flex h-[13px] w-[13px] items-center justify-center rounded-full align-[-1px] text-[9px] font-extrabold leading-none text-white"
          style={{ background: STAMP_CHECK_GREEN }}
        >
          ✓
        </span>
      )}
      {lang === 'zh' ? `${t}/4 章` : `${t}/4 stamps`}
    </span>
  )
}

/** Icon row (landlord applicant view): 🪪💼 bright with green ✓ dot, 🏦⚖️ gray. */
export function StampRow({
  tier,
  lang = 'zh',
  className = '',
}: {
  tier: number
  lang?: 'zh' | 'en'
  className?: string
}) {
  const t = clampTier(tier)
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      {STAMPS.map((s, i) => {
        const stamped = i < t
        const label = stamped
          ? lang === 'zh'
            ? `${s.zh.replace(/章$/, '')}已验`
            : `${s.en.replace(/ stamp$/i, '')} verified`
          : lang === 'zh'
          ? s.zh.replace(/章$/, '')
          : s.en.replace(/ stamp$/i, '')
        return (
          <span
            key={s.key}
            title={lang === 'zh' ? s.zh : s.en}
            className={
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
              (stamped
                ? 'bg-tenant/[0.08] text-tenant'
                : 'border border-dashed border-line-divider bg-surface-chip font-normal text-body-3 opacity-70')
            }
          >
            <span className={stamped ? '' : 'grayscale opacity-60'}>{s.icon}</span>
            {stamped && (
              <span
                aria-hidden
                className="inline-flex h-[13px] w-[13px] items-center justify-center rounded-full text-[9px] font-extrabold leading-none text-white"
                style={{ background: STAMP_CHECK_GREEN }}
              >
                ✓
              </span>
            )}
            <span>{label}</span>
          </span>
        )
      })}
    </span>
  )
}

export default StampBadge
