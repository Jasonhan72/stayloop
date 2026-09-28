'use client'

// The "which identity are you" tiles on /onboarding/name (V0.7, 2026-09-27).
// Copy comes from lib/onboarding/roleChoices so the page, this component and
// the guards read one list. Picking a tile reports it; the page decides where
// that identity goes (naming, or the provider onboarding form).
import { ROLE_CHOICES, type OnboardingRole } from '@/lib/onboarding/roleChoices'
import { ROLE_THEME } from '@/lib/roleTheme'

export default function RoleChooser({ zh, onPick }: { zh: boolean; onPick: (r: OnboardingRole) => void }) {
  const lang = zh ? 'zh' : 'en'
  return (
    <div data-testid="role-chooser" className="grid gap-2.5 text-left sm:grid-cols-2">
      {ROLE_CHOICES.map((c) => {
        // identity colours are the role colours (avatar / badge use only); the provider has none → ink
        const dot = c.key === 'provider' ? '#1B1B3C' : ROLE_THEME[c.key].accent
        return (
          <button
            key={c.key}
            type="button"
            data-role={c.key}
            onClick={() => onPick(c.key)}
            className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line-divider bg-white px-4 py-3.5 text-left transition hover:border-[#00ACE4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00ACE4]"
          >
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: dot }} aria-hidden />
              <span className="text-[16px] font-extrabold text-ink">{c.label[lang]}</span>
              {c.pilot && (
                <span className="rounded-full px-1.5 py-[1px] font-mono text-[10px] font-bold" style={{ background: '#EEF5FA', color: '#6E6E8A' }}>
                  {zh ? '试点' : 'PILOT'}
                </span>
              )}
            </span>
            <span className="text-[13px] leading-snug text-body-2">{c.blurb[lang]}</span>
            <span className="text-[12px] text-body-3">
              → <b className="text-brand">{c.lands[lang]}</b>
            </span>
          </button>
        )
      })}
    </div>
  )
}
