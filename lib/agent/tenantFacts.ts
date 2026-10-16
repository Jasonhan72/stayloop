// 租客事实包（V1.0 阶段 2 · 乙 #8，2026-10-16）。
//
// 租客问的 20 个常见安省问题里，有 6 道此前完全靠模型凭训练知识回答（预开支票 /
// 室温 / 转租转让 / 合租与同住 / 骚扰 / 提前解约），通用 AI 在这些题上会编条号。
// 这里把 design/research/v1/tenant/top20-tenant-questions.md 与 legal-boundaries-a4.md
// 里【已逐条核过原文】的事实写成口语中文，每段带法条号，按关键词命中注入租客的
// system prompt（任何租客问题，不只是续约意图）。
//
// 纪律：
// - 只写研究稿里有来源的事实；数字（指导比例、N1 / N4 天数、持续迟付规则）一律从
//   lib/ontario/rules.ts 读，不在这里写死。
// - 续约 / 涨租的完整事实在 prompts.ts 的 RTA_RENEWAL_FACTS（续约专线注入）；这里的
//   「涨租」段只是一行指针，专线激活时由调用方跳过，不重复写。
// - 多伦多 Chapter 629 空调 26°C 的说法研究稿标「未核原页」，不写。
// - 全部命中时总长 ≤ 2,500 字（tests/v1stage2_tenantFacts.spec.ts 钉住）。
// - 这是信息，不是个案法律意见（Law Society Act s.1(5)–(6)）：末尾固定给 LTB /
//   社区法律诊所入口。
import { GUIDELINE_TEXT, N1_NOTICE_DAYS, N4_MAIL_DEEMED_SERVICE_DAYS, N4_TERMINATION_DAYS, PERSISTENT_LATE_COUNT, PERSISTENT_LATE_GRACE_DAYS, PERSISTENT_LATE_WINDOW_MONTHS } from '@/lib/ontario/rules'

export type TenantFactKey =
  | 'deposit'
  | 'cheques'
  | 'lease'
  | 'rentIncrease'
  | 'repairs'
  | 'temperature'
  | 'entry'
  | 'pets'
  | 'sublet'
  | 'roommates'
  | 'harassment'
  | 'earlyEnd'
  | 'moveOut'
  | 'n12'
  | 'arrears'
  | 'screening'

export type TenantFact = {
  key: TenantFactKey
  /** 口语标题，只用于维护者阅读 */
  title: string
  /** 用户消息里命中任一即注入 */
  keywords: RegExp
  /** 口语中文，每段带法条号 */
  text: string
}

export const TENANT_FACTS_HEADING = '## 安省租客事实包(法条号只引用此处)'

export const TENANT_FACTS_FOOTER =
  '(这是公开法规信息,不是个案法律意见;纠纷请向 LTB(tribunalsontario.ca/ltb)、社区法律诊所或 Tenant Duty Counsel 核实。)'

/** 全部命中时的上限（含标题与尾注）。 */
export const TENANT_FACTS_MAX_CHARS = 2500

