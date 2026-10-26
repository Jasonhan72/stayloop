// Knowledge base · when a turn looks things up, and what it asks (pure, no I/O).
// Retrieval runs only for law / procedure / form / rights-and-duties questions — never for home
// search, drafting, chit-chat or "how many leases do I have" data questions (design §8 ②).

const ZH_LEGAL = /涨租|涨房租|加租|租金(上涨|上调|指导|增长|涨幅)|指导比例|指导涨幅|押金|保证金|钥匙押|最后一个月|驱逐|赶走|赶出去|撵走|收回(房子|房屋|单元)|自住|退租|解约|终止租约|终止租赁|搬离|搬走|通知期|提前.{0,3}(天|日)通知|\bN\d{1,2}\b|\bL\d\b|\bT\d\b|LTB|租房法|租赁法|RTA|法规|法律|合法|违法|不合法|权利|义务|责任|维修|修理|修缮|取暖|暖气|供暖|热水|漏水|发霉|霉菌|虫|害虫|蟑螂|老鼠|臭虫|转租|分租|合租|标准租约|租约(条款|到期|续签|续约|续租)|续约|续租|入住检查|退租检查|宠物|吸烟|停车|水电|能不能问|可以问|不能问|歧视|人权|房东(进入|入户|进来|进门)|进(入|)(我|房|单元|屋)|扣押金|不退押金|赔偿|损坏|保险|违约|逾期|迟交|晚交|催租|欠租|拖欠|听证|裁决|裁定|申诉|复审|上诉|投诉|翻新|装修|改建|拆除|租控|租金管制|免租控|首次入住|新建|涨价|降租|减租|租金减免|维修标准|住宅标准|空置|锁换|换锁|断水|断电|骚扰|隐私|噪音|邻居|保证人|担保人|信用|收入证明|申请被拒|拒租|能不能拒|收据|现金|访客|客人|朋友.{0,4}住|进去看|看房子|通知租客|交房|新楼|滞纳金|逾期费/
const EN_LEGAL = /rent (increase|hike|raise|control|deposit|guideline|abatement|reduction|arrears)|rais(e|ing) (the |my |their )?rent|rent (goes|going|went) up|receipt|cash|abandon|belongings|left without|move (back )?in|compensat|income|increase (the|my) rent|above.?guideline|\bAGI\b|guideline|deposit|evict|eviction|move.?out|terminat|notice (period|of)|\bN\d{1,2}\b|\bL\d\b|\bT\d\b|\bLTB\b|\bRTA\b|legal|illegal|lawful|unlawful|rights?\b|obligation|responsib|repair|maintenance|heat(ing)?\b|hot water|leak|mou?ld|pest|bed ?bug|cockroach|mice|rodent|sublet|assign(ment)?\b|standard lease|renew|inspection|\bpets?\b|smok|parking|utilit|human rights|discriminat|landlord (enter|entry|access)|enter (the|my) (unit|apartment|home)|withhold|damage|insurance|late (rent|payment)|hearing|order\b|appeal|review|complain|renovat|own use|personal use|demoli|first occupied|lock(s|ed)? ?(out|change)|harass|privacy|noise|guarantor|co-?signer|credit check|refuse|reject|decline|can (i|you|we) ask/i
const SEARCH_ONLY = /^(帮我)?(找|搜|查找|推荐|看看有没有)(房|房源|公寓|一室|两室|两居|三室|地下室)|^(find|search|show|recommend) (me )?(a |an |some )?(home|condo|apartment|unit|listing|place)/i

// A party word + a question word is a rights / procedure question too ("房东说我不能让朋友来住几天，合理吗",
// "My tenant seems to have left…what can I do?"). Eval 2026-10-27: six golden questions had no topic word.
const PARTY = /房东|租客|房客|landlord|tenant|applicant|申请人/i
const ASKING = /吗|可以|能不能|能否|怎么办|合理|合法|该不该|应该|有权|要求|可不可以|行不行|\?|？|\bcan\b|\bmay\b|\bshould\b|\bmust\b|allowed|have to|\bwhat\b|\bhow\b|\bdo i\b|\bdoes\b/i

/** Does this message call for the law text? */
export function shouldRetrieve(message: string): boolean {
  const m = (message || '').trim()
  if (m.length < 2) return false
  if (SEARCH_ONLY.test(m) && !/合法|法律|法规|legal|lawful/i.test(m)) return false
  if (ZH_LEGAL.test(m) || EN_LEGAL.test(m)) return true
  return PARTY.test(m) && ASKING.test(m)
}

/** Chinese topic words → English search terms for the full-text half of the hybrid search.
 *  The embedding handles meaning across languages; this gives the tsvector side something to match. */
