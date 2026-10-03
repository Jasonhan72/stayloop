// Listing data in one language at a time (2026-10-02 · user: the listing detail
// page must not mix Chinese and English, except what has to stay English —
// addresses, street / neighbourhood / building / brand names).
//
// Pure, no 'use client': the detail page and /api/listings/enrich (edge) share
// it. Three layers, cheapest first:
//   1. splitBilingual — most Stayloop-written text already carries both
//      languages (【中文】…【English】, a '---' line, Chinese paragraphs then
//      English ones, "宠物友好 / Pets welcome"); show the half the UI wants.
//   2. Dictionaries — Realtor.ca's fixed vocabulary (Exercise Centre, Storage -
//      Locker, Forced air (Natural gas)…), our enum codes, TRREB labels.
//   3. Model translation — whatever is left (Realtor.ca remarks, Chinese-only
//      free text) is listed by collectTranslatables; /api/listings/enrich
//      translates it once and caches it in listing_translations by srcHash.
// Nothing here prints a value in the other language: a value it cannot place
// comes back null, and the page leaves it out (or waits for the translation).
// Tests: tests/listingLang20261002.spec.ts, tests/listingTranslations20261002.spec.ts.

export type ListingLang = 'zh' | 'en'
export type Bilingual = { zh: string | null; en: string | null }

// ── Language of a piece of text ─────────────────────────────────────────────

const HAN = /\p{Script=Han}/gu
const LATIN = /[A-Za-zÀ-ɏ]/g

/** zh / en / null (no letters at all: "$2,500", "✦"). Chinese text routinely
 *  carries English names ("位于 Downtown Bay Street 核心地段"), English text
 *  almost never carries Han, so a few Han characters are enough for zh. */
export function textLang(s: string): ListingLang | null {
  const han = (s.match(HAN) || []).length
  const latin = (s.match(LATIN) || []).length
  if (!han && !latin) return null
  if (!han) return 'en'
  if (!latin || han >= 4 || han / (han + latin) >= 0.15) return 'zh'
  return 'en'
}

const clean = (v: unknown): string => String(v ?? '').replace(/\r\n?/g, '\n').normalize('NFC').trim()
const tidy = (s: string): string => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

// ── 1. Splitting text that already holds both languages ─────────────────────

const MARKER_RE = /【\s*(中文|英文|English|ENGLISH|Chinese|CHINESE)\s*】|^[ \t]*\[\s*(中文|英文|English|Chinese)\s*\][ \t]*$/gm
const SEP_LINE = /^[ \t]*(?:-{3,}|—{2,}|_{3,}|\*{3,}|={3,}|~{3,})[ \t]*$/
// A slash or bar with a space on at least one side: "宠物友好 / Pets welcome",
// "免费室内停车位（1个）/ 1 Free…". Never "Security/Concierge", "A/C", "$100/月".
const PAIR_SEP = /[ \t]*[\/|｜／][ \t]+|[ \t]+[\/|｜／][ \t]*/

function markerLang(name: string): ListingLang {
  return /^(中文|chinese)$/i.test(name) ? 'zh' : 'en'
}

function stripSepEdges(s: string): string {
  const lines = s.split('\n')
  while (lines.length && (!lines[0].trim() || SEP_LINE.test(lines[0]))) lines.shift()
  while (lines.length && (!lines[lines.length - 1].trim() || SEP_LINE.test(lines[lines.length - 1]))) lines.pop()
  return lines.join('\n')
}

function bucketsFrom(parts: { lang: ListingLang | null; text: string }[]): Bilingual {
  const out: Record<ListingLang, string[]> = { zh: [], en: [] }
  for (const p of parts) if (p.lang && p.text.trim()) out[p.lang].push(p.text.trim())
  return { zh: out.zh.length ? tidy(out.zh.join('\n\n')) : null, en: out.en.length ? tidy(out.en.join('\n\n')) : null }
}

function single(t: string): Bilingual {
  const l = textLang(t)
  // Numbers / symbols only belong to both languages.
  if (!l) return { zh: t, en: t }
  return l === 'zh' ? { zh: t, en: null } : { zh: null, en: t }
}

function byMarkers(t: string): Bilingual {
  const parts: { lang: ListingLang | null; text: string }[] = []
  const re = new RegExp(MARKER_RE.source, 'gm')
  let last = 0
  let lang: ListingLang | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const before = stripSepEdges(t.slice(last, m.index))
    // Text before the first marker is classified by its script.
    if (before.trim()) parts.push({ lang: lang ?? textLang(before), text: before })
    lang = markerLang(m[1] || m[2] || '')
    last = m.index + m[0].length
  }
  const rest = stripSepEdges(t.slice(last))
  if (rest.trim()) parts.push({ lang: lang ?? textLang(rest), text: rest })
  return bucketsFrom(parts)
}

/** Blocks (paragraphs, or lines when there is only one paragraph) → exactly two
 *  contiguous runs of different languages = a bilingual text. One run = one
 *  language; anything that alternates is not a clean split and is classified
 *  as a whole. Separator lines ('---') count as paragraph breaks. */
function byBlocks(t: string): Bilingual | null {
  const lines = t.split('\n').map((ln) => (SEP_LINE.test(ln) ? '' : ln))
  const text = lines.join('\n').trim()
  let blocks = text.split(/\n[ \t]*\n+/).map((b) => b.trim()).filter(Boolean)
  if (blocks.length < 2) blocks = text.split('\n').map((b) => b.trim()).filter(Boolean)
  if (blocks.length < 2) return null
  const langs = blocks.map((b) => textLang(b))
  // A block with no letters ("✦", "$6,500") rides with its neighbour.
  for (let i = 0; i < langs.length; i++) if (!langs[i]) langs[i] = langs[i - 1] ?? null
  for (let i = langs.length - 1; i >= 0; i--) if (!langs[i]) langs[i] = langs[i + 1] ?? null
  const runs: { lang: ListingLang | null; text: string[] }[] = []
  blocks.forEach((b, i) => {
    const prev = runs[runs.length - 1]
    if (prev && prev.lang === langs[i]) prev.text.push(b)
    else runs.push({ lang: langs[i], text: [b] })
  })
  if (runs.length !== 2 || !runs[0].lang || !runs[1].lang) return null
  return bucketsFrom(runs.map((r) => ({ lang: r.lang, text: r.text.join('\n\n') })))
}

