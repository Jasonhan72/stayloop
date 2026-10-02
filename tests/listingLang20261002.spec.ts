// Listing data in one language (2026-10-02 · user: the detail page must not mix
// Chinese and English). Every fixture below is a real production value (audit
// of all 16 listings, 2026-10-02) — lib/listingLang.ts.
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  LISTING_DICTIONARIES,
  acceptTranslation,
  budgetSources,
  cleanDescription,
  collectTranslatables,
  descriptionParts,
  localizeValue,
  pickLang,
  resolveDescription,
  resolveList,
  resolveValue,
  sha256Hex,
  splitBilingual,
  textLang,
  translationKeepsNumbers,
  translationSource,
  type ListingLang,
  type ListingValueField,
} from '@/lib/listingLang'
import { parkingStat } from '@/lib/listingDisplay'

const HAN = /\p{Script=Han}/u
const LATIN = /[A-Za-z]/

// ── Real descriptions ───────────────────────────────────────────────────────

// A · Chinese paragraph + English paragraph, no marker (280 Dundas St W).
const DUNDAS = '位于市中心核心地段 280 Dundas St W，1 卧 1 卫精致公寓。步行即可到达 OCAD、多伦多大学、各大医院区、Eaton Centre 及 St. Patrick 地铁站，周边餐饮与生活配套极其便利。\n\nWell-located 1-bedroom, 1-bathroom condo unit at 280 Dundas St W. Steps to OCAD, U of T, Toronto General and Mount Sinai Hospitals, Eaton Centre, and St. Patrick subway station. Excellent downtown transit and amenities.'
// A · Chinese half carries "Downtown" and "（Locker）" (1001 Bay St).
const BAY = '位于 Downtown Bay Street 核心地段 1001 Bay St，室内面积达 799 平方英尺，户型方正通透。租金已包含 Rogers 高速网络及有线电视，附带独立储物柜（Locker）。楼内可另租车位（$100/月）。步行至多伦多大学、Queen\'s Park、地铁站及各大医院。无家具出租。\n\nSpacious 799 sqft 1-bedroom unit at prestigious 1001 Bay St. Rent includes Rogers high-speed internet and cable TV. Comes with a private locker. Parking available for extra $100/month. Steps to U of T, Queen\'s Park, Wellesley subway station, and Financial District. Unfurnished.'
// B · 【中文】…【English】 (28 Avondale Ave).
const AVONDALE = '【中文】\n时尚明亮的角落单位，落地窗将城市天际线与公园绿意尽收眼底。两间宽敞卧室、两间现代卫生间，全配家具，拎包即住。设备齐全的厨房、专用工作空间、智能电视、洗衣机及空调一应俱全。免费室内停车位（1个）。\n\n坐落于 Yonge & Sheppard 核心地带，步行即达地铁、餐厅、咖啡馆及购物中心，通勤极为便利。\n\n【English】\nStylish corner unit flooded with natural light through floor-to-ceiling windows, offering stunning city skyline and park views. Features 2 spacious bedrooms, 2 modern bathrooms, fully furnished — move-in ready. Fully equipped kitchen, dedicated workspace, smart TV, in-unit washer, and A/C included. 1 free indoor parking spot.\n\nPrime Yonge & Sheppard location — steps to subway, restaurants, cafés, and shopping. Ideal for professionals, couples, or families seeking comfort and easy access to downtown Toronto.'
// C · 【中文】 … --- 【English】 (155 Merchants' Wharf).
const MERCHANTS = '【中文】\n坐落于多伦多最受追捧的滨水社区 Bayside，Aquabella 707 单元提供无与伦比的湖景与精装生活体验。\n\n✦ 2 卧室 · 3 浴室，宽敞布局，动静分区\n✦ 落地玻璃幕墙，全日自然采光，湖景/城景一览无余\n✦ 高端厨电、石英石台面、欧式橱柜\n✦ 大露台/阳台，户外休闲空间\n✦ 步行可达 Sugar Beach、Distillery District、Union Station\n✦ 大楼设施：健身房、游泳池、Concierge 24h、访客停车\n\n月租 $6,500，12 个月起，欢迎符合条件的申请人。\n\n---\n\n【English】\nWelcome to Unit 707 at Aquabella, Bayside — one of Toronto\'s most prestigious waterfront addresses.\n\n✦ 2 Bedrooms | 3 Bathrooms | Open-concept layout with clear separation of living & sleeping zones\n✦ Floor-to-ceiling windows with stunning lake & city views\n✦ Premium appliances, quartz countertops, European cabinetry\n✦ Private balcony for outdoor living\n✦ Steps to Sugar Beach, Distillery District & Union Station\n✦ Building amenities: fitness centre, pool, 24h concierge, visitor parking\n\n$6,500/month | 12-month lease minimum | Qualified applicants welcome.'
// C · same layout with ✅ bullets (238 Simcoe St).
const SIMCOE = '【中文】\n多伦多市中心黄金地段，Entertainment District 核心。精装三卧两卫，全配家具，拎包即住。\n\n✅ 全包服务：WiFi、水电气暖、基础有线、厨具餐具、床品毛巾、双周保洁\n✅ 交通：步行3分钟至 St. Patrick / Osgoode 地铁站\n✅ 小型宠物欢迎（狗需 $500 押金）\n\n租期：12 个月起 · 月租 $6,500（含全部上述服务）\n\n---\n\n【English】\nPrime Downtown Toronto — heart of the Entertainment District. Fully furnished 3BR/2BA, move-in ready with all-inclusive services.\n\n✅ All-inclusive: WiFi, hydro/water/gas/heating, basic cable, full kitchenware, linens/towels, bi-weekly cleaning\n✅ Transit: 3-min walk to St. Patrick / Osgoode subway stations\n✅ Small pets welcome (dogs require $500 deposit)\n\nLease term: 12 months minimum · $6,500/mo all-inclusive'
// D · Chinese block + '---' + English block, no markers (1569 rue St-Hubert).
const HUBERT = '位于蒙特利尔 Ville-Marie 核心地带，步行可达 UQAM、Quartier des Spectacles 及地铁站。宽敞 4.5 房格局，全配家具，水电暖全包，拎包即住。\n\n✦ 单位亮点：单位内洗衣机/烘干机、洗碗机、私人阳台、中央空调\n✦ 大楼设施：24小时门卫、健身房、单车停车、电梯、储物间\n✦ 宠物友好 · 无停车位\n\n---\n\nLocated in the heart of Ville-Marie, steps from UQAM, Quartier des Spectacles, and metro access. Spacious 4.5-room layout with all utilities included — move-in ready.\n\n✦ Unit features: in-unit washer/dryer, dishwasher, private balcony, central A/C\n✦ Building amenities: 24/7 concierge, gym, bicycle parking, elevator, storage locker\n✦ Pet-friendly · No parking included'
// E · English-only Realtor.ca remarks ending with the Realtor id (181 Huron St, 297 College St).
const HURON = 'Welcome To Suite 601 At Designhaus, A Two Bedroom Split Design Located Just Across U Of T Campus At The Corner Of Huron & College. Excellent Downtown Convenience, Close To All Core Offices And Hospital Corridor On University Avenue. Unobstructed City Skylines View. Locker Included. (43963489)'
const COLLEGE = 'Awesome location, Awesome Unit! Minutes to U of T, Shopping, Financial District, Downtown and so much more! Open Concept Design, Neutral Decor, 727 Square Feet with spilt bedroom floor plan. 2 bedrooms, 2 bathrooms, Granite Counter Parking, Locker. Building amenities include; Gym, Party Room, Rooftop Patio, Guest Suites. Tenant pays Hydro. Speak to Listing agent about Parking spot ****Lease amount adjusted to $3,050 if tenant does not need/want parking**** (43987998)'
// F · Chinese-only (machine-translated Realtor import, 8 Colvestone Road).
const COLVESTONE = '位于多伦多顶级社区圣安德鲁-温菲尔德的优雅定制豪宅，拥有6000多平方英尺的居住空间和完成地下室。特色包括高耸天花板、大理石装饰、多个壁炉、正式餐厅、木制图书馆、配备高端电器和岛台的美食厨房、拱形天花板家庭室配法式门户通往精心景观设计的后院。奢华主卧套房配spa浴室、4间卧室、4车位串联车库。靠近顶级学校、Granite俱乐部、Rosedale高尔夫俱乐部、公园和美食餐厅。'