const ZH_TO_EN: [RegExp, string][] = [
  [/涨租|涨房租|加租|租金(上涨|上调|增长|涨幅)|涨价/, 'rent increase notice guideline'],
  [/指导比例|指导涨幅/, 'rent increase guideline'],
  [/超过指导|高于指导|AGI/, 'above guideline increase application'],
  [/押金|保证金|最后一个月/, 'rent deposit last month interest'],
  [/钥匙押/, 'key deposit refundable'],
  [/驱逐|赶走|赶出去|撵走/, 'eviction notice termination order'],
  [/自住|收回(房子|房屋|单元)/, 'landlord own use personal use notice compensation'],
  [/退租|解约|终止租约|终止租赁|搬离|搬走/, 'tenant notice termination tenancy'],
  [/通知期|提前.{0,3}(天|日)/, 'notice days termination'],
  [/维修|修理|修缮|维修标准|住宅标准/, 'landlord responsibility repair maintenance standards'],
  [/取暖|暖气|供暖|热水/, 'vital services heat hot water'],
  [/漏水|发霉|霉菌|虫|害虫|蟑螂|老鼠|臭虫/, 'maintenance repair pests mould'],
  [/转租|分租/, 'sublet assignment consent'],
  [/合租|室友|访客|客人|朋友.{0,4}住/, 'tenant occupant guest reasonable enjoyment'],
  [/标准租约/, 'standard form of lease'],
  [/续约|续租|续签|到期/, 'renewal end of term month to month'],
  [/宠物/, 'no pets provision void'],
  [/吸烟/, 'smoking tenancy agreement'],
  [/停车/, 'parking services facilities'],
  [/水电|能源/, 'utilities charges services'],
  [/能不能问|可以问|不能问|歧视|人权/, 'human rights discrimination rental housing'],
  [/房东(进入|入户|进来|进门)|进(入|)(我|房|单元|屋)|进去看|看房子|隐私/, 'landlord entry rental unit written notice 24 hours'],
  [/扣押金|不退押金|赔偿|损坏/, 'damage deposit compensation application'],
  [/保险/, 'tenant insurance'],
  [/逾期|迟交|晚交|催租|欠租|拖欠/, 'rent arrears non-payment notice N4 termination'],
  [/\bN4\b/, 'N4 notice non-payment of rent termination 14 days void'],
  [/\bN12\b/, 'N12 notice own use purchaser compensation'],
  [/\bN13\b/, 'N13 notice demolition renovation conversion compensation'],
  [/\bN1\b/, 'N1 notice of rent increase 90 days guideline'],
  [/\bN5\b/, 'N5 notice interference damage overcrowding'],
  [/\bN9\b/, 'N9 tenant notice to end tenancy 60 days'],
  [/听证|裁决|裁定|申诉|复审|上诉/, 'hearing order review appeal Board'],
  [/投诉/, 'complaint application Board'],
  [/翻新|装修|改建|拆除/, 'renovation repair demolition notice N13 compensation'],
  [/租控|租金管制|免租控|首次入住|新建|交房|新楼|新公寓/, 'exempt rent increase guideline first occupied residential purposes after November 15 2018'],
  [/降租|减租|租金减免/, 'rent reduction abatement'],
  [/空置/, 'vacancy'],
  [/换锁|锁换|断水|断电|骚扰/, 'locks changed vital services harassment interference'],
  [/噪音|邻居/, 'reasonable enjoyment substantial interference'],
  [/保证人|担保人|信用|收入证明|申请被拒|拒租/, 'application income credit guarantor human rights'],
  [/逾期费|滞纳金|罚款|手续费|NSF/, 'additional charges prohibited late payment charge penalty fee'],
  [/租金记录|租金收据|收据|现金/, 'rent receipts free of charge payment'],
]

/** The full-text query: English terms for the Chinese topics + any ASCII words / form numbers the user typed. */
export function kbQueryText(message: string): string {
  const parts = new Set<string>()
  // a late-fee / penalty question is about charges (s.134), not arrears — the arrears terms would drown it (eval 2026-10-27)
  const feeQuestion = /滞纳金|逾期费|罚款|手续费|late (fee|charge|payment (fee|charge))|penalt/i.test(message)
  for (const [re, en] of ZH_TO_EN) if (re.test(message) && !(feeQuestion && /arrears non-payment/.test(en))) parts.add(en)
  const ascii = message.match(/[A-Za-z][A-Za-z0-9.-]{1,}/g) || []
  for (const w of ascii) if (w.length >= 2 && !/^(the|and|for|with|that|this|from|have|has|are|was|were|you|your|can|could|should|would|will|what|when|where|how|why|does|did|about|into|not|but|any|all|out|our|its|it's|i'm|im)$/i.test(w)) parts.add(w)
  return Array.from(parts).join(' ').slice(0, 400)
}

/** The text that is embedded for the query: the message itself plus the English topic words (helps cross-lingual recall). */
export function kbEmbedText(message: string): string {
  const en = kbQueryText(message)
  return en ? `${message.trim()}\n${en}` : message.trim()
}