export const TENANT_FACTS: TenantFact[] = [
  {
    key: 'deposit',
    title: '押金与费用',
    keywords: /押金|押一|利息|钥匙|申请费|手续费|清洁费|收费|退押|deposit|key\s*deposit|application\s*fee|\bfees?\b/i,
    text: `- 押金与费用:只能收「最后一个月租金押金」,最多一个月租金,只抵最后一期租金,不能扣作损坏或清洁费(RTA s.105、s.106(2)(10));损坏/宠物/清洁押金、申请费、手续费一律不许收(s.134),例外只有 O. Reg. 516/06 s.17 列的几项(可退钥匙押金等)。押金利息每年按指导比例付(${GUIDELINE_TEXT.zh}),没付可从下期租金扣(s.106(6)(9));多收了可向 LTB 申请退回。`,
  },
  {
    key: 'cheques',
    title: '预开支票 / 自动扣款',
    keywords: /支票|预开|自动扣|扣款|扣账|自动转账|信用卡|cheques?|post-?dated|debit|pre-?authori[sz]ed/i,
    text: '- 预开支票/自动扣款:房东和租约都不能「要求」你提供预开支票或授权自动扣账、信用卡扣款(RTA s.108);你可以自愿这样付,但不能作为租房条件。',
  },
  {
    key: 'lease',
    title: '租约与无效条款',
    keywords: /租约|租赁合同|合同|条款|附表|签约|签字|副本|标准租约|form\s*400|\blease\b|\bclauses?\b|schedule\s*b|无效/i,
    text: '- 租约与无效条款:2018-04-30 起必须用安省标准租约(O. Reg. 9/18;Form 400 只是要约);签后 21 天内房东须给副本,书面催要后再 21 天没给可暂扣最多一个月租金(s.12、s.12.1)。解读租约逐条对照:押金超一个月租金(s.106(2))、禁止养宠(s.14)、禁止自装空调(s.36.1)、额外费用或宠物/清洁押金(s.134)、结束日早于开始日、任何剥夺 RTA 权利的条款——均无效。',
  },
  {
    key: 'rentIncrease',
    title: '涨租(指针;续约专线激活时跳过)',
    keywords: /涨租|漲租|加租|涨房租|租金上涨|涨租金|rent\s*increase|\bN1\b|指导比例|指导线|guideline/i,
    text: `- 涨租:提前至少 ${N1_NOTICE_DAYS} 天书面 N1、12 个月一次;不超过生效年份的指导比例(${GUIDELINE_TEXT.zh};2018-11-15 后首次入住的不受上限)(RTA s.116、s.119、s.120、s.6.1);超线须 LTB 批准 AGI(s.126)。`,
  },
  {
    key: 'repairs',
    title: '维修',
    keywords: /维修|修理|坏了|漏水|报修|不修|扣租|扣房租|repair|maintenance|withhold|311|rentsafe/i,
    text: '- 维修:房东必须把单位维持在良好可居住、符合健康安全标准的状态(RTA s.20);你负责日常清洁和自己/访客造成的损坏(s.33–34)。不修:先书面通知留证,再向 LTB 提 T6(s.29)或找市政(多伦多 311);不要自行扣租,可在 T6 里申请把租金付到 LTB。',
  },
  {
    key: 'temperature',
    title: '室温与空调',
    keywords: /暖气|供暖|室温|温度|太冷|太热|没有热|空调|冷气|heat\b|heating|temperature|air\s*condition|\bA\/?C\b|too\s*cold/i,
    text: '- 室温与空调:房东供暖的,9 月 1 日至 6 月 15 日至少 20°C(LTB 手册);多伦多市另要求 10 月 1 日至 5 月 15 日至少 21°C(Chapter 497);房东不得切断暖气、水、电等基本服务(s.21)。房东不提供空调的,书面通知后可自装窗式/移动空调(s.36.1)。',
  },
  {
    key: 'entry',
    title: '房东进入',
    keywords: /进我家|进来|进入|进屋|随时进|隐私|\bentry\b|\benter(?:s|ed|ing)?\b|带人看房|带人来看/i,
    text: '- 房东进入:须提前 24 小时书面通知,写明理由、日期与 8:00–20:00 之间的时段(RTA s.27);紧急情况、你当场同意或已发终止通知后带人看房可不事先通知(s.25–26)。反复乱进属于骚扰,可提 T2。',
  },
  {
    key: 'pets',
    title: '宠物',
    keywords: /宠物|养猫|养狗|禁宠|\bpets?\b|\bcats?\b|\bdogs?\b/i,
    text: '- 宠物:申请阶段房东可以因为你有宠物不租给你;但入住后租约里的禁宠条款无效,不能因养宠驱逐你(RTA s.14),除非宠物有危险、损坏或严重影响他人且房东经 LTB 申请。',
  },
  {
    key: 'sublet',
    title: '转租 / 转让',
    keywords: /转租|转让|二房东|接手|sublet|sublease|subletting|assign/i,
    text: '- 转租/转让:都要房东同意,但不能无理拒绝(RTA s.95、s.97);转租是暂离后回来、仍对房东负责,转让是永久退出。提出转让后房东 7 天不回复或一概拒绝,你可用 N9 提前 30 天退租(s.95)。房东同意只能收实际合理花费;你也不能向次承租人多收租金或收费(s.134(3))。',
  },
  {
    key: 'roommates',
    title: '合租 / 与房东同住',
    keywords: /室友|合租|同住|分租|共用|房东住|住在一起|roommate|shar(?:e|es|ed|ing)\s+(?:a\s+|the\s+|my\s+)?(?:kitchen|bathroom)|live[sd]?\s+with\s+(?:my\s+|the\s+)?landlord/i,
    text: '- 合租/与房东同住:和住在同一栋楼的房东(或其配偶、子女、父母)共用厨房或卫生间的,RTA 不适用、LTB 管不了(s.5(i));人权法有对应例外(Human Rights Code s.21(1))。室友之间(都不是房东)的纠纷 LTB 基本不管,可用 CLEO 的判定工具。',
  },
  {
    key: 'harassment',
    title: '骚扰',
    keywords: /骚扰|威胁|恐吓|偷拍|乱拍|监控|摄像头|侵犯|换锁|断水|断电|harass|threat|privacy|intimidat|lock(?:ed)?\s*(?:me\s*)?out|cameras?/i,
    text: '- 骚扰:房东及其雇员不得骚扰、胁迫、威胁或干扰你正常使用住所(RTA s.22、s.23);你可以书面要求停止,并在一年内向 LTB 提 T2(s.29、s.31);有危险就报警。',
  },
  {
    key: 'earlyEnd',
    title: '固定租约提前解约',
    keywords: /提前搬|提前走|提前解约|提前退租|提前终止|解约|毁约|中途|没到期|未到期|break(?:ing)?\s+(?:my\s+|the\s+)?lease|get\s+out\s+of\s+(?:my\s+|the\s+)?lease|leave\s+early|terminate\s+early|\bN11\b|家暴|家庭暴力|domestic/i,
    text: '- 固定租约提前解约:一般不能单方面提前走,除非:①和房东签 N11;②转让租约,房东拒绝或 7 天不回可用 N9 提前 30 天走(s.95);③书面要求后房东仍没给标准租约,可提前 60 天通知退租(s.47.0.1,仅此情形);④遭家庭暴力或性暴力,28 天通知(s.47.1)。直接搬走要承担到再出租前的租金,房东须尽快再出租(s.16)。',
  },
  {
    key: 'moveOut',
    title: '退租通知与到期',
    keywords: /搬走|退租|搬出|退房|想搬|\bN9\b|move\s*out|moving\s*out|give\s+notice|到期|续签|month.to.month|逐月/i,
    text: '- 退租与到期:至少提前 60 天用 N9 通知,终止日须是租期最后一天(固定期即到期日);周租 28 天;邮寄多算 5 天(RTA s.44、s.47)。固定租约到期不续签也不终止的,自动转按月租约、条款不变,房东不能因「到期」赶你走或强迫签新固定租约(s.38)。',
  },
  {
    key: 'n12',
    title: 'N12 自住 / 卖房',
    keywords: /\bN12\b|\bN13\b|自住|自用|卖房|卖了|房东要住|买家|补偿|装修要我搬|renovict|own\s+use|personal\s+use|sell(?:ing)?\s+the/i,
    text: '- N12 自住/卖房:房东或直系亲属真心要住至少一年才能发 N12,终止日至少 60 天后且在租期末(RTA s.48、s.49);2026-09-21 后发出的 N12 给足 120 天可不付补偿,否则付一个月租金或提供另一套房(s.48.1)。你不必在通知日搬走,房东须经 LTB 听证;事后没人搬进来,一年内可提 T5,赔偿最高 12 个月租金(s.57)。',
  },
  {
    key: 'arrears',
    title: '欠租与驱逐',
    keywords: /欠租|拖欠|没交租|迟交|晚交|交不起|\bN4\b|\bN8\b|\bL1\b|驱逐|赶走|赶我走|evict|arrears|late\s+rent|hearing|听证|sheriff/i,
    text: `- 欠租与驱逐:N4 终止日至少在送达后 ${N4_TERMINATION_DAYS} 天(邮寄再加 ${N4_MAIL_DEEMED_SERVICE_DAYS} 天)(RTA s.59);向 LTB 提交 L1 前补齐欠租即作废,裁定前付清欠租加申请费也能中止(s.74)。只有 LTB 下令并由法院执行处执行才能驱逐,房东不能换锁(s.83)。${PERSISTENT_LATE_WINDOW_MONTHS} 个月内 ${PERSISTENT_LATE_COUNT} 次晚于到期日 ${PERSISTENT_LATE_GRACE_DAYS} 天付租算持续迟付,房东可发 N8(s.58)。听证上要提房东违约问题,须先付一半欠款并提前 7 天书面列出(s.82)。`,
  },
  {
    key: 'screening',
    title: '申请与拒租',
    keywords: /拒租|拒绝我|歧视|申请表|信用(?:记录|史|分)|收入.{0,6}(?:倍|比例)|三倍|没有信用|新移民|\bSIN\b|工卡|担保人|discriminat|credit\s+(?:history|score)|guarantor|rent.to.income/i,
    text: '- 申请与拒租:房东只能按 O. Reg. 290/98 问收入信息、信用参考与检查授权、租史、担保人;收入须和其他信息一起看,不能单独按比例划线(如 30%);没有租史或信用史不能当负面;不得因种族、国籍、年龄、家庭状况、残障、领社会援助等拒租(Human Rights Code s.2(1);OHRC 政策)。',
  },
]