function byPair(t: string): Bilingual | null {
  const segs = t.split(PAIR_SEP).map((s) => s.trim()).filter(Boolean)
  if (segs.length < 2) return null
  const langs = segs.map((s) => textLang(s))
  for (let i = 0; i < langs.length; i++) if (!langs[i]) langs[i] = langs[i - 1] ?? null
  for (let i = langs.length - 1; i >= 0; i--) if (!langs[i]) langs[i] = langs[i + 1] ?? null
  if (!langs.includes('zh') || !langs.includes('en')) return null
  // Same-language segments of a title ("Downtown Toronto 精装三卧 | 全包服务式公寓…") join with " · ".
  const pick = (l: ListingLang) => segs.filter((_, i) => langs[i] === l).join(' · ')
  return { zh: pick('zh'), en: pick('en') }
}

/** The Chinese half and the English half of a stored text; a half that is not
 *  there is null. Handles 【中文】/【English】 (【英文】) blocks, '---' lines,
 *  Chinese paragraphs followed by English ones, and short "中文 / English" or
 *  "中文 | English" pairs. Text in one language fills one side only. */
export function splitBilingual(text: string | null | undefined): Bilingual {
  const t = clean(text)
  if (!t) return { zh: null, en: null }
  if (new RegExp(MARKER_RE.source, 'm').test(t)) {
    const b = byMarkers(t)
    if (b.zh || b.en) return b
  }
  if (t.includes('\n')) return byBlocks(t) ?? single(t)
  return byPair(t) ?? single(t)
}

/** The UI-language part of a stored text, or null when that language is absent. */
export function pickLang(text: string | null | undefined, lang: ListingLang): string | null {
  return splitBilingual(text)[lang]
}

/** Realtor.ca remarks end with the listing id in parentheses: "…Locker Included. (43963489)". */
export function cleanDescription(text: string | null | undefined): string {
  return clean(text).replace(/\s*\(\d{7,9}\)\s*$/, '').trim()
}

export function descriptionParts(text: string | null | undefined): Bilingual {
  return splitBilingual(cleanDescription(text))
}

// ── 2. Dictionaries ─────────────────────────────────────────────────────────

type Entry = { zh: string; en: string; also?: string[] }

