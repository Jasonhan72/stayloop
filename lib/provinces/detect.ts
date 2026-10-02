// Which province a listing is in (2026-10-02 · user: a Montréal listing was
// showing Ontario rules — 「外省的要查外省的法规，不要用安省的法规和说法」).
//
// The stored `province` column is not trustworthy on its own: the Montréal row
// was saved as 'ON' with "1569 rue St-Hubert, Montréal, QC, H2L 3Z1" in the
// address. So the answer is read from the strongest evidence first:
//   1. a Canadian postal code (the column, else one found in the address) —
//      its first letter is the province (Canada Post forward sortation areas);
//   2. an explicit province token in the address ("…, QC", "Québec", "Ontario");
//   3. a valid stored province;
//   4. a city dictionary ("Montréal", "Calgary", "Toronto"…);
//   5. 'ON' — the product is Ontario-first and older rows have no province.
// Pure, no 'use client': the listing page, the enrich route and the agent share
// it. Tests: tests/provinces20261002.spec.ts.

export type ProvinceCode = 'ON' | 'QC' | 'BC' | 'AB' | 'MB' | 'SK' | 'NS' | 'NB' | 'PE' | 'NL' | 'YT' | 'NT' | 'NU'
export type NonOntarioCode = Exclude<ProvinceCode, 'ON'>

export const PROVINCE_CODES: readonly ProvinceCode[] = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'PE', 'NL', 'YT', 'NT', 'NU']

/** Lowercase, accents stripped, punctuation folded to single spaces — "Québec" → "quebec",
 *  "St. John's" → "st johns", "Trois-Rivières" → "trois rivieres". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[.\-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Names → code ────────────────────────────────────────────────────────────

// Keys are fold()ed with spaces removed. A whole-field value only (normalizeProvince);
// free text goes through provinceTokenIn, which is stricter.
const NAME_TO_CODE: Record<string, ProvinceCode> = {
  on: 'ON', ont: 'ON', ontario: 'ON', 安省: 'ON', 安大略: 'ON', 安大略省: 'ON',
  qc: 'QC', pq: 'QC', que: 'QC', quebec: 'QC', provinceofquebec: 'QC', provincedequebec: 'QC', 魁省: 'QC', 魁北克: 'QC', 魁北克省: 'QC',
  bc: 'BC', britishcolumbia: 'BC', colombiebritannique: 'BC', 卑诗: 'BC', 卑诗省: 'BC', bc省: 'BC', 不列颠哥伦比亚: 'BC', 不列颠哥伦比亚省: 'BC',
  ab: 'AB', alta: 'AB', alberta: 'AB', 阿省: 'AB', 阿尔伯塔: 'AB', 阿尔伯塔省: 'AB', 亚伯达: 'AB', 亚伯达省: 'AB',
  mb: 'MB', man: 'MB', manitoba: 'MB', 曼省: 'MB', 曼尼托巴: 'MB', 曼尼托巴省: 'MB', 满地宝: 'MB', 满地宝省: 'MB',
  sk: 'SK', sask: 'SK', saskatchewan: 'SK', 萨省: 'SK', 萨斯喀彻温: 'SK', 萨斯喀彻温省: 'SK', 沙省: 'SK', 沙斯卡彻温省: 'SK',
  ns: 'NS', novascotia: 'NS', nouvelleecosse: 'NS', 新斯科舍: 'NS', 新斯科舍省: 'NS', 诺华斯高沙省: 'NS',
  nb: 'NB', newbrunswick: 'NB', nouveaubrunswick: 'NB', 新不伦瑞克: 'NB', 新不伦瑞克省: 'NB', 纽宾士域省: 'NB',
  pe: 'PE', pei: 'PE', princeedwardisland: 'PE', ileduprinceedouard: 'PE', 爱德华王子岛: 'PE', 爱德华王子岛省: 'PE', 爱省: 'PE',
  nl: 'NL', nfld: 'NL', newfoundland: 'NL', newfoundlandandlabrador: 'NL', newfoundlandlabrador: 'NL', terreneuve: 'NL', terreneuveetlabrador: 'NL', labrador: 'NL',
  纽芬兰: 'NL', 纽芬兰省: 'NL', 纽芬兰与拉布拉多: 'NL', 纽芬兰与拉布拉多省: 'NL', 纽芬兰和拉布拉多省: 'NL', 纽省: 'NL',
  yt: 'YT', yk: 'YT', yukon: 'YT', yukonterritory: 'YT', 育空: 'YT', 育空地区: 'YT',
  nt: 'NT', nwt: 'NT', northwestterritories: 'NT', territoiresdunordouest: 'NT', 西北地区: 'NT',
  nu: 'NU', nvt: 'NU', nunavut: 'NU', 努纳武特: 'NU', 努纳武特地区: 'NU',
}

/** A stored / typed province value → its code, or null when it is not one ("", "Foo"). */
export function normalizeProvince(raw: string | null | undefined): ProvinceCode | null {
  const k = fold(String(raw ?? '')).replace(/ /g, '')
  if (!k) return null
  return NAME_TO_CODE[k] ?? null
}

