'use client'
// -----------------------------------------------------------------------------
// V3 marketing footer
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'

export default function MarketingFooter() {
  const { lang } = useT()
  const year = new Date().getFullYear()

  const groups: Array<{ heading: { zh: string; en: string }; links: Array<{ href: string; zh: string; en: string }> }> = [
    {
      heading: { zh: '产品', en: 'Product' },
      links: [
        { href: '/tenants', zh: '租客 · Passport', en: 'Tenants · Passport' },
        { href: '/landlords', zh: '房东 · Pipeline', en: 'Landlords · Pipeline' },
        { href: '/agents', zh: '经纪 · Day Brief', en: 'Agents · Day Brief' },
        { href: '/trust-api', zh: 'Trust API', en: 'Trust API' },
        { href: '/chat', zh: 'Console', en: 'Console' },
      ],
    },
    {
      heading: { zh: '公司', en: 'Company' },
      links: [
        { href: '/about', zh: '关于', en: 'About' },
        { href: 'mailto:hello@stayloop.ai', zh: '联系', en: 'Contact' },
      ],
    },
    {
      heading: { zh: '合规', en: 'Compliance' },
      links: [
        { href: '/legal/privacy', zh: '隐私 (PIPEDA)', en: 'Privacy (PIPEDA)' },
        { href: '/legal/terms', zh: '使用条款', en: 'Terms of service' },
        { href: '/legal/security', zh: '安全', en: 'Security' },
      ],
    },
  ]

  return (
    <footer
      style={{
        background: v3.surface,
        borderTop: `1px solid ${v3.divider}`,
        padding: '48px 24px 32px',
      }}
    >
      <div style={{ maxWidth: 1260, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(3, minmax(160px, 1fr))',
            gap: 32,
            paddingBottom: 32,
            borderBottom: `1px solid ${v3.divider}`,
          }}
          className="mk-footer-grid"
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                marginBottom: 12,
                fontFamily: 'Inter Tight, system-ui, sans-serif',
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: '-0.025em',
              }}
            >
              <span style={{ color: v3.textPrimary }}>stay</span>
              <span
                style={{
                  background:
                    'linear-gradient(90deg, #4F46E5 0%, #7C3AED 50%, #A855F7 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                loop
              </span>
            </div>
            <p style={{ color: v3.textMuted, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              {lang === 'zh'
                ? '为北美租赁市场打造的 AI 信任基础设施。'
                : 'AI-native trust infrastructure for the North American rental market.'}
            </p>
          </div>
          {groups.map((g) => (
            <div key={g.heading.en}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: v3.textPrimary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 14,
                }}
              >
                {lang === 'zh' ? g.heading.zh : g.heading.en}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      style={{
                        color: v3.textSecondary,
                        textDecoration: 'none',
                        fontSize: 14,
                      }}
                    >
                      {lang === 'zh' ? l.zh : l.en}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            paddingTop: 24,
            color: v3.textMuted,
            fontSize: 12,
          }}
        >
          <div>© {year} Stayloop Inc. · Toronto, ON</div>
          <div>
            {lang === 'zh' ? 'PIPEDA · OHRC · RTA 合规' : 'PIPEDA · OHRC · RTA compliant'}
          </div>
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 860px) {
          :global(.mk-footer-grid) {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 600px) {
          :global(.mk-footer-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  )
}