describe('splitBilingual — every production description pattern', () => {
  it('A: Chinese paragraph then English paragraph', () => {
    for (const d of [DUNDAS, BAY]) {
      const p = splitBilingual(d)
      expect(p.zh).toBeTruthy()
      expect(p.en).toBeTruthy()
      expect(p.zh).toMatch(/^位于/)
      expect(HAN.test(p.en!)).toBe(false)
      expect(p.zh).not.toContain('Well-located')
      expect(p.zh).not.toContain('Spacious 799')
    }
    // English proper nouns inside the Chinese half stay there.
    expect(splitBilingual(BAY).zh).toContain('Downtown Bay Street')
    expect(splitBilingual(BAY).zh).toContain('（Locker）')
  })

  it('B: 【中文】 / 【English】 markers, both paragraphs of each half kept, markers removed', () => {
    const p = splitBilingual(AVONDALE)
    expect(p.zh).toMatch(/^时尚明亮/)
    expect(p.zh).toContain('坐落于 Yonge & Sheppard')
    expect(p.en).toMatch(/^Stylish corner unit/)
    expect(p.en).toContain('Prime Yonge & Sheppard')
    for (const half of [p.zh!, p.en!]) expect(half).not.toMatch(/【|】/)
    expect(HAN.test(p.en!)).toBe(false)
  })

  it('C: markers with a --- line between them — no separator left in either half', () => {
    for (const d of [MERCHANTS, SIMCOE]) {
      const p = splitBilingual(d)
      expect(p.zh).toBeTruthy()
      expect(p.en).toBeTruthy()
      expect(p.zh).not.toMatch(/---|【/)
      expect(p.en).not.toMatch(/---|【/)
      expect(HAN.test(p.en!)).toBe(false)
    }
    expect(splitBilingual(MERCHANTS).zh).toContain('月租 $6,500，12 个月起')
    expect(splitBilingual(MERCHANTS).en).toMatch(/12-month lease minimum/)
    // The ✦ list of the English half is not mistaken for the Chinese half.
    expect(splitBilingual(MERCHANTS).en).toContain('✦ Floor-to-ceiling windows')
  })

  it('D: Chinese block + --- + English block without markers', () => {
    const p = splitBilingual(HUBERT)
    expect(p.zh).toMatch(/^位于蒙特利尔/)
    expect(p.zh).toContain('✦ 宠物友好 · 无停车位')
    expect(p.en).toMatch(/^Located in the heart of Ville-Marie/)
    expect(p.en).toContain('✦ Pet-friendly · No parking included')
    expect(p.zh).not.toContain('---')
  })

  it('E: English-only Realtor.ca remarks (Realtor id stripped by cleanDescription)', () => {
    expect(splitBilingual(HURON)).toEqual({ zh: null, en: HURON })
    expect(cleanDescription(HURON)).toMatch(/Locker Included\.$/)
    expect(descriptionParts(COLLEGE).en).toMatch(/parking\*\*\*\*$/)
    expect(descriptionParts(COLLEGE).zh).toBeNull()
  })

  it('F: Chinese-only text', () => {
    expect(splitBilingual(COLVESTONE)).toEqual({ zh: COLVESTONE, en: null })
  })

  it('titles: " | " pairs, three segments joined by language, and "中文 / English"', () => {
    expect(splitBilingual('Downtown Dundas & University 精致一居公寓 | Modern 1-Bedroom Condo at 280 Dundas St W')).toEqual({
      zh: 'Downtown Dundas & University 精致一居公寓', en: 'Modern 1-Bedroom Condo at 280 Dundas St W',
    })
    expect(splitBilingual('Downtown Toronto 精装三卧 | 全包服务式公寓 · 地铁步行3分钟 | Modern 3BR All-Inclusive · 3-Min to Subway')).toEqual({
      zh: 'Downtown Toronto 精装三卧 · 全包服务式公寓 · 地铁步行3分钟', en: 'Modern 3BR All-Inclusive · 3-Min to Subway',
    })
    expect(splitBilingual('湖景豪华2卧3卫 | Luxury 2Bed/3Bath Waterfront Condo — Aquabella at Bayside').en).toBe('Luxury 2Bed/3Bath Waterfront Condo — Aquabella at Bayside')
    expect(pickLang('Huron St 2 卧 2 卫公寓，多大校园边', 'en')).toBeNull()
  })

  it('short pairs split only between a Chinese side and an English side', () => {
    expect(splitBilingual('宠物友好 / Pets welcome')).toEqual({ zh: '宠物友好', en: 'Pets welcome' })
    expect(splitBilingual('小型宠物可；狗需 $500 押金 / Small pets welcome; dogs require $500 deposit')).toEqual({
      zh: '小型宠物可；狗需 $500 押金', en: 'Small pets welcome; dogs require $500 deposit',
    })
    // No space before the slash (28 Avondale).
    expect(splitBilingual('免费室内停车位（1个）/ 1 Free Indoor Parking Spot')).toEqual({ zh: '免费室内停车位（1个）', en: '1 Free Indoor Parking Spot' })
    expect(splitBilingual('空调 / A/C')).toEqual({ zh: '空调', en: 'A/C' })
    // Never split inside a word, a price or an all-English pair.
    expect(splitBilingual('Security/Concierge')).toEqual({ zh: null, en: 'Security/Concierge' })
    expect(splitBilingual('A/C')).toEqual({ zh: null, en: 'A/C' })
    expect(splitBilingual('Hydro/Water')).toEqual({ zh: null, en: 'Hydro/Water' })
    expect(splitBilingual('不含车位（可选租 $100/月）')).toEqual({ zh: '不含车位（可选租 $100/月）', en: null })
    expect(splitBilingual('Spadina / College')).toEqual({ zh: null, en: 'Spadina / College' })
    // Numbers only belong to both.
    expect(splitBilingual('$2,500')).toEqual({ zh: '$2,500', en: '$2,500' })
    expect(splitBilingual('')).toEqual({ zh: null, en: null })
    expect(splitBilingual(null)).toEqual({ zh: null, en: null })
  })

  it('a text that alternates languages more than once is not split', () => {
    const t = '第一段中文介绍，房间明亮。\n\nAn English paragraph.\n\n又一段中文。'
    const p = splitBilingual(t)
    expect(p.zh).toBe(t)
    expect(p.en).toBeNull()
  })

  it('textLang: a few Han characters make Chinese; a stray one in English does not', () => {
    expect(textLang('Downtown Toronto 精装三卧')).toBe('zh')
    expect(textLang('空调')).toBe('zh')
    expect(textLang('Café 中 near the station and the park')).toBe('en')
    expect(textLang('$6,500 ✦')).toBeNull()
  })
})

