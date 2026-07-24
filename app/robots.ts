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
      ],
    },
    sitemap: 'https://www.stayloop.ai/sitemap.xml',
  }
}
