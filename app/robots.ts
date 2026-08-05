import type { MetadataRoute } from 'next'

// Trailing-slash entries (/tenant/ etc.) block only sub-paths — the
// /tenant /landlord /agent marketing root pages stay crawlable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/dashboard',
        '/settings',
        '/onboarding',
        '/auth',
        '/p/',
        '/tenant/',
        '/landlord/',
        '/agent/',
        // The screening APP is an auth wall; only the landing at /screening
        // should rank. Without this, the app shell competes with the landing
        // for the money keyword.
        '/screening/app',
        // Token-bearing and members-only surfaces. /join/ and /lease/ carry
        // capability tokens in the URL — indexing one would hand out an
        // invite or a signature link to anyone searching.
        '/join/',
        '/lease/',
        '/h/',
        '/leases/',
        '/notifications',
      ],
    },
    sitemap: 'https://www.stayloop.ai/sitemap.xml',
  }
}