// ── Dictionaries ────────────────────────────────────────────────────────────

const AMENITY_VALUES = [
  '24-hour concierge', '24h Concierge', '24hr Concierge', '4-car garage', 'AC', 'balcony', 'Balcony', 'bicycle parking', 'brick exterior',
  "butler's pantry", 'Carpet Free', 'cathedral ceiling', 'central air conditioning', 'centre island kitchen', 'ceramic flooring', 'concierge',
  'detached home', 'dishwasher', 'elevator', 'Exercise Centre', 'finished basement', 'fireplace', 'Fitness Centre', 'forced air heating',
  'french doors', 'games room', 'gourmet kitchen', 'granite countertops', 'guest suite', 'gym', 'hardwood flooring', 'heat included',
  'hydro included', 'In suite Laundry', 'in-law suite', 'in-unit laundry', 'Indoor Pool', 'kitchen island', 'Locker', 'marble finishes',
  'marble flooring', 'multiple fireplaces', 'Party Room', 'private terrace', 'Recreation Centre', 'sauna', 'security alarm system',
  'Security/Concierge', 'soaring ceilings', 'spa ensuite', 'storage', 'Storage - Locker', 'storage locker', 'underground parking',
  'visitor parking', 'Visitor Parking', 'water included', 'Wi-Fi', 'WiFi', 'wood-paneled library',
  '专用工作空间 / Dedicated Workspace', '停车位 / Parking', '健身房 / Fitness Centre', '健身房 / Gym', '全配家具 / Fully Furnished',
  '厨具餐具 / Kitchenware', '厨房 / Kitchen', '双周保洁 / Bi-weekly Cleaning', '大堂礼宾 / Lobby Concierge', '室内停车 / Indoor Parking',
  '床品毛巾 / Linens & Towels', '智能电视 / Smart TV', '水电气暖全包 / Utilities Included', '洗衣机 / Washer', '游泳池 / Swimming Pool',
  '湖景阳台 / Lake View Balcony', '空调 / A/C', '落地窗 / Floor-to-Ceiling Windows', '访客停车 / Visitor Parking',
  // Wizard ids (lib/listingInsights.ts amenityLabel).
  'central_ac', 'heat_incl', 'water_incl', 'pool', 'in_unit_laundry', 'parking_spot', 'rooftop',
]
const APPLIANCES = ['Cooktop', 'Dishwasher', 'Dryer', 'Furniture', 'Hood Fan', 'Microwave', 'Oven', 'Refrigerator', 'Stove', 'Washer', 'Window Coverings']