export type TenantFactsOptions = {
  /** 本轮带了租约 / 文件附件 → 强制带上「租约与无效条款」段 */
  leaseDocuments?: boolean
  /** 续约专线已激活（RTA_RENEWAL_FACTS 会另行注入）→ 跳过「涨租」指针段 */
  renewalLane?: boolean
}

/** 消息命中的段键（按 TENANT_FACTS 顺序）。 */
export function tenantFactKeys(message: string, opts: TenantFactsOptions = {}): TenantFactKey[] {
  const text = String(message ?? '')
  const keys = TENANT_FACTS.filter((f) => {
    if (opts.renewalLane && f.key === 'rentIncrease') return false
    if (opts.leaseDocuments && f.key === 'lease') return true
    return f.keywords.test(text)
  }).map((f) => f.key)
  return keys
}

/** 按关键词命中拼出的事实包；没有命中返回空串。 */
export function tenantFactsFor(message: string, opts: TenantFactsOptions = {}): string {
  const keys = new Set(tenantFactKeys(message, opts))
  if (!keys.size) return ''
  const body = TENANT_FACTS.filter((f) => keys.has(f.key)).map((f) => f.text)
  return `${TENANT_FACTS_HEADING}\n${body.join('\n')}\n${TENANT_FACTS_FOOTER}`
}
