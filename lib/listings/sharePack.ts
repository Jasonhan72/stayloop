// 分享包 v2 (2026-10-26 · report review batch 1 item 2; design/ai-rebuild-report-
// review-2026-10-25.md §一 "分发第一层"). One listing → one piece of copy per
// outside channel, each built ONLY from the listing's own fields (the same
// facts buildSharePost uses) and each ending with that channel's own short link
// (/go/<code>), so the dashboard can say which channel the clicks came from.
// Deterministic: templates, no model. Everything the landlord pastes elsewhere
// points back to the Stayloop listing page, where viewing, questions and
// applications stay (the report's MASTER RULE, §7).
import { buildSharePost, firstParagraph, titleIn, type ShareFacts } from './shareCopy'
import { amenityLabel } from '@/lib/listingInsights'
import { AMENITY_VOCAB } from '@/lib/listings/quickDraft'

export type Bi = { zh: string; en: string }
export { PASTE_BACK_CHANNELS, SHARE_CODE_RE, isPasteBackChannel, randomShareCode, shortLink, type PasteBackChannel, type ShareChannel } from './shareChannels'
import type { ShareChannel } from './shareChannels'

export const SHARE_CHANNELS: { key: ShareChannel; label: Bi; hint: Bi; pasteBack: boolean }[] = [
  { key: 'wechat', label: { zh: '微信', en: 'WeChat' }, pasteBack: true, hint: { zh: '朋友圈九宫格用前 9 张照片；文案直接粘贴，链接在末尾。发完可以把截图日期记在下面，租出后好提醒自己撤。', en: 'Use the first nine photos for the Moments grid; paste the text as is, the link is at the end. Note below once it is posted so the take-down reminder knows.' } },
  { key: 'xiaohongshu', label: { zh: '小红书', en: '小红书' }, pasteBack: true, hint: { zh: '正文里的链接点不开：把链接放在评论区第一条或个人简介。封面用第一张照片（3:4）。', en: 'Links in the body are not clickable: put the link in the first comment or your profile. Use the first photo (3:4) as the cover.' } },
  { key: 'facebook_group', label: { zh: 'Facebook 群', en: 'Facebook group' }, pasteBack: true, hint: { zh: '租房群的群规各不相同，有的不许外链：那就把链接放评论。发完把帖子链接贴回来。', en: 'Group rules differ; some ban links, so put it in a comment. Paste the post link back here once it is up.' } },
  { key: 'facebook_marketplace', label: { zh: 'Facebook Marketplace', en: 'Facebook Marketplace' }, pasteBack: true, hint: { zh: '2023 年起 Marketplace 的租房帖只能用个人账号发。描述里放链接，相册最后一张放二维码海报；咨询会走 Messenger，用下面的回复模板把人引回来。租出后记得下架。', en: 'Since 2023 rental posts on Marketplace come from a personal account. Put the link in the description and the QR poster as the last photo; enquiries arrive in Messenger, so use the reply template to bring people back. Take it down once rented.' } },
  { key: 'kijiji', label: { zh: 'Kijiji', en: 'Kijiji' }, pasteBack: true, hint: { zh: 'Kijiji 的「网址」字段放这条链接。超过 3 套在租房源 Kijiji 会收费；Stayloop 不用脚本代发（违反它们的条款）。', en: 'Put this link in Kijiji’s website field. More than three live rentals costs money on Kijiji; Stayloop never posts by script (their terms forbid it).' } },
  { key: 'instagram', label: { zh: 'Instagram', en: 'Instagram' }, pasteBack: true, hint: { zh: '链接放个人简介或 Stories 的链接贴纸；前几张照片做 4:5 轮播，首条评论放话题标签。', en: 'Put the link in your bio or a Stories link sticker; the first photos make a 4:5 carousel, hashtags go in the first comment.' } },
  { key: 'reply', label: { zh: '回复模板', en: 'Reply template' }, pasteBack: false, hint: { zh: '有人在 Kijiji、Messenger、微信里问房时回这一条。对话进了 Stayloop 才有记录；外面的聊天不算正式申请。', en: 'Use this when someone asks about the place on Kijiji, Messenger or WeChat. Only a conversation inside Stayloop is on the record; outside chats are not an application.' } },
  { key: 'poster', label: { zh: '二维码海报', en: 'QR poster' }, pasteBack: false, hint: { zh: '下载海报（SVG，可打印）：贴在楼下、放进相册最后一张，或发给中介。扫码直达房源页。', en: 'Download the poster (SVG, printable): for the lobby, the last photo of an album, or an agent. Scanning opens the listing page.' } },
]