function bothLanguages(field: ListingValueField, raw: string) {
  const zh = localizeValue(field, raw, 'zh')
  const en = localizeValue(field, raw, 'en')
  expect(zh, `${field} zh ← ${raw}`).toBeTruthy()
  expect(en, `${field} en ← ${raw}`).toBeTruthy()
  expect(HAN.test(zh!), `${field} zh is Chinese ← ${raw}: ${zh}`).toBe(true)
  expect(HAN.test(en!), `${field} en has no Chinese ← ${raw}: ${en}`).toBe(false)
  return { zh: zh!, en: en! }
}

describe('dictionaries: every production vocabulary value maps in both languages', () => {
  it('no lookup key maps to two different entries', () => {
    for (const [name, d] of Object.entries(LISTING_DICTIONARIES)) expect(d.conflicts, name).toEqual([])
    for (const d of Object.values(LISTING_DICTIONARIES)) for (const e of d.entries) {
      expect(HAN.test(e.en), e.en).toBe(false)
      expect(LATIN.test(e.zh) && !HAN.test(e.zh), e.zh).toBe(false)
    }
  })

  it('amenities (Realtor.ca Title Case, AI-importer phrases, "中文 / English" chips, wizard ids)', () => {
    for (const v of AMENITY_VALUES) bothLanguages('amenities', v)
    expect(localizeValue('amenities', 'Storage - Locker', 'zh')).toBe('储物柜')
    expect(localizeValue('amenities', 'Storage - Locker', 'en')).toBe('Storage locker')
    expect(localizeValue('amenities', 'Security/Concierge', 'zh')).toBe('保安与礼宾')
    expect(localizeValue('amenities', 'Exercise Centre', 'zh')).toBe('健身中心')
    expect(localizeValue('amenities', 'Carpet Free', 'zh')).toBe('无地毯')
    expect(localizeValue('amenities', '4-car garage', 'zh')).toBe('4 车位车库')
    // Wizard ids read exactly as lib/listingInsights.ts amenityLabel.
    expect(localizeValue('amenities', 'concierge', 'zh')).toBe('24 小时前台')
    expect(localizeValue('amenities', 'parking_spot', 'en')).toBe('1 parking spot')
    expect(localizeValue('amenities', '空调 / A/C', 'zh')).toBe('空调')
    expect(localizeValue('amenities', '空调 / A/C', 'en')).toBe('Air conditioning')
  })

  it('appliances and building features share the vocabulary', () => {
    for (const v of APPLIANCES) { bothLanguages('appliances', v); bothLanguages('building_features', v) }
    expect(localizeValue('appliances', 'Hood Fan', 'zh')).toBe('抽油烟机')
    expect(localizeValue('appliances', 'Window Coverings', 'zh')).toBe('窗帘 / 百叶窗')
  })

  it('utilities codes print in both languages (en no longer shows the raw lowercase code)', () => {
    expect(['hydro', 'water', 'heat', 'gas', 'internet', 'cable'].map((u) => localizeValue('utilities_included', u, 'zh'))).toEqual(['电', '水', '暖气', '燃气', '网络', '有线电视'])
    expect(['hydro', 'water', 'heat', 'gas', 'internet', 'cable'].map((u) => localizeValue('utilities_included', u, 'en'))).toEqual(['Hydro', 'Water', 'Heat', 'Gas', 'Internet', 'Cable TV'])
  })

  it('property_type and ownership_title: no English inside the Chinese labels', () => {
    expect(bothLanguages('property_type', 'condo')).toEqual({ zh: '共管公寓', en: 'Condo' })
    expect(bothLanguages('property_type', 'house')).toEqual({ zh: '独立屋', en: 'House' })
    expect(bothLanguages('property_type', 'duplex')).toEqual({ zh: '双拼屋', en: 'Duplex' })
    for (const c of ['apartment', 'townhouse', 'basement']) bothLanguages('property_type', c)
    expect(bothLanguages('ownership_title', 'condominium')).toEqual({ zh: '共管产权', en: 'Condominium' })
    expect(bothLanguages('ownership_title', 'freehold')).toEqual({ zh: '永久产权', en: 'Freehold' })
    // An unknown code: humanised in English, never printed raw in Chinese.
    expect(localizeValue('property_type', 'semi_detached', 'zh')).toBe('半独立屋')
    expect(localizeValue('property_type', 'mobile_home', 'zh')).toBeNull()
    expect(localizeValue('property_type', 'mobile_home', 'en')).toBe('Mobile home')
    expect(translationSource('property_type', 'mobile_home', 'zh')).toBe('Mobile home')
  })

  it('pets_allowed / smoking_policy use the page labels', () => {
    expect(localizeValue('pets_allowed', 'restricted', 'zh')).toBe('有限制')
    expect(localizeValue('pets_allowed', 'restricted', 'en')).toBe('With restrictions')
    expect(localizeValue('smoking_policy', 'outdoor_only', 'zh')).toBe('仅室外')
  })

  it('heating "<type> (<fuel>)", fuel, cooling, basement, exterior comma lists', () => {
    expect(bothLanguages('heating_type', 'Forced air (Natural gas)')).toEqual({ zh: '暖风（天然气）', en: 'Forced air (Natural gas)' })
    expect(bothLanguages('heating_fuel', 'Natural gas').zh).toBe('天然气')
    expect(bothLanguages('heating_fuel', 'Electric').zh).toBe('电')
    expect(bothLanguages('cooling', 'Central air conditioning').zh).toBe('中央空调')
    expect(bothLanguages('exterior_finish', 'Concrete').zh).toBe('混凝土')
    expect(bothLanguages('exterior_finish', 'Aluminum siding, Brick').zh).toBe('铝制外墙板、砖')
    expect(bothLanguages('basement_type', 'Full (Finished)').zh).toBe('全地下室（已装修）')
    // One unknown item in a list → the whole value needs a translation.
    expect(localizeValue('exterior_finish', 'Brick, Unobtainium', 'zh')).toBeNull()
  })

  it('parking: Realtor.ca strings, "中文 / English" pairs, Chinese-only values', () => {
    expect(bothLanguages('parking', 'No Garage').zh).toBe('无车库')
    expect(bothLanguages('parking', 'Underground, Garage').zh).toBe('地下车库')
    expect(bothLanguages('parking', '4-car tandem garage').zh).toBe('4 车位纵列车库')
    expect(bothLanguages('parking', '4 car garage').zh).toBe('4 车位车库')
    expect(bothLanguages('parking', '1 underground').zh).toBe('1 个地下车位')
    expect(bothLanguages('parking', '免费室内停车位（1个）/ 1 Free Indoor Parking Spot')).toEqual({ zh: '免费室内停车位（1个）', en: '1 Free Indoor Parking Spot' })
    expect(bothLanguages('parking', '无停车位 / No parking included').en).toBe('No parking included')
    expect(bothLanguages('parking', '含一个停车位 / 1 parking spot included').zh).toBe('含一个停车位')
    expect(bothLanguages('parking', '不含车位（可选租 $100/月）').en).toBe('Not included (available for $100/month)')
    expect(bothLanguages('parking', '待确认（请告知是否含停车位）')).toEqual({ zh: '待确认（请告知是否含停车位）', en: 'To be confirmed' })
  })

  it('lease_term: months / years, minimum, short-term, month-to-month', () => {
    expect(bothLanguages('lease_term', '12 months')).toEqual({ zh: '12 个月', en: '12 months' })
    expect(localizeValue('lease_term', '12 个月', 'en')).toBe('12 months')
    expect(localizeValue('lease_term', '12 个月起', 'en')).toBe('12 months minimum')
    expect(localizeValue('lease_term', '12-month lease minimum', 'zh')).toBe('12 个月起')
    expect(localizeValue('lease_term', '1 year', 'zh')).toBe('1 年')
    expect(localizeValue('lease_term', 'short-term', 'zh')).toBe('可短租')
    expect(localizeValue('lease_term', '可短租', 'en')).toBe('Short-term OK')
    expect(localizeValue('lease_term', 'month-to-month', 'zh')).toBe('按月')
    expect(localizeValue('lease_term', '12 months / short-term OK', 'zh')).toBe('12 个月 / 可短租')
  })

  it('pet_policy: pairs, 待确认, known phrases; free text otherwise needs translation', () => {
    expect(bothLanguages('pet_policy', '宠物友好 / Pets welcome')).toEqual({ zh: '宠物友好', en: 'Pets welcome' })
    expect(bothLanguages('pet_policy', '待确认')).toEqual({ zh: '待确认', en: 'To be confirmed' })
    expect(bothLanguages('pet_policy', 'pets allowed with restrictions').zh).toBe('允许养宠（有限制）')
    expect(bothLanguages('pet_policy', 'Pets welcome').zh).toBe('宠物友好')
    expect(localizeValue('pet_policy', '依大楼规定允许宠物（需遵守物业限制）', 'zh')).toBe('依大楼规定允许宠物（需遵守物业限制）')
    expect(localizeValue('pet_policy', '依大楼规定允许宠物（需遵守物业限制）', 'en')).toBeNull()
    expect(translationSource('pet_policy', '依大楼规定允许宠物（需遵守物业限制）', 'en')).toBe('依大楼规定允许宠物（需遵守物业限制）')
  })

  it('TRREB area labels and periods', () => {
    expect(localizeValue('trreb_area', 'All TRREB Areas', 'zh')).toBe('TRREB 全区')
    expect(localizeValue('trreb_area', 'All TRREB Areas', 'en')).toBe('All TRREB Areas')
    expect(localizeValue('trreb_area', 'Toronto West', 'zh')).toBe('多伦多西区')
    expect(localizeValue('trreb_area', 'Toronto East', 'zh')).toBe('多伦多东区')
    // District codes and municipality names are proper nouns.
    expect(localizeValue('trreb_area', 'Toronto C01', 'zh')).toBe('Toronto C01')
    expect(localizeValue('trreb_area', 'Mississauga', 'zh')).toBe('Mississauga')
    expect(localizeValue('trreb_period', '2026 Q1', 'zh')).toBe('2026 年第 1 季度')
    expect(localizeValue('trreb_period', '2026 Q2', 'en')).toBe('2026 Q2')
  })
})