/** Lookup key: case, width, dash / slash spacing and a trailing full stop do not matter. */
export function dictKey(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[’`]/g, "'")
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*&\s*/g, ' & ')
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/, '')
    .trim()
}

type Dict = { entries: Entry[]; index: Map<string, Entry>; conflicts: string[] }
function dict(entries: Entry[]): Dict {
  const index = new Map<string, Entry>()
  const conflicts: string[] = []
  for (const e of entries) {
    for (const k of [e.en, e.zh, ...(e.also || [])].map(dictKey)) {
      const prev = index.get(k)
      if (prev && prev !== e) conflicts.push(k)
      else index.set(k, e)
    }
  }
  return { entries, index, conflicts }
}
const lookup = (d: Dict, v: string): Entry | null => d.index.get(dictKey(v)) ?? null

// Amenities, building features and appliances share one vocabulary. The first
// block repeats the wizard ids and labels of lib/listingInsights.ts amenityLabel
// so a wizard listing reads the same as before.
const AMENITY = dict([
  { zh: '中央空调', en: 'Central A/C', also: ['central_ac', 'central a/c', 'central air conditioning', 'central air', 'central air-conditioning'] },
  { zh: '包暖', en: 'Heat included', also: ['heat_incl', 'heat included', 'heating included'] },
  { zh: '包水', en: 'Water included', also: ['water_incl', 'water included'] },
  { zh: '游泳池', en: 'Swimming pool', also: ['pool', 'swimming pool', 'pool (indoor/outdoor)'] },
  { zh: '健身房', en: 'Fitness centre', also: ['gym', 'fitness center', 'fitness room'] },
  { zh: '洗碗机', en: 'Dishwasher', also: ['dishwasher'] },
  { zh: '室内洗衣机', en: 'In-unit laundry', also: ['in_unit_laundry', 'in suite laundry', 'in-suite laundry', 'ensuite laundry', 'en-suite laundry', 'laundry in unit', 'washer/dryer', 'washer & dryer', 'in-unit washer/dryer', '洗衣烘干机'] },
  { zh: '24 小时前台', en: '24h concierge', also: ['concierge', '24-hour concierge', '24hr concierge', '24 hour concierge', '24-hr concierge', '24/7 concierge', 'concierge 24h', 'concierge (24 hour)', '24 小时礼宾'] },
  { zh: '1 个车位', en: '1 parking spot', also: ['parking_spot'] },
  { zh: '储物柜', en: 'Storage locker', also: ['storage', 'locker', 'storage-locker', 'storage locker', 'storage - locker', 'storage-locker included', 'locker included'] },
  { zh: '阳台', en: 'Balcony', also: ['balcony'] },
  { zh: '天台', en: 'Rooftop', also: ['rooftop'] },
  // Realtor.ca building amenities (Title Case on import) and the AI importer's phrases.
  { zh: '保安与礼宾', en: 'Security & concierge', also: ['security/concierge', 'concierge/security'] },
  { zh: '健身中心', en: 'Exercise centre', also: ['exercise center', 'exercise room'] },
  { zh: '派对室', en: 'Party room', also: ['party/meeting room', 'party room/meeting room'] },
  { zh: '康乐中心', en: 'Recreation centre', also: ['recreation center', 'rec room', 'recreation room'] },
  { zh: '访客停车', en: 'Visitor parking', also: ['visitor parking'] },
  { zh: '室内泳池', en: 'Indoor pool', also: ['indoor pool'] },
  { zh: '室外泳池', en: 'Outdoor pool', also: ['outdoor pool'] },
  { zh: '无地毯', en: 'Carpet-free', also: ['carpet free'] },
  { zh: '访客套房', en: 'Guest suite', also: ['guest suites'] },
  { zh: '屋顶露台', en: 'Rooftop deck', also: ['rooftop deck/garden', 'rooftop patio', 'roof top deck', 'roof terrace', 'rooftop terrace'] },
  { zh: '影音室', en: 'Media room', also: ['theatre', 'theater', 'media room', 'media/theatre room', 'movie theatre'] },
  { zh: '游戏室', en: 'Games room', also: ['game room', 'games room'] },
  { zh: '会议室', en: 'Meeting room', also: ['meeting room', 'meeting/party room'] },
  { zh: '商务中心', en: 'Business centre', also: ['business center'] },
  { zh: '图书室', en: 'Library', also: ['library'] },
  { zh: '休息室', en: 'Lounge', also: ['lounge', 'residents lounge'] },
  { zh: '桑拿', en: 'Sauna', also: ['sauna'] },
  { zh: '按摩浴池', en: 'Hot tub', also: ['whirlpool', 'hot tub', 'jacuzzi', 'spa'] },
  { zh: '烧烤区', en: 'BBQ area', also: ['bbqs allowed', 'bbq permitted', 'bbq', 'barbecue area'] },
  { zh: '自行车停放', en: 'Bicycle parking', also: ['bike parking'] },
  { zh: '自行车存放', en: 'Bike storage', also: ['bicycle storage'] },
  { zh: '洗车位', en: 'Car wash', also: ['car wash'] },
  { zh: '网球场', en: 'Tennis court', also: ['tennis court'] },
  { zh: '壁球场', en: 'Squash court', also: ['squash/racquet court', 'racquet court'] },
  { zh: '瑜伽室', en: 'Yoga studio', also: ['yoga room'] },
  { zh: '投币洗衣房', en: 'Coin laundry', also: ['coin laundry', 'laundry facilities', 'shared laundry', '公共洗衣房'] },
  { zh: '儿童游乐区', en: 'Playground', also: ['playground', 'kids play area', 'children play area'] },
  { zh: '花园', en: 'Garden', also: ['garden'] },
  { zh: '庭院', en: 'Courtyard', also: ['courtyard'] },
  { zh: '宠物洗护区', en: 'Pet wash station', also: ['pet spa', 'dog wash', 'pet wash'] },
  { zh: '电梯', en: 'Elevator', also: ['elevators', 'lift'] },
  { zh: '门禁对讲', en: 'Intercom', also: ['intercom', 'enterphone'] },
  { zh: '空调', en: 'Air conditioning', also: ['ac', 'a/c', 'air conditioning', 'air conditioner'] },
  { zh: '暖风供暖', en: 'Forced-air heating', also: ['forced air heating', 'forced-air heating'] },
  { zh: '包电费', en: 'Hydro included', also: ['hydro included', 'electricity included'] },
  { zh: '包网络', en: 'Internet included', also: ['internet included'] },
  { zh: '无线网络', en: 'Wi-Fi', also: ['wifi', 'wi-fi', 'wireless internet'] },
  { zh: '地下停车场', en: 'Underground parking', also: ['underground parking'] },
  { zh: '安防报警系统', en: 'Security alarm system', also: ['security alarm system', 'alarm system', 'security system'] },
  { zh: '私人露台', en: 'Private terrace', also: ['private terrace', 'terrace'] },
  { zh: '壁炉', en: 'Fireplace', also: ['fireplace'] },
  { zh: '多个壁炉', en: 'Multiple fireplaces', also: ['multiple fireplaces'] },
  { zh: '大理石装饰', en: 'Marble finishes', also: ['marble finishes'] },
  { zh: '大理石地面', en: 'Marble flooring', also: ['marble flooring', 'marble floors'] },
  { zh: '挑高天花板', en: 'Soaring ceilings', also: ['soaring ceilings', 'high ceilings'] },
  { zh: '拱形天花板', en: 'Cathedral ceiling', also: ['cathedral ceiling', 'cathedral ceilings'] },
  { zh: '木饰面书房', en: 'Wood-panelled library', also: ['wood-paneled library', 'wood paneled library'] },
  { zh: '高端厨房', en: 'Gourmet kitchen', also: ['gourmet kitchen'] },
  { zh: '厨房中岛', en: 'Kitchen island', also: ['kitchen island', 'island'] },
  { zh: '带中岛的厨房', en: 'Kitchen with centre island', also: ['centre island kitchen', 'center island kitchen'] },
  { zh: '备餐间', en: "Butler's pantry", also: ["butler's pantry", 'butlers pantry'] },
  { zh: '法式门', en: 'French doors', also: ['french doors'] },
  { zh: '水疗式主卫', en: 'Spa-style ensuite', also: ['spa ensuite', 'spa-like ensuite'] },
  { zh: '独立附属套间', en: 'In-law suite', also: ['in-law suite', 'inlaw suite'] },
  { zh: '精装地下室', en: 'Finished basement', also: ['finished basement'] },
  { zh: '硬木地板', en: 'Hardwood flooring', also: ['hardwood flooring', 'hardwood floors', 'hardwood floor'] },
  { zh: '瓷砖地面', en: 'Ceramic flooring', also: ['ceramic flooring', 'ceramic floors', 'ceramic tile'] },
  { zh: '花岗岩台面', en: 'Granite countertops', also: ['granite countertops', 'granite counters'] },
  { zh: '石英石台面', en: 'Quartz countertops', also: ['quartz countertops', 'quartz counters'] },
  { zh: '砖砌外墙', en: 'Brick exterior', also: ['brick exterior'] },
  { zh: '独立屋', en: 'Detached home', also: ['detached home', 'detached house'] },
  { zh: '落地窗', en: 'Floor-to-ceiling windows', also: ['floor to ceiling windows', 'floor-to-ceiling windows'] },
  // Halves of the "中文 / English" chips on Stayloop listings, for when only one half is stored.
  { zh: '厨房', en: 'Kitchen', also: ['kitchen'] },
  { zh: '专用工作空间', en: 'Dedicated workspace', also: ['dedicated workspace', 'workspace'] },
  { zh: '停车位', en: 'Parking', also: ['parking'] },
  { zh: '室内停车', en: 'Indoor parking', also: ['indoor parking'] },
  { zh: '全配家具', en: 'Fully furnished', also: ['fully furnished', 'furnished'] },
  { zh: '厨具餐具', en: 'Kitchenware', also: ['kitchenware', 'kitchen essentials'] },
  { zh: '双周保洁', en: 'Bi-weekly cleaning', also: ['biweekly cleaning'] },
  { zh: '大堂礼宾', en: 'Lobby concierge', also: ['lobby concierge'] },
  { zh: '床品毛巾', en: 'Linens & towels', also: ['linens and towels', 'linens & towels', 'bedding & towels'] },
  { zh: '智能电视', en: 'Smart TV', also: ['smart tv'] },
  { zh: '水电气暖全包', en: 'Utilities included', also: ['utilities included', 'all utilities included', 'all-inclusive', 'all inclusive'] },
  { zh: '湖景阳台', en: 'Lake-view balcony', also: ['lake view balcony'] },
  { zh: '洗衣机', en: 'Washer', also: ['washer', 'washing machine'] },
  // Realtor.ca appliances.
  { zh: '灶台', en: 'Cooktop', also: ['cooktop', 'cook top'] },
  { zh: '烘干机', en: 'Dryer', also: ['dryer', 'clothes dryer'] },
  { zh: '家具', en: 'Furniture', also: ['furniture'] },
  { zh: '抽油烟机', en: 'Range hood', also: ['hood fan', 'range hood', 'exhaust fan'] },
  { zh: '微波炉', en: 'Microwave', also: ['microwave', 'microwave range hood combo'] },
  { zh: '烤箱', en: 'Oven', also: ['oven', 'oven - built-in', 'built-in oven', 'wall oven'] },
  { zh: '冰箱', en: 'Refrigerator', also: ['refrigerator', 'fridge'] },
  { zh: '炉灶', en: 'Stove', also: ['stove', 'range'] },
  { zh: '窗帘 / 百叶窗', en: 'Window coverings', also: ['window coverings', 'blinds'] },
  { zh: '冰柜', en: 'Freezer', also: ['freezer'] },
  { zh: '酒柜', en: 'Wine fridge', also: ['wine fridge', 'wine cooler'] },
  { zh: '中央吸尘系统', en: 'Central vacuum', also: ['central vacuum'] },
  { zh: '车库门遥控器', en: 'Garage door opener', also: ['garage door opener', 'garage door opener remote(s)'] },
  { zh: '软水机', en: 'Water softener', also: ['water softener'] },
  { zh: '热水器', en: 'Water heater', also: ['water heater', 'hot water tank'] },
  { zh: '厨余粉碎机', en: 'Garburator', also: ['garburator', 'garbage disposal'] },
  { zh: '加湿器', en: 'Humidifier', also: ['humidifier'] },
])

const UTILITY = dict([
  { zh: '电', en: 'Hydro', also: ['hydro', 'electricity', 'electric'] },
  { zh: '水', en: 'Water', also: ['water'] },
  { zh: '暖气', en: 'Heat', also: ['heat', 'heating'] },
  { zh: '燃气', en: 'Gas', also: ['gas', 'natural gas'] },
  { zh: '网络', en: 'Internet', also: ['internet', 'wifi', 'wi-fi'] },
  { zh: '有线电视', en: 'Cable TV', also: ['cable', 'cable tv'] },
])

const PROPERTY_TYPE = dict([
  { zh: '出租公寓', en: 'Apartment', also: ['apartment'] },
  { zh: '共管公寓', en: 'Condo', also: ['condo', 'condominium', 'condo apartment'] },
  { zh: '独立屋', en: 'House', also: ['house', 'detached'] },
  { zh: '联排', en: 'Townhouse', also: ['townhouse', 'town house', 'condo townhouse'] },
  { zh: '地下室套间', en: 'Basement suite', also: ['basement'] },
  { zh: '双拼屋', en: 'Duplex', also: ['duplex'] },
  { zh: '三拼屋', en: 'Triplex', also: ['triplex'] },
  { zh: '半独立屋', en: 'Semi-detached house', also: ['semi_detached', 'semi-detached', 'semi detached'] },
  { zh: '阁楼公寓', en: 'Loft', also: ['loft'] },
  { zh: '开间', en: 'Studio', also: ['studio', 'bachelor'] },
  { zh: '单间', en: 'Room', also: ['room', 'private room'] },
  { zh: '其他', en: 'Other', also: ['other'] },
])

const OWNERSHIP = dict([
  { zh: '共管产权', en: 'Condominium', also: ['condominium', 'condominium/strata', 'condo', 'strata'] },
  { zh: '永久产权', en: 'Freehold', also: ['freehold'] },
  { zh: '租赁产权', en: 'Leasehold', also: ['leasehold'] },
  { zh: '合作产权', en: 'Co-op', also: ['co-op', 'cooperative', 'co-operative'] },
])

// The detail page's own labels for these two enums (Policies grid).
const PETS_ALLOWED = dict([
  { zh: '允许', en: 'Allowed', also: ['yes'] },
  { zh: '有限制', en: 'With restrictions', also: ['restricted'] },
  { zh: '房东写「不允许」', en: 'Listed as “no pets”', also: ['no'] },
])
const SMOKING = dict([
  { zh: '禁止', en: 'No smoking', also: ['no'] },
  { zh: '允许', en: 'Allowed', also: ['yes'] },
  { zh: '仅室外', en: 'Outdoors only', also: ['outdoor_only'] },
])

const PET_POLICY = dict([
  { zh: '宠物友好', en: 'Pet-friendly', also: ['pet friendly', 'pets welcome', 'pets allowed', 'pets ok', 'pets okay', '可养宠物', '允许养宠物', '欢迎宠物'] },
  { zh: '允许养宠（有限制）', en: 'Pets allowed with restrictions', also: ['restricted', 'pets restricted', 'pets allowed (restrictions apply)', 'restrictions apply', '宠物有限制'] },
  { zh: '不允许养宠物', en: 'No pets', also: ['pets not allowed', 'no pets allowed', '不可养宠物', '禁止宠物', '禁养宠物'] },
  { zh: '仅限猫', en: 'Cats only', also: ['cat only', '只限猫'] },
  { zh: '小型宠物可以', en: 'Small pets OK', also: ['small pets allowed', 'small pets welcome', '小型宠物可', '允许小型宠物'] },
])

const LEASE_WORDS = dict([
  { zh: '可短租', en: 'Short-term OK', also: ['short-term', 'short term', 'short-term ok', 'short term ok', 'short-term available', '短租'] },
  { zh: '按月', en: 'Month-to-month', also: ['month to month', 'monthly', '逐月', '月租'] },
  { zh: '租期灵活', en: 'Flexible', also: ['flexible', 'flexible term', '灵活'] },
  { zh: '长租', en: 'Long-term', also: ['long-term', 'long term'] },
])

const HEATING = dict([
  { zh: '暖风', en: 'Forced air', also: ['forced air', 'forced-air', 'furnace'] },
  { zh: '踢脚线电暖器', en: 'Baseboard heaters', also: ['baseboard heaters', 'baseboard', 'electric baseboard'] },
  { zh: '辐射采暖', en: 'Radiant heat', also: ['radiant heat', 'radiant'] },
  { zh: '热泵', en: 'Heat pump', also: ['heat pump'] },
  { zh: '热水暖气片', en: 'Hot water radiators', also: ['hot water radiator heat', 'hot water radiators', 'radiator', 'radiators'] },
  { zh: '锅炉', en: 'Boiler', also: ['boiler'] },
  { zh: '地暖', en: 'In-floor heating', also: ['in floor heating', 'radiant floor', 'heated floors'] },
  { zh: '风机盘管', en: 'Fan coil', also: ['fan coil'] },
  { zh: '柴炉', en: 'Wood stove', also: ['wood stove'] },
])
const FUEL = dict([
  { zh: '天然气', en: 'Natural gas', also: ['natural gas', 'gas'] },
  { zh: '电', en: 'Electric', also: ['electric', 'electricity'] },
  { zh: '燃油', en: 'Oil', also: ['oil'] },
  { zh: '丙烷', en: 'Propane', also: ['propane'] },
  { zh: '木材', en: 'Wood', also: ['wood'] },
  { zh: '太阳能', en: 'Solar', also: ['solar'] },
  { zh: '地热', en: 'Geothermal', also: ['geothermal', 'geo thermal'] },
])
const COOLING = dict([
  { zh: '中央空调', en: 'Central air conditioning', also: ['central air', 'central a/c', 'central air-conditioning'] },
  { zh: '新风换气系统', en: 'Air exchanger', also: ['air exchanger'] },
  { zh: '壁挂式空调', en: 'Wall unit', also: ['wall unit', 'wall unit(s)'] },
  { zh: '窗式空调', en: 'Window air conditioner', also: ['window air conditioner', 'window unit'] },
  { zh: '无管道空调', en: 'Ductless', also: ['ductless', 'ductless mini-split'] },
  { zh: '热泵', en: 'Heat pump', also: ['heat pump'] },
  { zh: '有空调', en: 'Air conditioned', also: ['air conditioned', 'ac', 'a/c'] },
  { zh: '全屋空调', en: 'Fully air conditioned', also: ['fully air conditioned'] },
  { zh: '部分空调', en: 'Partially air conditioned', also: ['partially air conditioned'] },
  { zh: '通风系统', en: 'Ventilation system', also: ['ventilation system'] },
  { zh: '无', en: 'None', also: ['none'] },
])
const BASEMENT = dict([
  { zh: '已装修', en: 'Finished', also: ['finished'] },
  { zh: '未装修', en: 'Unfinished', also: ['unfinished'] },
  { zh: '部分装修', en: 'Partially finished', also: ['partially finished'] },
  { zh: '全地下室', en: 'Full', also: ['full'] },
  { zh: '部分地下室', en: 'Partial', also: ['partial'] },
  { zh: '地下室公寓', en: 'Apartment', also: ['apartment'] },
  { zh: '独立入口', en: 'Separate entrance', also: ['separate entrance'] },
  { zh: '可直通户外', en: 'Walk-out', also: ['walk out', 'walkout', 'walk-out'] },
  { zh: '爬行空间', en: 'Crawl space', also: ['crawl space'] },
  { zh: '无', en: 'None', also: ['none', 'n/a', 'no basement'] },
])
const EXTERIOR = dict([
  { zh: '混凝土', en: 'Concrete', also: ['concrete'] },
  { zh: '铝制外墙板', en: 'Aluminum siding', also: ['aluminum siding', 'aluminium siding'] },
  { zh: '砖', en: 'Brick', also: ['brick'] },
  { zh: '砖饰面', en: 'Brick veneer', also: ['brick veneer'] },
  { zh: '石材', en: 'Stone', also: ['stone'] },
  { zh: '石饰面', en: 'Stone veneer', also: ['stone veneer'] },
  { zh: '灰泥', en: 'Stucco', also: ['stucco'] },
  { zh: '乙烯基外墙板', en: 'Vinyl siding', also: ['vinyl siding', 'vinyl'] },
  { zh: '木材', en: 'Wood', also: ['wood'] },
  { zh: '木质外墙板', en: 'Wood siding', also: ['wood siding'] },
  { zh: '玻璃', en: 'Glass', also: ['glass'] },
  { zh: '金属', en: 'Metal', also: ['metal', 'steel'] },
  { zh: '砌块', en: 'Block', also: ['block', 'concrete block'] },
])
const PARKING = dict([
  { zh: '无车库', en: 'No garage', also: ['no garage'] },
  { zh: '地下车库', en: 'Underground garage', also: ['underground, garage', 'underground garage', 'garage, underground'] },
  { zh: '地下停车', en: 'Underground', also: ['underground'] },
  { zh: '车库', en: 'Garage', also: ['garage'] },
  { zh: '附属车库', en: 'Attached garage', also: ['attached garage'] },
  { zh: '独立车库', en: 'Detached garage', also: ['detached garage'] },
  { zh: '露天车位', en: 'Surface', also: ['surface', 'outside', 'open'] },
  { zh: '有顶车位', en: 'Covered', also: ['covered'] },
  { zh: '车棚', en: 'Carport', also: ['carport'] },
  { zh: '纵列车位', en: 'Tandem', also: ['tandem'] },
  { zh: '路边停车', en: 'Street parking', also: ['street', 'on street', 'street parking'] },
  { zh: '访客停车', en: 'Visitor parking', also: ['visitor parking'] },
  { zh: '共用车位', en: 'Shared', also: ['shared'] },
  { zh: '无车位', en: 'No parking', also: ['none', 'no parking', 'no parking included', '无停车位', '无车位'] },
  { zh: '不含车位', en: 'Not included', also: ['not included', 'parking not included', '不含车位'] },
  { zh: '其他', en: 'Other', also: ['other'] },
])
const TRREB_AREA = dict([
  { zh: 'TRREB 全区', en: 'All TRREB Areas', also: ['all trreb areas'] },
  { zh: '多伦多西区', en: 'Toronto West', also: [] },
  { zh: '多伦多东区', en: 'Toronto East', also: [] },
  { zh: '多伦多中区', en: 'Toronto Central', also: [] },
])

/** Every dictionary, for the tests (no key may map to two different entries). */
export const LISTING_DICTIONARIES: Record<string, { entries: { zh: string; en: string }[]; conflicts: string[] }> = {
  amenity: AMENITY, utility: UTILITY, property_type: PROPERTY_TYPE, ownership_title: OWNERSHIP, pets_allowed: PETS_ALLOWED,
  smoking_policy: SMOKING, pet_policy: PET_POLICY, lease_term: LEASE_WORDS, heating: HEATING, heating_fuel: FUEL,
  cooling: COOLING, basement_type: BASEMENT, exterior_finish: EXTERIOR, parking: PARKING, trreb_area: TRREB_AREA,
}

// ── Rules for the free-text fields ──────────────────────────────────────────

const TBD_ZH = /^(待确认|待定|待告知|待商议|未确定|请咨询)/
const TBD_EN = /^(tbd|tbc|to be confirmed|to be determined|to be advised|unknown|ask (?:the )?(?:landlord|agent))\b/i

/** "Forced air, Radiant" → each item through the dictionary; null when any item is unknown. */
function mapList(d: Dict, v: string, lang: ListingLang): string | null {
  const whole = lookup(d, v)
  if (whole) return whole[lang]
  const items = v.split(/\s*[,;，；、]\s*/).filter(Boolean)
  if (!items.length) return null
  const out: string[] = []
  for (const it of items) {
    const hit = lookup(d, it)
    if (!hit) return null
    out.push(hit[lang])
  }
  return out.join(lang === 'zh' ? '、' : ', ')
}

/** "<type> (<detail>)" — "Forced air (Natural gas)", "Full (Finished)". */
function mapParen(main: Dict, detail: Dict, v: string, lang: ListingLang): string | null {
  const m = v.match(/^(.+?)\s*[(（]\s*(.+?)\s*[)）]\s*$/)
  if (!m) return mapList(main, v, lang)
  const a = mapList(main, m[1], lang)
  const b = mapList(detail, m[2], lang)
  if (!a || !b) return null
  return lang === 'zh' ? `${a}（${b}）` : `${a} (${b})`
}

/** "4-car tandem garage", "4 car garage" (Realtor.ca parking and the AI importer's amenities). */
function garageRule(v: string, lang: ListingLang): string | null {
  const m = v.trim().match(/^(\d{1,2})\s*[- ]?\s*car\s+(tandem\s+)?garage$/i)
  if (!m) return null
  return lang === 'zh' ? `${m[1]} 车位${m[2] ? '纵列' : ''}车库` : `${m[1]}-car ${m[2] ? 'tandem ' : ''}garage`
}

function parkingRule(v: string, lang: ListingLang): string | null {
  const s = v.trim()
  const garage = garageRule(s, lang)
  if (garage) return garage
  let m = s.match(/^(\d{1,2})\s+underground(?:\s+(?:spots?|spaces?|parking))?(\s+included)?$/i)
  if (m) return lang === 'zh' ? `${m[1]} 个地下车位${m[2] ? '（含）' : ''}` : `${m[1]} underground spot${m[1] === '1' ? '' : 's'}${m[2] ? ' included' : ''}`
  m = s.match(/^(\d{1,2})\s+(?:parking\s+)?(?:spots?|spaces?)(\s+included)?$/i)
  if (m) return lang === 'zh' ? `${m[1]} 个车位${m[2] ? '（含）' : ''}` : `${m[1]} parking spot${m[1] === '1' ? '' : 's'}${m[2] ? ' included' : ''}`
  // "不含车位（可选租 $100/月）" — the 1001 Bay walk-through listing.
  m = s.match(/^不含车位[（(]\s*可(?:选)?(?:另)?租\s*\$?\s*([\d,]+)\s*\/\s*月\s*[)）]$/)
  if (m) return lang === 'zh' ? s : `Not included (available for $${m[1]}/month)`
  m = s.match(/^(?:含|包含)\s*(一|1|两|2|二)\s*个?\s*(?:停)?车位$/)
  if (m) { const n = /一|1/.test(m[1]) ? 1 : 2; return lang === 'zh' ? s : `${n} parking spot${n === 1 ? '' : 's'} included` }
  return mapList(PARKING, s, lang)
}

function leaseRule(v: string, lang: ListingLang): string | null {
  const s = v.trim()
  const parts = s.split(/\s*[\/,;，；、]\s*/).filter(Boolean)
  if (parts.length > 1) {
    const each = parts.map((p) => leaseRule(p, lang))
    return each.every(Boolean) ? each.join(' / ') : null
  }
  let m = s.match(/^(?:min(?:imum)?\.?\s*(?:of\s*)?)?(\d{1,2})\s*[- ]?\s*(?:months?|mos?\.?|个月|月)(?:\s*(?:lease|term))?\s*(minimum|min\.?|起|以上|or more|\+)?$/i)
  if (m) {
    const n = Number(m[1])
    const min = !!m[2] || /^min/i.test(s)
    return lang === 'zh' ? `${n} 个月${min ? '起' : ''}` : `${n} month${n === 1 ? '' : 's'}${min ? ' minimum' : ''}`
  }
  m = s.match(/^(?:min(?:imum)?\.?\s*)?(\d{1,2})\s*[- ]?\s*(?:years?|yrs?|年)(?:\s*(?:lease|term))?\s*(minimum|min\.?|起|以上|or more|\+)?$/i)
  if (m) {
    const n = Number(m[1])
    const min = !!m[2] || /^min/i.test(s)
    return lang === 'zh' ? `${n} 年${min ? '起' : ''}` : `${n} year${n === 1 ? '' : 's'}${min ? ' minimum' : ''}`
  }
  const hit = lookup(LEASE_WORDS, s)
  return hit ? hit[lang] : null
}

function landSizeRule(v: string, lang: ListingLang): string | null {
  // Numbers and unit words only ("50 x 120 FT", "0 - 0.49 ac").
  const units: [RegExp, string][] = [[/\bsq\.?\s?ft\b|\bsqft\b|ft²/gi, '平方英尺'], [/\bacres?\b|\bac\b/gi, '英亩'], [/\bhectares?\b|\bha\b/gi, '公顷'], [/\bfeet\b|\bft\b/gi, '英尺'], [/\bm²|\bsq\.?\s?m\b/gi, '平方米'], [/\bm\b/gi, '米']]
  let rest = v
  for (const [re] of units) rest = rest.replace(re, ' ')
  if (/[A-Za-z\p{Script=Han}]/u.test(rest.replace(/\bx\b/gi, ' '))) return null
  if (lang === 'en') return v
  let out = v
  for (const [re, zh] of units) out = out.replace(re, ` ${zh}`)
  return out.replace(/\s+/g, ' ').replace(/\s*x\s*/gi, ' × ').trim()
}

function trrebPeriod(v: string, lang: ListingLang): string | null {
  const m = v.trim().match(/^(\d{4})\s*-?\s*Q([1-4])$/i)
  if (!m) return null
  return lang === 'zh' ? `${m[1]} 年第 ${m[2]} 季度` : `${m[1]} Q${m[2]}`
}

// ── 2b. One value in the UI language ────────────────────────────────────────

export type ListingListField = 'amenities' | 'building_features' | 'appliances' | 'utilities_included'
export type ListingScalarField =
  | 'pet_policy' | 'parking' | 'lease_term' | 'land_size'
  | 'heating_type' | 'heating_fuel' | 'cooling' | 'basement_type' | 'exterior_finish'
  | 'property_type' | 'ownership_title' | 'pets_allowed' | 'smoking_policy'
export type ListingValueField = ListingListField | ListingScalarField | 'trreb_area' | 'trreb_period'

const CODE_FIELDS: Partial<Record<ListingValueField, Dict>> = {
  property_type: PROPERTY_TYPE, ownership_title: OWNERSHIP, utilities_included: UTILITY, pets_allowed: PETS_ALLOWED, smoking_policy: SMOKING,
}
const VOCAB_FIELDS = new Set<ListingValueField>(['amenities', 'building_features', 'appliances'])

/** "semi_detached" → "Semi detached" (an unknown enum code shown in English). */
function humanizeCode(v: string): string {
  const s = v.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Rule-based translation of a single-language value into `lang`; null when no rule covers it. */
function ruleFor(field: ListingValueField, v: string, lang: ListingLang): string | null {
  if (field === 'parking' || field === 'pet_policy' || field === 'lease_term') {
    if (TBD_ZH.test(v) || TBD_EN.test(v)) return lang === 'zh' ? '待确认' : 'To be confirmed'
  }
  switch (field) {
    case 'parking': return parkingRule(v, lang)
    case 'lease_term': return leaseRule(v, lang)
    case 'pet_policy': { const hit = lookup(PET_POLICY, v); return hit ? hit[lang] : null }
    case 'heating_type': return mapParen(HEATING, FUEL, v, lang)
    case 'heating_fuel': return mapList(FUEL, v, lang)
    case 'cooling': return mapList(COOLING, v, lang)
    case 'basement_type': return mapParen(BASEMENT, BASEMENT, v, lang)
    case 'exterior_finish': return mapList(EXTERIOR, v, lang)
    case 'land_size': return landSizeRule(v, lang)
    default: return null
  }
}

/**
 * One stored value in the UI language, or null when that needs a model
 * translation (or cannot be shown). Never returns text in the other language.
 *  - "中文 / English" pairs → the matching half;
 *  - amenities / appliances / building features → the shared vocabulary
 *    (also when already in the UI language: "Storage - Locker" → "Storage locker");
 *  - enum codes (property_type, ownership_title, utilities, pets_allowed,
 *    smoking_policy) → labels; an unknown code is humanised in English, null in Chinese;
 *  - free text already in the UI language → as stored; otherwise the field's rules;
 *  - TRREB areas keep municipality names and district codes (proper nouns).
 */
export function localizeValue(field: ListingValueField, raw: unknown, lang: ListingLang): string | null {
  const v = clean(raw)
  if (!v) return null
  if (field === 'trreb_period') return trrebPeriod(v, lang) ?? (textLang(v) === lang || textLang(v) == null ? v : null)
  if (field === 'trreb_area') {
    const hit = lookup(TRREB_AREA, v)
    if (hit) return hit[lang]
    // District codes ("Toronto C01") and municipality names are proper nouns.
    return textLang(v) === 'zh' && lang === 'en' ? null : v
  }
  const code = CODE_FIELDS[field]
  if (code) {
    const hit = lookup(code, v)
    if (hit) return hit[lang]
    const l = textLang(v)
    if (l === 'zh') return lang === 'zh' ? v : null
    return lang === 'en' ? humanizeCode(v) : null
  }
  const parts = splitBilingual(v)
  if (parts.zh && parts.en) {
    // A pair: the matching half (amenity halves still go through the vocabulary for consistency).
    const half = parts[lang] as string
    if (VOCAB_FIELDS.has(field)) { const hit = lookup(AMENITY, half); return hit ? hit[lang] : half }
    return half
  }
  const one = parts.zh ?? parts.en ?? v
  const srcLang = textLang(one)
  if (!srcLang) return one
  if (VOCAB_FIELDS.has(field)) {
    const hit = lookup(AMENITY, one)
    if (hit) return hit[lang]
    const garage = garageRule(one, lang)
    if (garage) return garage
    return srcLang === lang ? one : null
  }
  if (srcLang === lang) return one
  return ruleFor(field, one, lang)
}

/** The text a model would translate when localizeValue returns null (the other-language half, or the value). */
export function translationSource(field: ListingValueField, raw: unknown, lang: ListingLang): string | null {
  const v = clean(raw)
  if (!v || localizeValue(field, v, lang) !== null) return null
  if (field === 'trreb_area' || field === 'trreb_period' || field === 'pets_allowed' || field === 'smoking_policy') return null
  if (CODE_FIELDS[field]) return humanizeCode(v)
  const parts = splitBilingual(v)
  return (lang === 'zh' ? parts.en : parts.zh) ?? v
}

/** The value in the UI language, using a cached model translation when no rule covers it. */
export function resolveValue(field: ListingValueField, raw: unknown, lang: ListingLang, strings?: Record<string, string> | null): string | null {
  const local = localizeValue(field, raw, lang)
  if (local !== null) return local
  const src = translationSource(field, raw, lang)
  const hit = src && strings ? strings[src] : undefined
  return typeof hit === 'string' && hit.trim() ? hit.trim() : null
}

/** A list field in the UI language: unresolved items are left out, duplicates
 *  ("Locker" and "Storage - Locker" are both 储物柜) appear once. */
export function resolveList(field: ListingListField, items: unknown, lang: ListingLang, strings?: Record<string, string> | null): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const it of Array.isArray(items) ? items : []) {
    if (typeof it !== 'string' || !it.trim()) continue
    const label = resolveValue(field, it, lang, strings)
    if (!label) continue
    const k = dictKey(label)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(label)
  }
  return out
}

export type ResolvedDescription = {
  /** The description in the UI language (as written, or translated), else null. */
  text: string | null
  /** True when `text` came from the model translation (label it as machine-translated). */
  translated: boolean
  /** The other-language text when `text` is null, so the page can show it under an "original language" label. */
  original: string | null
  originalLang: ListingLang | null
}

export function resolveDescription(raw: unknown, lang: ListingLang, strings?: Record<string, string> | null): ResolvedDescription {
  const parts = descriptionParts(typeof raw === 'string' ? raw : null)
  const own = parts[lang]
  if (own) return { text: own, translated: false, original: null, originalLang: null }
  const other: ListingLang = lang === 'zh' ? 'en' : 'zh'
  const src = parts[other]
  if (!src) return { text: null, translated: false, original: null, originalLang: null }
  const hit = strings ? strings[src] : undefined
  if (typeof hit === 'string' && hit.trim()) return { text: hit.trim(), translated: true, original: null, originalLang: null }
  return { text: null, translated: false, original: src, originalLang: other }
}

// ── 3. What still needs a model translation ─────────────────────────────────

export type TranslatableListing = {
  description?: string | null
  pet_policy?: string | null
  parking?: string | null
  lease_term?: string | null
  land_size?: string | null
  heating_type?: string | null
  heating_fuel?: string | null
  cooling?: string | null
  basement_type?: string | null
  exterior_finish?: string | null
  property_type?: string | null
  ownership_title?: string | null
  amenities?: unknown
  building_features?: unknown
  appliances?: unknown
  utilities_included?: unknown
  /** When set, the page shows its label and pet_policy is not on screen — nothing to translate. */
  pets_allowed?: string | null
  /** When set, the page shows the count and the free-text parking is not on screen. */
  parking_spaces?: number | null
}

/** Free text the detail page does not show for this listing (a structured field wins), so it is never sent for translation. */
function hiddenOnPage(l: TranslatableListing, f: ListingScalarField): boolean {
  if (f === 'pet_policy') return l.pets_allowed === 'yes' || l.pets_allowed === 'restricted' || l.pets_allowed === 'no'
  if (f === 'parking') return !!l.parking_spaces
  return false
}

const SCALAR_TRANSLATABLE: Exclude<ListingScalarField, 'pets_allowed' | 'smoking_policy'>[] = [
  'pet_policy', 'parking', 'lease_term', 'land_size', 'heating_type', 'heating_fuel',
  'cooling', 'basement_type', 'exterior_finish', 'property_type', 'ownership_title',
]
const LIST_TRANSLATABLE: ListingListField[] = ['amenities', 'building_features', 'appliances', 'utilities_included']

export const TRANSLATION_CANON = 'stayloop-listing-lang-v1'

/**
 * Source strings that still need a model translation into `lang` after the
 * split and the dictionaries, sorted and de-duplicated, plus srcHash = SHA-256
 * hex of the canonical JSON {v, lang, strings}. The same listing data always
 * gives the same hash, so the enrich route can reuse a cached translation.
 */
export function collectTranslatables(l: TranslatableListing, lang: ListingLang): { lang: ListingLang; strings: string[]; srcHash: string } {
  const set = new Set<string>()
  const d = descriptionParts(l.description)
  if (!d[lang]) {
    const src = d[lang === 'zh' ? 'en' : 'zh']
    if (src) set.add(src)
  }
  for (const f of SCALAR_TRANSLATABLE) {
    if (hiddenOnPage(l, f)) continue
    const src = translationSource(f, l[f], lang)
    if (src) set.add(src)
  }
  for (const f of LIST_TRANSLATABLE) {
    const items = Array.isArray(l[f]) ? (l[f] as unknown[]) : []
    for (const it of items) {
      if (typeof it !== 'string') continue
      const src = translationSource(f, it, lang)
      if (src) set.add(src)
    }
  }
  const strings = [...set].sort()
  return { lang, strings, srcHash: sha256Hex(JSON.stringify({ v: TRANSLATION_CANON, lang, strings })) }
}

/** Shortest first, within a per-string and a total character budget (one model call). */
export function budgetSources(strings: string[], maxTotal = 12_000, maxEach = 6_000): string[] {
  const out: string[] = []
  let total = 0
  for (const s of [...strings].filter((x) => x.length <= maxEach).sort((a, b) => a.length - b.length)) {
    if (total + s.length > maxTotal) break
    out.push(s)
    total += s.length
  }
  return out
}

// ── Number backstop for model translations ──────────────────────────────────

const ZH_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const ZH_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }

function zhToInt(s: string): number | null {
  if (![...s].some((c) => c in ZH_UNIT)) {
    // "二〇二六" — digit by digit.
    const ds = [...s].map((c) => ZH_DIGIT[c])
    return ds.every((d) => d !== undefined) ? Number(ds.join('')) : null
  }
  let total = 0, section = 0, num = 0
  for (const c of s) {
    if (c in ZH_DIGIT) num = ZH_DIGIT[c]
    else if (c === '万') { total += (section + num) * 10000; section = 0; num = 0 }
    else if (c in ZH_UNIT) { section += (num || 1) * ZH_UNIT[c]; num = 0 }
    else return null
  }
  return total + section + num
}

// Chinese numerals count as numbers only before a measure word or after 第 —
// "一应俱全" is not a 1.
const ZH_NUM_RE = /(第)?([零〇一二两三四五六七八九十百千万]+)(?=\s*(?:个|间|卧|卫|房|厅|室|层|楼|位|年|月|日|天|周|星期|分钟|小时|尺|平|米|公里|英里|站|条|套|张|台|次|号|岁|倍|成|折|元|块|家|所|栋|居|床|浴|期|季|人|口|只|辆|部|座|扇|把|项|处|种|级|分))/g
const EN_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, dozen: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  single: 1, double: 2, triple: 3, twice: 2, once: 1,
}
// A month name is a number once translated: "Available November 1st" → 「11月1日起」 (2026-10-03, a Streetsville
// listing's Chinese translation was rejected for the "new" 11). "may" also matches the verb — it only allows a 5.
const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const canonNum = (s: string): string => {
  const n = Number(s)
  return Number.isFinite(n) ? String(n) : s
}

/** The numbers written in digits, thousands separators removed ("$6,500" → 6500, "6 500" → 6500). */
export function digitNumbers(s: string): string[] {
  const t = s.normalize('NFKC').replace(/(\d)[,   '](?=\d{3}(?!\d))/g, '$1').replace(/(\d)[,   '](?=\d{3}(?!\d))/g, '$1')
  return (t.match(/\d+(?:\.\d+)?/g) || []).map(canonNum)
}

/** Every number the source states: digits, Chinese numerals with a measure word, English number words. */
export function sourceNumbers(s: string): Set<string> {
  const out = new Set(digitNumbers(s))
  const t = s.normalize('NFKC')
  for (const m of t.matchAll(ZH_NUM_RE)) {
    const n = zhToInt(m[2])
    if (n != null) out.add(String(n))
  }
  for (const m of t.toLowerCase().matchAll(/\b([a-z]+)\b/g)) {
    if (m[1] in EN_WORDS) out.add(String(EN_WORDS[m[1]]))
    if (m[1] in EN_MONTHS) out.add(String(EN_MONTHS[m[1]]))
  }
  return out
}

/** Deterministic backstop: a translation may not state a number its source does not. */
export function translationKeepsNumbers(src: string, out: string): boolean {
  const allowed = sourceNumbers(src)
  return digitNumbers(out).every((n) => allowed.has(n))
}

/** A model translation we are willing to show: non-empty, actually in `lang`, not runaway, no new numbers. */
export function acceptTranslation(src: string, out: unknown, lang: ListingLang): out is string {
  if (typeof out !== 'string') return false
  const o = out.trim()
  if (!o || o.length > src.length * 6 + 120) return false
  const l = textLang(o)
  if (!l) { if (textLang(src)) return false }
  else if (l !== lang) return false
  // An English translation carries no Chinese at all — mixing is what this layer removes.
  else if (lang === 'en' && (o.match(HAN) || []).length > 0) return false
  return translationKeepsNumbers(src, o)
}

// ── SHA-256 (synchronous, so the page and the edge route compute the same hash without awaiting) ──

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

export function sha256Hex(s: string): string {
  const bytes = new TextEncoder().encode(s)
  const len = bytes.length
  const padded = (((len + 9) + 63) >> 6) << 6
  const buf = new Uint8Array(padded)
  buf.set(bytes)
  buf[len] = 0x80
  const view = new DataView(buf.buffer)
  const bits = len * 8
  view.setUint32(padded - 8, Math.floor(bits / 0x100000000))
  view.setUint32(padded - 4, bits >>> 0)
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const w = new Uint32Array(64)
  for (let off = 0; off < padded; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K256[i] + w[i]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('')
}