export type SharePiece = { channel: ShareChannel; title: string; body: string; hint: Bi; link: string }

const TYPE: Record<string, Bi> = {
  condo: { zh: '公寓', en: 'condo' }, apartment: { zh: '公寓', en: 'apartment' }, house: { zh: '独立屋', en: 'house' },
  townhouse: { zh: '联排', en: 'townhouse' }, basement: { zh: '地下室单元', en: 'basement unit' }, room: { zh: '单间', en: 'room' },
}
const TEST_TAG: Bi = { zh: '【测试房源 · 非实际房源】', en: '[Test listing · not a real rental]' }

function specsOf(f: ShareFacts, lang: 'zh' | 'en'): string {
  const zh = lang === 'zh'
  return [
    f.bedrooms != null ? (zh ? `${f.bedrooms} 卧` : `${f.bedrooms} bd`) : '',
    f.bathrooms != null ? (zh ? `${f.bathrooms} 卫` : `${f.bathrooms} ba`) : '',
    f.sqft ? `${f.sqft} sqft` : '',
    f.property_type ? TYPE[f.property_type]?.[lang] ?? '' : '',
  ].filter(Boolean).join(' · ')
}
function amenitiesOf(f: ShareFacts, lang: 'zh' | 'en', max: number): string[] {
  const label = (a: string) => { const v = AMENITY_VOCAB.find((x) => x.id === a.trim().toLowerCase()); return v ? v[lang] : amenityLabel(a, lang) }
  return (f.amenities ?? []).filter(Boolean).slice(0, max).map(label)
}
const cityTag = (c: string | null | undefined) => (c || '').replace(/[^A-Za-z0-9一-鿿]/g, '')
const clip = (s: string, n: number) => (Array.from(s).length > n ? Array.from(s).slice(0, n - 1).join('') + '…' : s)
const rentOf = (f: ShareFacts, lang: 'zh' | 'en') => (f.monthly_rent != null ? (lang === 'zh' ? `$${f.monthly_rent.toLocaleString()}/月` : `$${f.monthly_rent.toLocaleString()}/mo`) : '')

/** The short headline the classifieds want: place + size + rent, never more than the fields say. */
export function shortTitle(f: ShareFacts, lang: 'zh' | 'en', max: number): string {
  const zh = lang === 'zh'
  const type = f.property_type ? TYPE[f.property_type]?.[lang] ?? '' : ''
  const place = f.city || f.address
  const beds = f.bedrooms != null ? (zh ? `${f.bedrooms} 卧` : `${f.bedrooms}-bed`) : ''
  const raw = zh
    ? [place, beds + (type ? type : ''), '出租', rentOf(f, 'zh')].filter(Boolean).join(' ')
    : [beds, type, 'for rent', f.city ? `in ${f.city}` : '', rentOf(f, 'en') ? `· ${rentOf(f, 'en')}` : ''].filter(Boolean).join(' ')
  return clip(raw.replace(/\s+/g, ' ').trim(), max)
}