describe('no raw other-language leakage', () => {
  const FIELDS: [ListingValueField, string][] = [
    ['amenities', 'Rooftop Patio Lounge With Fire Pits'], ['amenities', '湖景无边泳池'], ['parking', 'Tandem, Surface, Lane access'],
    ['pet_policy', 'Dogs under 20 lbs'], ['lease_term', '学期租'], ['cooling', 'Geo-exchange'], ['heating_type', 'Mystery heat (Plasma)'],
    ['exterior_finish', 'Unobtainium'], ['basement_type', 'Cellar (Wine)'], ['land_size', 'irregular lot'], ['property_type', 'houseboat'],
  ]
  it('a value nothing covers comes back null in the other language, as stored in its own', () => {
    for (const [f, v] of FIELDS) {
      const own: ListingLang = HAN.test(v) ? 'zh' : 'en'
      const other: ListingLang = own === 'zh' ? 'en' : 'zh'
      const got = localizeValue(f, v, other)
      expect(got, `${f}: ${v} → ${other}`).toBeNull()
      expect(translationSource(f, v, other), f).toBeTruthy()
    }
  })

  it('resolveValue / resolveList use a cached translation, and drop what has none', () => {
    const strings = { 'Rooftop Patio Lounge With Fire Pits': '带火炉的屋顶露台休息区' }
    expect(resolveValue('amenities', 'Rooftop Patio Lounge With Fire Pits', 'zh', strings)).toBe('带火炉的屋顶露台休息区')
    expect(resolveList('amenities', ['Locker', 'Storage - Locker', 'Rooftop Patio Lounge With Fire Pits', 'Unknown Thing'], 'zh', strings)).toEqual(['储物柜', '带火炉的屋顶露台休息区'])
    // 155 Merchants' Wharf amenities in the English UI: no Chinese left.
    const merchants = ['健身房 / Fitness Centre', '游泳池 / Swimming Pool', '24h Concierge', '访客停车 / Visitor Parking', '湖景阳台 / Lake View Balcony', '落地窗 / Floor-to-Ceiling Windows']
    const en = resolveList('amenities', merchants, 'en')
    expect(en).toHaveLength(6)
    for (const x of en) expect(HAN.test(x)).toBe(false)
    const zh = resolveList('amenities', merchants, 'zh')
    expect(zh).toHaveLength(6)
    for (const x of zh) expect(LATIN.test(x) && !HAN.test(x), x).toBe(false)
  })

  it('resolveDescription: own half, cached translation, else the original with its language', () => {
    expect(resolveDescription(DUNDAS, 'en')).toMatchObject({ text: expect.stringMatching(/^Well-located/), translated: false })
    expect(resolveDescription(HURON, 'zh')).toEqual({ text: null, translated: false, original: cleanDescription(HURON), originalLang: 'en' })
    expect(resolveDescription(HURON, 'zh', { [cleanDescription(HURON)]: '欢迎来到 Designhaus 601 室……' })).toMatchObject({ text: '欢迎来到 Designhaus 601 室……', translated: true })
    expect(resolveDescription(COLVESTONE, 'zh').text).toBe(COLVESTONE)
    expect(resolveDescription(null, 'zh').text).toBeNull()
  })
})