// ── Postal code ─────────────────────────────────────────────────────────────

const FSA_FIRST: Record<string, ProvinceCode> = {
  A: 'NL', B: 'NS', C: 'PE', E: 'NB', G: 'QC', H: 'QC', J: 'QC',
  K: 'ON', L: 'ON', M: 'ON', N: 'ON', P: 'ON', R: 'MB', S: 'SK', T: 'AB', V: 'BC', Y: 'YT',
}
// X is shared by the two eastern territories: X0A/X0B/X0C Nunavut, X0E/X0G/X1A Northwest Territories.
const FSA_X: Record<string, ProvinceCode> = { X0A: 'NU', X0B: 'NU', X0C: 'NU', X0E: 'NT', X0G: 'NT', X1A: 'NT' }

function fsaProvince(fsa: string): ProvinceCode | null {
  const f = fsa.toUpperCase()
  if (f[0] === 'X') return FSA_X[f] ?? null
  return FSA_FIRST[f[0]] ?? null
}

// First letter: the 18 letters Canada Post uses; 3rd / 5th letters never D F I O Q U.
const POSTAL_RE = /(^|[^A-Za-z0-9])([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])[ -]?(\d[ABCEGHJ-NPRSTV-Z]\d)(?![A-Za-z0-9])/gi
const FSA_ONLY_RE = /^\s*([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s*$/i

/** The province of a Canadian postal code found anywhere in the text (the last one wins —
 *  it sits at the end of an address). A bare FSA ("H2L") counts only when it is the whole value. */
export function provinceFromPostal(text: string | null | undefined): ProvinceCode | null {
  const s = String(text ?? '')
  if (!s.trim()) return null
  const only = s.match(FSA_ONLY_RE)
  if (only) return fsaProvince(only[1])
  let last: string | null = null
  for (const m of Array.from(s.matchAll(POSTAL_RE))) last = m[2]
  return last ? fsaProvince(last) : null
}

/** The last full Canadian postal code written in the text, formatted "H2L 3Z1"; null when none.
 *  (The listing page shows it when the postal_code column is empty but the address carries one.) */
export function postalCodeIn(text: string | null | undefined): string | null {
  let last: RegExpMatchArray | null = null
  for (const m of Array.from(String(text ?? '').matchAll(POSTAL_RE))) last = m
  return last ? `${last[2]} ${last[3]}`.toUpperCase() : null
}

// ── Explicit province token in free text ────────────────────────────────────

// Upper-case abbreviations only, after a comma / space / bracket and before the end, a comma,
// a bracket or a postal code ("Montréal, QC, H2L 3Z1", "Toronto ON M5V 2T6") — so "on" in prose,
// "AB" inside a unit label or "Alta Vista Dr" never count.
const CODE_TOKEN_RE = /(?:^|[\s,(/])(ON|QC|PQ|BC|B\.C\.|AB|MB|SK|NS|N\.S\.|NB|N\.B\.|PE|PEI|P\.E\.I\.|NL|YT|Y\.T\.|NT|NWT|N\.W\.T\.|NU|Ont\.?|Que\.?|Qué\.?|Alta\.?|Sask\.?)(?=\s*(?:$|[,)/;]|[A-Z]\d[A-Z]))/g

// Spelled-out names, matched on fold()ed text. A name that is part of a street ("rue Ontario Est",
// "123 Quebec Ave", "Ontario Place") is not a province.
const NAME_TOKENS: Array<[string, ProvinceCode]> = [
  ['ontario', 'ON'], ['quebec', 'QC'], ['british columbia', 'BC'], ['colombie britannique', 'BC'],
  ['alberta', 'AB'], ['manitoba', 'MB'], ['saskatchewan', 'SK'], ['nova scotia', 'NS'], ['nouvelle ecosse', 'NS'],
  ['new brunswick', 'NB'], ['nouveau brunswick', 'NB'], ['prince edward island', 'PE'], ['ile du prince edouard', 'PE'],
  ['newfoundland', 'NL'], ['terre neuve', 'NL'], ['yukon', 'YT'], ['northwest territories', 'NT'],
  ['territoires du nord ouest', 'NT'], ['nunavut', 'NU'],
]
const ZH_TOKENS: Array<[string, ProvinceCode]> = [
  ['安大略', 'ON'], ['安省', 'ON'], ['魁北克', 'QC'], ['不列颠哥伦比亚', 'BC'], ['卑诗', 'BC'], ['阿尔伯塔', 'AB'], ['亚伯达', 'AB'],
  ['曼尼托巴', 'MB'], ['萨斯喀彻温', 'SK'], ['新斯科舍', 'NS'], ['新不伦瑞克', 'NB'], ['爱德华王子岛', 'PE'], ['纽芬兰', 'NL'],
  ['育空', 'YT'], ['西北地区', 'NT'], ['努纳武特', 'NU'],
]
const STREET_BEFORE_RE = /\b(rue|avenue|av|boulevard|boul|blvd|chemin|ch|place|pl|lake|lac|street|route|promenade|croissant|cote)\s+(de\s+|du\s+|des\s+|la\s+|l\s+)?$/
const STREET_AFTER_RE = /^\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|cres|crescent|pl|place|ln|lane|way|ct|court|terr|terrace|sq|square|pkwy|parkway|hwy|highway|line|est|ouest|east|west|trail|gate|row|circle|cir|park|ridge|mews|walk|heights|hts|gardens|gdns|grove|close)\b/

function isStreetName(folded: string, start: number, end: number): boolean {
  return STREET_BEFORE_RE.test(folded.slice(Math.max(0, start - 24), start)) || STREET_AFTER_RE.test(folded.slice(end, end + 14))
}

/** The last explicit province token in a piece of text (abbreviation, English / French or
 *  Chinese name), or null. Street names that happen to be province names are skipped. */
export function provinceTokenIn(text: string | null | undefined): ProvinceCode | null {
  const raw = String(text ?? '')
  if (!raw.trim()) return null
  let best: { at: number; code: ProvinceCode } | null = null
  const take = (at: number, code: ProvinceCode | null) => {
    if (code && (!best || at >= best.at)) best = { at, code }
  }
  for (const m of Array.from(raw.matchAll(CODE_TOKEN_RE))) take(m.index ?? 0, normalizeProvince(m[1]))
  // fold() keeps positions only roughly; the comparison below is between names in the same
  // folded string, and an abbreviation and a name in one address almost never disagree.
  const folded = fold(raw)
  const scale = raw.length / Math.max(1, folded.length)
  for (const [name, code] of NAME_TOKENS) {
    const re = new RegExp(`\\b${name}\\b`, 'g')
    for (const m of Array.from(folded.matchAll(re))) {
      const at = m.index ?? 0
      if (isStreetName(folded, at, at + name.length)) continue
      take(Math.round(at * scale), code)
    }
  }
  for (const [name, code] of ZH_TOKENS) {
    const at = raw.lastIndexOf(name)
    if (at >= 0) take(at, code)
  }
  return (best as { at: number; code: ProvinceCode } | null)?.code ?? null
}

// ── City dictionary ─────────────────────────────────────────────────────────

// fold()ed city names. `scan` = distinctive enough to look for inside a whole address;
// the rest count only as the entire city field ("Victoria", "Richmond", "Sydney" are also
// street or neighbourhood names elsewhere).
const CITIES: Array<{ name: string; code: ProvinceCode; scan?: boolean }> = [
  // Quebec
  ...['montreal', 'gatineau', 'longueuil', 'sherbrooke', 'trois rivieres', 'saguenay', 'terrebonne', 'drummondville', 'quebec city', 'ville de quebec', 'pointe claire', 'cote saint luc', 'rouyn noranda']
    .map((name) => ({ name, code: 'QC' as const, scan: true })),
  ...['laval', 'quebec', 'levis', 'brossard', 'saint jerome', 'granby', 'repentigny', 'boucherville', 'dorval', 'westmount', 'mont royal', 'verdun', 'lachine', 'lasalle', 'saint laurent', 'outremont', 'blainville', 'mirabel', 'chateauguay', 'saint hyacinthe', 'rimouski', 'victoriaville', 'val d or', 'shawinigan']
    .map((name) => ({ name, code: 'QC' as const })),
  // British Columbia
  ...['vancouver', 'burnaby', 'coquitlam', 'port coquitlam', 'port moody', 'new westminster', 'north vancouver', 'west vancouver', 'abbotsford', 'chilliwack', 'kelowna', 'kamloops', 'nanaimo', 'prince george', 'maple ridge', 'saanich', 'squamish', 'whistler', 'penticton']
    .map((name) => ({ name, code: 'BC' as const, scan: true })),
  ...['surrey', 'victoria', 'richmond', 'delta', 'langley', 'white rock', 'vernon']
    .map((name) => ({ name, code: 'BC' as const })),
  // Alberta
  ...['calgary', 'edmonton', 'lethbridge', 'medicine hat', 'grande prairie', 'airdrie', 'spruce grove', 'okotoks', 'fort mcmurray', 'sherwood park', 'canmore']
    .map((name) => ({ name, code: 'AB' as const, scan: true })),
  ...['red deer', 'st albert', 'saint albert', 'cochrane', 'banff', 'leduc']
    .map((name) => ({ name, code: 'AB' as const })),
  // Manitoba
  ...['winnipeg', 'portage la prairie', 'steinbach'].map((name) => ({ name, code: 'MB' as const, scan: true })),
  ...['brandon', 'thompson', 'selkirk', 'winkler'].map((name) => ({ name, code: 'MB' as const })),
  // Saskatchewan
  ...['saskatoon', 'moose jaw', 'swift current', 'north battleford', 'yorkton', 'estevan'].map((name) => ({ name, code: 'SK' as const, scan: true })),
  ...['regina', 'prince albert'].map((name) => ({ name, code: 'SK' as const })),
  // Nova Scotia
  ...['halifax', 'dartmouth', 'antigonish', 'new glasgow'].map((name) => ({ name, code: 'NS' as const, scan: true })),
  ...['sydney', 'truro', 'bedford', 'kentville', 'wolfville', 'yarmouth', 'bridgewater'].map((name) => ({ name, code: 'NS' as const })),
  // New Brunswick
  ...['moncton', 'fredericton', 'miramichi', 'quispamsis', 'edmundston'].map((name) => ({ name, code: 'NB' as const, scan: true })),
  ...['saint john', 'st john', 'dieppe', 'riverview', 'bathurst', 'rothesay'].map((name) => ({ name, code: 'NB' as const })),
  // Prince Edward Island
  ...['charlottetown', 'summerside'].map((name) => ({ name, code: 'PE' as const, scan: true })),
  // Newfoundland and Labrador
  ...['mount pearl', 'corner brook', 'conception bay south', 'grand falls windsor', 'happy valley goose bay', 'labrador city'].map((name) => ({ name, code: 'NL' as const, scan: true })),
  ...['st johns', 'saint johns', 'gander'].map((name) => ({ name, code: 'NL' as const })),
  // Territories
  ...['whitehorse'].map((name) => ({ name, code: 'YT' as const, scan: true })),
  ...['dawson city'].map((name) => ({ name, code: 'YT' as const })),
  ...['yellowknife', 'inuvik'].map((name) => ({ name, code: 'NT' as const, scan: true })),
  ...['hay river', 'fort smith'].map((name) => ({ name, code: 'NT' as const })),
  ...['iqaluit', 'rankin inlet', 'arviat'].map((name) => ({ name, code: 'NU' as const, scan: true })),
  ...['cambridge bay'].map((name) => ({ name, code: 'NU' as const })),
  // Ontario — so these resolve to ON rather than "unknown"
  ...['toronto', 'ottawa', 'mississauga', 'brampton', 'markham', 'vaughan', 'richmond hill', 'oakville', 'scarborough', 'north york', 'etobicoke', 'kitchener', 'thunder bay', 'st catharines', 'niagara falls', 'sault ste marie', 'whitchurch stouffville', 'peterborough', 'oshawa']
    .map((name) => ({ name, code: 'ON' as const, scan: true })),
  ...['hamilton', 'burlington', 'waterloo', 'london', 'windsor', 'kingston', 'barrie', 'york', 'east york', 'pickering', 'ajax', 'whitby', 'guelph', 'sudbury', 'greater sudbury', 'cambridge', 'milton', 'newmarket', 'aurora', 'belleville', 'sarnia', 'brantford', 'cornwall', 'stratford', 'orillia', 'welland', 'timmins', 'north bay', 'woodstock', 'thornhill', 'king city', 'stouffville', 'caledon', 'halton hills', 'georgetown', 'bolton', 'innisfil', 'collingwood', 'owen sound']
    .map((name) => ({ name, code: 'ON' as const })),
]
const CITY_EXACT = new Map(CITIES.map((c) => [c.name, c.code]))
const CHINESE_CITIES: Array<[string, ProvinceCode]> = [
  ['蒙特利尔', 'QC'], ['满地可', 'QC'], ['魁北克城', 'QC'], ['温哥华', 'BC'], ['本拿比', 'BC'], ['卡尔加里', 'AB'], ['埃德蒙顿', 'AB'],
  ['温尼伯', 'MB'], ['里贾纳', 'SK'], ['萨斯卡通', 'SK'], ['哈利法克斯', 'NS'], ['蒙克顿', 'NB'], ['弗雷德里克顿', 'NB'], ['夏洛特敦', 'PE'],
  ['圣约翰斯', 'NL'], ['白马市', 'YT'], ['耶洛奈夫', 'NT'], ['伊魁特', 'NU'], ['多伦多', 'ON'], ['渥太华', 'ON'], ['密西沙加', 'ON'], ['万锦', 'ON'], ['列治文山', 'ON'],
]

/** A city name → its province: the whole value first ("Victoria"), then distinctive names
 *  anywhere in the text ("…, Montréal (Ville-Marie)"); the last match wins. */
export function provinceFromCity(text: string | null | undefined): ProvinceCode | null {
  const raw = String(text ?? '')
  if (!raw.trim()) return null
  const folded = fold(raw)
  const exact = CITY_EXACT.get(folded) ?? CITY_EXACT.get(fold(raw.split(',')[0] ?? ''))
  if (exact) return exact
  let best: { at: number; code: ProvinceCode } | null = null
  for (const c of CITIES) {
    if (!c.scan) continue
    const re = new RegExp(`\\b${c.name}\\b`, 'g')
    for (const m of Array.from(folded.matchAll(re))) {
      const at = m.index ?? 0
      if (isStreetName(folded, at, at + c.name.length)) continue
      if (!best || at >= best.at) best = { at, code: c.code }
    }
  }
  if (best) return (best as { at: number; code: ProvinceCode }).code
  for (const [name, code] of CHINESE_CITIES) if (raw.includes(name)) return code
  return null
}

/** Province from the text fields alone: explicit tokens (address, then city), then the
 *  city dictionary (city, then address). Null when nothing says. */
export function provinceFromText(address: string | null | undefined, city?: string | null): ProvinceCode | null {
  return provinceTokenIn(address) ?? provinceTokenIn(city) ?? provinceFromCity(city) ?? provinceFromCity(address)
}

export type ProvinceRow = { province?: string | null; address?: string | null; city?: string | null; postal_code?: string | null }

/** The province whose rules apply to a listing. Postal code > explicit token > stored value >
 *  city dictionary > 'ON'. */
export function effectiveProvince(row: ProvinceRow | null | undefined): ProvinceCode {
  if (!row) return 'ON'
  return (
    provinceFromPostal(row.postal_code) ??
    provinceFromPostal(row.address) ??
    provinceFromPostal(row.city) ??
    provinceTokenIn(row.address) ??
    provinceTokenIn(row.city) ??
    normalizeProvince(row.province) ??
    provinceFromCity(row.city) ??
    provinceFromCity(row.address) ??
    'ON'
  )
}

// ── Names for display ───────────────────────────────────────────────────────

const PROVINCE_NAMES: Record<ProvinceCode, { zh: string; en: string }> = {
  ON: { zh: '安大略省', en: 'Ontario' },
  QC: { zh: '魁北克省', en: 'Quebec' }, BC: { zh: '不列颠哥伦比亚省', en: 'British Columbia' }, AB: { zh: '阿尔伯塔省', en: 'Alberta' },
  MB: { zh: '曼尼托巴省', en: 'Manitoba' }, SK: { zh: '萨斯喀彻温省', en: 'Saskatchewan' }, NS: { zh: '新斯科舍省', en: 'Nova Scotia' },
  NB: { zh: '新不伦瑞克省', en: 'New Brunswick' }, NL: { zh: '纽芬兰与拉布拉多省', en: 'Newfoundland and Labrador' },
  PE: { zh: '爱德华王子岛省', en: 'Prince Edward Island' }, YT: { zh: '育空地区', en: 'Yukon' }, NT: { zh: '西北地区', en: 'Northwest Territories' }, NU: { zh: '努纳武特地区', en: 'Nunavut' },
}

/** "魁北克省" / "Quebec". Accepts a code or any spelling normalizeProvince knows; an unknown
 *  value comes back as typed. `lang` may be the older boolean `zh`. */
export function provinceName(province: string | null | undefined, lang: 'zh' | 'en' | boolean): string {
  const zh = lang === true || lang === 'zh'
  const code = normalizeProvince(province)
  if (!code) return String(province ?? '').trim()
  return zh ? PROVINCE_NAMES[code].zh : PROVINCE_NAMES[code].en
}
