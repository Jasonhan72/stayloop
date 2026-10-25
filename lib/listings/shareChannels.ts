// The outside channels of the share pack and their short codes (2026-10-26).
// No imports on purpose: route handlers and the proactive sweep read these, and
// a module that pulls in client code would hand them client-reference stubs.
export type ShareChannel = 'wechat' | 'xiaohongshu' | 'facebook_group' | 'facebook_marketplace' | 'kijiji' | 'instagram' | 'reply' | 'poster'
export const SHARE_CHANNEL_KEYS: ShareChannel[] = ['wechat', 'xiaohongshu', 'facebook_group', 'facebook_marketplace', 'kijiji', 'instagram', 'reply', 'poster']

/** Channels the landlord posts to by hand and can paste a link back from (a listing_syndications row). */
export const PASTE_BACK_CHANNELS = ['wechat', 'xiaohongshu', 'facebook_group', 'facebook_marketplace', 'kijiji', 'instagram'] as const
export type PasteBackChannel = (typeof PASTE_BACK_CHANNELS)[number]
export function isPasteBackChannel(v: unknown): v is PasteBackChannel {
  return typeof v === 'string' && (PASTE_BACK_CHANNELS as readonly string[]).includes(v)
}
export const PASTE_BACK_LABEL: Record<PasteBackChannel, { zh: string; en: string }> = {
  wechat: { zh: '微信', en: 'WeChat' },
  xiaohongshu: { zh: '小红书', en: '小红书' },
  facebook_group: { zh: 'Facebook 群', en: 'Facebook group' },
  facebook_marketplace: { zh: 'Facebook Marketplace', en: 'Facebook Marketplace' },
  kijiji: { zh: 'Kijiji', en: 'Kijiji' },
  instagram: { zh: 'Instagram', en: 'Instagram' },
}

export const SHARE_CODE_RE = /^[a-z0-9]{8}$/
const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789' // no 0 / o / 1 / l — the code is read off posters
export function randomShareCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}
export function shortLink(site: string, code: string): string {
  return `${site.replace(/\/$/, '')}/go/${code}`
}