describe('collectTranslatables', () => {
  const huron = {
    description: HURON, parking: 'No Garage', property_type: 'condo', ownership_title: 'condominium',
    amenities: ['Balcony', 'Carpet Free', 'Storage - Locker'], appliances: ['Dishwasher', 'Dryer', 'Microwave', 'Stove', 'Washer', 'Window Coverings', 'Refrigerator'],
    utilities_included: [], heating_type: 'Forced air (Natural gas)', cooling: 'Central air conditioning', exterior_finish: 'Concrete',
  }
  it('a Realtor.ca listing needs only its remarks translated into Chinese, nothing into English', () => {
    expect(collectTranslatables(huron, 'zh').strings).toEqual([cleanDescription(HURON)])
    expect(collectTranslatables(huron, 'en').strings).toEqual([])
  })

  it('bilingual Stayloop listings need nothing; Chinese-only free text needs English', () => {
    const merchants = { description: MERCHANTS, pet_policy: '待确认', parking: '待确认（请告知是否含停车位）', amenities: ['健身房 / Fitness Centre', '24h Concierge'] }
    expect(collectTranslatables(merchants, 'zh').strings).toEqual([])
    expect(collectTranslatables(merchants, 'en').strings).toEqual([])
    const bay = { description: BAY, pet_policy: '依大楼规定允许宠物（需遵守物业限制）', parking: '不含车位（可选租 $100/月）', amenities: ['Locker', '24hr Concierge', 'Fitness Centre', 'Indoor Pool', 'Party Room'], utilities_included: ['internet', 'cable'] }
    expect(collectTranslatables(bay, 'en').strings).toEqual(['依大楼规定允许宠物（需遵守物业限制）'])
    expect(collectTranslatables(bay, 'zh').strings).toEqual([])
    const colvestone = { description: COLVESTONE, parking: '4-car tandem garage', property_type: 'house', ownership_title: 'freehold' }
    expect(collectTranslatables(colvestone, 'en').strings).toEqual([COLVESTONE])
  })

  it('srcHash = SHA-256 of the canonical JSON; stable across order, changes with the data or the language', () => {
    const a = collectTranslatables({ description: COLLEGE, amenities: ['Rooftop Patio Lounge', 'Zen Garden Deck'] }, 'zh')
    const b = collectTranslatables({ description: COLLEGE, amenities: ['Zen Garden Deck', 'Rooftop Patio Lounge'] }, 'zh')
    expect(a.strings).toEqual([...a.strings].sort())
    expect(a.srcHash).toBe(b.srcHash)
    expect(a.srcHash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.srcHash).toBe(createHash('sha256').update(JSON.stringify({ v: 'stayloop-listing-lang-v1', lang: 'zh', strings: a.strings })).digest('hex'))
    expect(collectTranslatables({ description: COLLEGE + ' More.' }, 'zh').srcHash).not.toBe(a.srcHash)
    expect(collectTranslatables({ description: COLVESTONE }, 'en').srcHash).not.toBe(collectTranslatables({ description: COLVESTONE }, 'zh').srcHash)
  })

  it('sha256Hex matches node:crypto on ASCII, Chinese and block-boundary lengths', () => {
    for (const s of ['', 'abc', COLVESTONE, MERCHANTS, 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), '宠'.repeat(100)]) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'))
    }
  })

  it('budgetSources keeps the shortest strings within the budget', () => {
    expect(budgetSources(['ccc', 'a', 'bb', 'x'.repeat(50)], 6)).toEqual(['a', 'bb', 'ccc'])
    expect(budgetSources(['x'.repeat(7000), 'ok'])).toEqual(['ok'])
  })
})

