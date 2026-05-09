'use client'

import Link from 'next/link'
import Header from './Header'
import Footer from './Footer'

interface Props {
  eyebrow: string
  title: string
  subtitle?: string
  back?: { href: string; label: string }
  artNumber?: string
  vol?: string
  // Optional CTA buttons that route to existing surfaces
  ctas?: Array<{ label: string; href: string; variant?: 'primary' | 'secondary' }>
}

/**
 * For V5 artboards we haven't built out yet. Keeps the unified header / footer
 * visible so the whole site looks consistent — and gives a clear handoff
 * note (vol + artboard number) to designers reviewing the build.
 */
export default function PlaceholderPage({ eyebrow, title, subtitle, back, artNumber, vol, ctas }: Props) {
  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-[820px] px-5 py-20 text-center sm:py-32">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
            {eyebrow}
          </div>
          <h1 className="mx-auto mt-3 max-w-[640px] text-[36px] font-extrabold leading-tight tracking-tight sm:text-[44px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mx-auto mt-4 max-w-[560px] text-[15px] leading-relaxed text-body-2">
              {subtitle}
            </p>
          )}
          {(artNumber || vol) && (
            <div className="mx-auto mt-8 inline-flex items-center gap-3 rounded-full border border-line-divider bg-white px-5 py-2 font-mono text-[11.5px] text-body-3">
              {artNumber && <span>ART {artNumber}</span>}
              {vol && <span>· {vol}</span>}
              <span>· in V5 spec</span>
            </div>
          )}
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {(ctas ?? [{ label: '回首页', href: '/', variant: 'secondary' as const }]).map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className={
                  c.variant === 'primary'
                    ? 'sl-btn-primary !px-6 !py-[12px]'
                    : 'sl-btn-secondary'
                }
              >
                {c.label}
              </Link>
            ))}
            {back && (
              <Link href={back.href} className="sl-btn-ghost">
                ← {back.label}
              </Link>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