export function buildSharePack(f: ShareFacts, lang: 'zh' | 'en', links: Partial<Record<ShareChannel, string>>, fallbackUrl: string): SharePiece[] {
  const zh = lang === 'zh'
  const link = (c: ShareChannel) => links[c] || fallbackUrl
  const test = f.is_test ? [zh ? TEST_TAG.zh : TEST_TAG.en] : []
  const where = [f.address, f.unit ? (zh ? `${f.unit} 单元` : `Unit ${f.unit}`) : '', f.city && !f.address.toLowerCase().includes(f.city.toLowerCase()) ? f.city : ''].filter(Boolean).join(zh ? '，' : ', ')
  const specs = specsOf(f, lang)
  const rent = rentOf(f, lang)
  const desc = firstParagraph(f.description, lang)
  const title = titleIn(f.title, lang)
  const tags = zh
    ? ['#多伦多租房', f.city ? `#${cityTag(f.city)}租房` : '', '#Toronto租房', '#加拿大租房', '#出租'].filter(Boolean)
    : ['#TorontoRentals', f.city ? `#${cityTag(f.city)}Rentals` : '', '#ForRent', '#CanadaRentals', '#Apartment'].filter(Boolean)
  const hint = (c: ShareChannel) => SHARE_CHANNELS.find((x) => x.key === c)!.hint

  const xhsBody = [
    ...test,
    title || shortTitle(f, lang, 30),
    '',
    where ? `📍 ${where}` : '',
    rent ? `💰 ${rent}` : '',
    specs ? `🛏 ${specs}` : '',
    f.available_date ? (zh ? `📅 可入住：${f.available_date}` : `📅 Available: ${f.available_date}`) : '',
    amenitiesOf(f, lang, 5).length ? `✨ ${amenitiesOf(f, lang, 5).join(zh ? '、' : ', ')}` : '',
    desc ? '' : '',
    desc ? clip(desc, 200) : '',
    '',
    zh ? `看房、提问、申请（链接在评论区）：${link('xiaohongshu')}` : `Viewings, questions, applications (link in the first comment): ${link('xiaohongshu')}`,
    tags.join(' '),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''))

  const kijijiBody = [
    ...test,
    specs ? (zh ? `${specs}，${rent || ''}`.replace(/，$/, '') : `${specs}${rent ? ` · ${rent}` : ''}`) : rent,
    f.available_date ? (zh ? `可入住：${f.available_date}` : `Available: ${f.available_date}`) : '',
    amenitiesOf(f, lang, 8).length ? (zh ? '设施：' : 'Amenities: ') + amenitiesOf(f, lang, 8).join(zh ? '、' : ', ') : '',
    (f.utilities_included ?? []).filter(Boolean).length ? (zh ? '租金包含：' : 'Included: ') + (f.utilities_included ?? []).filter(Boolean).join(zh ? '、' : ', ') : '',
    desc ? '' : '',
    desc,
    '',
    zh ? `更多照片、看房与申请：${link('kijiji')}` : `More photos, viewings and applications: ${link('kijiji')}`,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''))

  const igBody = [
    ...test,
    title || shortTitle(f, lang, 40),
    [where, rent, specs].filter(Boolean).join(' · '),
    f.available_date ? (zh ? `可入住 ${f.available_date}` : `Available ${f.available_date}`) : '',
    desc ? clip(desc, 160) : '',
    '',
    zh ? `看房、提问、申请：${link('instagram')}（链接在简介）` : `Viewings, questions, applications: ${link('instagram')} (link in bio)`,
    '',
    tags.join(' '),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''))

  const replyBody = zh
    ? `你好！这套房${f.address ? `（${f.address}${f.unit ? ` ${f.unit}` : ''}）` : ''}的照片、看房、提问和申请都在这里：${link('reply')}\n填一下申请表，我就能安排看房时间。${f.is_test ? `\n${TEST_TAG.zh}` : ''}`
    : `Hi! Photos, viewings, questions and the application for this place${f.address ? ` (${f.address}${f.unit ? ` ${f.unit}` : ''})` : ''} are all here: ${link('reply')}\nFill in the application and I can set up a viewing time.${f.is_test ? `\n${TEST_TAG.en}` : ''}`

  return [
    { channel: 'wechat', title: title || shortTitle(f, lang, 30), body: buildSharePost(f, lang, link('wechat')), hint: hint('wechat'), link: link('wechat') },
    { channel: 'xiaohongshu', title: shortTitle(f, lang, 20), body: xhsBody.join('\n'), hint: hint('xiaohongshu'), link: link('xiaohongshu') },
    { channel: 'facebook_group', title: title || shortTitle(f, lang, 60), body: buildSharePost(f, lang, link('facebook_group')), hint: hint('facebook_group'), link: link('facebook_group') },
    { channel: 'facebook_marketplace', title: clip(title || shortTitle(f, lang, 100), 100), body: buildSharePost(f, lang, link('facebook_marketplace')), hint: hint('facebook_marketplace'), link: link('facebook_marketplace') },
    { channel: 'kijiji', title: shortTitle(f, lang, 64), body: kijijiBody.join('\n'), hint: hint('kijiji'), link: link('kijiji') },
    { channel: 'instagram', title: title || shortTitle(f, lang, 40), body: igBody.join('\n'), hint: hint('instagram'), link: link('instagram') },
    { channel: 'reply', title: zh ? '回复问房的人' : 'Reply to an enquiry', body: replyBody, hint: hint('reply'), link: link('reply') },
    { channel: 'poster', title: zh ? '二维码海报' : 'QR poster', body: link('poster'), hint: hint('poster'), link: link('poster') },
  ]
}