describe('number backstop for model translations', () => {
  it('thousands separators, Chinese numerals and English number words count as the same number', () => {
    expect(translationKeepsNumbers('月租 $6,500，12 个月起', '$6500/month, 12 months minimum')).toBe(true)
    expect(translationKeepsNumbers('精装三卧两卫', '3-bedroom, 2-bathroom')).toBe(true)
    expect(translationKeepsNumbers('A Two Bedroom Split Design', '两卧分离式户型（2 卧）')).toBe(true)
    expect(translationKeepsNumbers('拥有6000多平方英尺的居住空间', 'over 6,000 sq ft of living space')).toBe(true)
  })
  it('a number the source does not state rejects the translation', () => {
    expect(translationKeepsNumbers('Spacious 799 sqft unit', '宽敞的 74 平方米单位')).toBe(false)
    expect(translationKeepsNumbers('一应俱全', 'Fully equipped, 1 unit')).toBe(false)
    expect(translationKeepsNumbers('Lease amount adjusted to $3,050', '租金调整为 $3,500')).toBe(false)
  })
  it('acceptTranslation: right language, no Chinese in English output, no echo, no new numbers', () => {
    expect(acceptTranslation('Locker Included.', '含储物柜。', 'zh')).toBe(true)
    expect(acceptTranslation('Locker Included.', 'Locker Included.', 'zh')).toBe(false)
    expect(acceptTranslation('位于圣安德鲁-温菲尔德', 'Located in 圣安德鲁 St. Andrew-Windfields', 'en')).toBe(false)
    expect(acceptTranslation('位于圣安德鲁-温菲尔德', 'Located in St. Andrew-Windfields', 'en')).toBe(true)
    expect(acceptTranslation('含储物柜', '', 'en')).toBe(false)
    expect(acceptTranslation('含储物柜', 42, 'en')).toBe(false)
  })
})

describe('parkingStat (2026-10-02 · 155 Merchants\' Wharf showed Parking: Yes)', () => {
  it('unconfirmed parking is 未说明 / Not stated', () => {
    expect(parkingStat('待确认（请告知是否含停车位）', true)).toBe('未说明')
    expect(parkingStat('待确认（请告知是否含停车位）', false)).toBe('Not stated')
    expect(parkingStat('To be confirmed', false)).toBe('Not stated')
    expect(parkingStat('TBD', true)).toBe('未说明')
  })
  it('a "中文 / English" pair is read on its Chinese half', () => {
    expect(parkingStat('无停车位 / No parking included', true)).toBe('不含')
    expect(parkingStat('含一个停车位 / 1 parking spot included', false)).toBe('Yes')
    expect(parkingStat('免费室内停车位（1个）/ 1 Free Indoor Parking Spot', true)).toBe('有')
    expect(parkingStat('No Garage', true)).toBe('不含')
    // Earlier behaviour unchanged (tests/walkthrough20260925.spec.ts).
    expect(parkingStat('不含车位（可选租 $100/月）', true)).toBe('可另租')
    expect(parkingStat('', true)).toBe('未提供')
  })
})
