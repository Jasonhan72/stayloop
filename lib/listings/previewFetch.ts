// Is this request a link-preview fetcher or a HEAD probe rather than a person
// clicking? (2026-10-27 review.) The share short link redirects these without
// counting them, so the landlord's click figure means people.
const PREVIEW_UA = /facebookexternalhit|facebot|whatsapp|twitterbot|slackbot|linkedinbot|telegrambot|discordbot|skypeuripreview|googlebot|bingbot|applebot|duckduckbot|yandex|baiduspider|bytespider|preview|crawler|spider|\bbot\b/i
export function isPreviewFetch(method: string, userAgent: string | null): boolean {
  return method === 'HEAD' || PREVIEW_UA.test(userAgent || '')
}
