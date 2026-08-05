import type { MetadataRoute } from 'next'

const BASE = 'https://www.stayloop.ai'

const PUBLIC_ROUTES = [
  '/',
  '/pricing',
  '/tenant',
  '/landlord',
  '/agent',
  '/screening',
  '/trust-api',
  '/trust-api/docs',
  '/about',
  '/partners',
  '/contact',
  '/disputes',
  '/listings',
  '/privacy',
  '/terms',
]

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({
    url: `${BASE}${path === '/' ? '' : path}`,
    changeFrequency: 'weekly',
    // /screening is the money keyword's landing and the page most worth
    // crawl budget after the homepage.
    priority: path === '/' ? 1 : path === '/screening' ? 0.9 : 0.7,
    lastModified: new Date(),
  }))
}
