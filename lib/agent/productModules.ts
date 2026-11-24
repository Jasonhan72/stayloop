// Each product module, as the AI conversation meets it (2026-11-24, user: 「所有产品页面里的模块，都要能在
// AI 对话里调用，也能用 AI 对话完成服务。是不是在产品页，要加上 AI 对话的功能？或者用已经有的 AI 主对话？你研究一下
// 怎么连接合适」).
//
// What the research found (the same day, anonymous preview on production, one question per module):
//   · the conversation did not know two of the five modules. Asked how to bring a signed lease in, it
//     sent the landlord to /landlord/leases to press a button that does not exist (the page is
//     /leases/import); asked how to connect the API, it said Stayloop has no public API (it has seven
//     keyless endpoints and an MCP endpoint);
//   · asked to record this month's rent, it promised 「登录后我可以替你自动归档并更新租金记录」 — a landlord's
//     conversation proposes no cards at all, so that is something it cannot do;
//   · inside the workspace, pages already hand a task to the main conversation with
//     `/<role>/agent?prompt=…` (dozens of links); the product page and the modules' public pages had none.
//
// What was decided: there is one conversation — the person's own AI Agent, with its memory, its
// approval cards and its audit trail — and the product page does not get a second one. The two are
// joined by this file, which is keyed by the product list (lib/nav/siteNav.ts PRODUCT_PAGE_MODULES):
//   · `asks` — what a person says to start the module. The product page shows them under each
//     module and sends the sentence into the main conversation as that role
//     (lib/homeDeepLink.ts assistantPromptHref). Each is a question with no facts of anybody's in
//     it, so it is safe to send on arrival, signed in or not;
//   · `guide` — what the assistant is told about the module, per hat: what it does in the
//     conversation, and exactly where the rest is done. It goes into the system prompt
//     (productModulesGuide, called from lib/agent/prompts.ts), so the page and the assistant read
//     the same list and a module added to the product list cannot be unknown to the conversation
//     (tests/moduleChat20261124).
//
// `reach` says how far the conversation takes the module TODAY — it is a record, not a promise, and
// nothing shows it to visitors:
//   'finishes'  the service is completed in the conversation (a card the person approves);
//   'guides'    the conversation explains and points at the page where the person does it;
//   'outside'   the module is itself the way other AI conversations call Stayloop.
// Moving a module from 'guides' to 'finishes' is new capability (a draft card the person confirms),
// and for landlords and agents it changes a standing rule — their conversations propose no cards.
// Every path a guide names must be in lib/agent/replyPaths.ts PATH_RE, or it stays plain text in the chat.
import { PRODUCT_PAGE_MODULES } from '@/lib/nav/siteNav'
import type { AssistantRole } from '@/lib/homeDeepLink'

export type Bi = { zh: string; en: string }
export type ModuleAsk = { role: AssistantRole; ask: Bi }
export type ChatReach = 'finishes' | 'guides' | 'outside'
export type ModuleInChat = {
  /** the module's href on the product list */
  href: string
  asks: ModuleAsk[]
  reach: Record<AssistantRole, ChatReach>
  /** one prompt line per hat (Chinese: the prompt's language) */
  guide: Record<AssistantRole, string>
}

const same = (line: string): Record<AssistantRole, string> => ({ tenant: line, landlord: line, agent: line })

const API_LINE =
  'Stayloop API → /stayloop-api(文档 /stayloop-api/docs):Stayloop 有开放 API,问到时【不要说没有】。第一档免费、不用密钥:规则清单、房源合规检查、租约条款检查、租金指导比例、N4 最早终止日、持续迟付判定、租金基准这七个端点,外加一个 MCP 端点 https://www.stayloop.ai/api/mcp ——Claude、Claude Code、Cursor 这类支持 MCP 的 AI 客户端填这个地址,就能在它们自己的对话里调用同一套工具。第二档只返回核验结论,要合作方密钥加申请人本人授权(申请走 /contact);第三档(合作方发起筛查)暂不开放。API 不提供房源库和申请人资料,也不替人筛查;限流次数与参数以文档为准,不要编。'

export const MODULES_IN_CHAT: ModuleInChat[] = [
  {
    href: '/tenant/passport',
    asks: [{ role: 'tenant', ask: { zh: '帮我准备申请包，要哪些材料？', en: 'Help me build my application pack — what do I need?' } }],
    reach: { tenant: 'guides', landlord: 'guides', agent: 'guides' },
    guide: {
      tenant:
        '租客护照(申请包)→ /tenant/passport:申请表会问的资料和文件准备一次(身份与联系方式、工作与收入、租房历史、其他,加上文件和一份同意书),以后在房源的申请页选「用我的申请包填写」自动带入;也可以在那一页生成只读的分享链接发给站外的房东,随时能撤销。对话里你能做的:讲清每一段要填什么、看他发来的图片或文件说还缺什么、解释房东在申请里会看到什么。填写、上传、勾选同意、生成或撤销分享链接都由他本人在 /tenant/passport 做——你不能替他填、替他分享,他在对话里发给你的文件也不会存进申请包,不要说「已经存好」。',
      landlord:
        '租客护照(申请包):这是租客自己准备的申请资料,申请时自动带进申请表;房东在 /landlord/applicants 打开那位申请人看到的就是它。里面是申请人自己提供的内容,不等于已经核验。',
      agent:
        '租客护照(申请包):租客客户自己在 /tenant/passport 准备,申请时自动带入。你不能替客户填,也不要说已经替他存好。',
    },
  },
  {
    href: '/leases/import',
    asks: [
      { role: 'landlord', ask: { zh: '我有一份签好的租约，怎么导入进来、每月记租金？', en: 'I have a signed lease — how do I bring it in and record the rent each month?' } },
      { role: 'tenant', ask: { zh: '我想把现在的租约放进来，和房东共用一份记录', en: 'I want to bring in my current lease and share one record with my landlord' } },
    ],
    // finished in the conversation since 2026-11-24: the import (the lease import card —
    // lib/agent/leaseImportIntent.ts), for all three; and recording rent (the rent record card —
    // lib/agent/rentRecordIntent.ts), for a landlord and a tenant. Reconciling against a bank statement,
    // attaching a receipt and exporting the record are still done on the page.
    reach: { tenant: 'finishes', landlord: 'finishes', agent: 'finishes' },
    guide: {
      landlord:
        '租约与租金记录 → /leases/import:已经签好的租约(在别处签的也行)在这一页导入——上传 PDF 或照片,系统读出地址、租期和租金填进确认表,他核对确认后才保存,然后邀请租客加入;租客确认后这份记录就是双方共同的「在管租约」,对话、报修、租金提醒都在里面。在对话里也能办:他说要导入一份已签的租约时,系统会在你的回复下面放一张导入卡,选文件、核对、确认都在卡上(没有出现卡时,请他说一句「导入租约」)。页面入口只有 /leases/import,/landlord/leases 是起草和发送新租约的地方。每月记租金在对话里也能办:他说某一期租金收到了,系统会在你的回复下面放一张记租金的卡,他勾选是哪一期、填收到的日期、点确认后才记上(没有出现卡时,请他说一句「X 月的租金收到了」);要用银行流水对账,在 /landlord/finance 的租金台账里点开那份租约,进到在管租约的「租金」标签上传 CSV;需要留底时在在管租约页点「导出记录」(是 Stayloop 上留下的记录,不是 LTB 表格,也不替他提交)。导入和记租金都要他本人在卡上或页面上确认:你不能替他导入,也不能替他把某一期记成已收——不要说「已经导入」「已经记好了」「我来帮你记账」。租金提醒和逾期由系统放进 /landlord/todo 等他批准。他在对话里上传租约,你可以解读条款,但那不等于导入。Stayloop 不经手资金。',
      tenant:
        '租约与租金记录 → /leases/import:租客也可以自己把签好的租约导入(上传 PDF 或照片,核对系统读出的地址、租期和租金,确认后保存),再邀请房东加入;房东确认后这份记录就是双方共同的。在对话里也能办:他说要导入已签的租约时,系统会在你的回复下面放一张导入卡,选文件、核对、确认都在卡上(没有出现卡时,请他说一句「导入租约」)。付了租金想留记录,在对话里也能办:他说这一期房租交了,系统会在你的回复下面放一张记租金的卡,他勾选是哪一期、填付款日期、点确认后才记上;也可以在 /tenant/payments 点「记录已付」,那里还能附凭证。房东确认后就是双方确认过的付租记录。导入和记录付租都要他本人在卡上或页面上确认:你不能替他导入或替他记,也不要说「已经导入」「已经记好了」;他在对话里上传租约让你解读,那不等于导入。Stayloop 不经手租金。',
      agent:
        '租约与租金记录 → /leases/import:经纪可以替客户先把已签的租约导入(上传 PDF 或照片,核对系统读出的信息后保存),再邀请房东和租客加入并确认;之后的租金记录由房东和租客自己做。在对话里也能办:他说要导入已签的租约时,系统会在你的回复下面放一张导入卡,选文件、核对、确认都在卡上。你不能替他导入,也不要说「已经导入」。',
    },
  },
  {
    href: '/services',
    asks: [
      { role: 'tenant', ask: { zh: '我要报修', en: 'I need to report a repair' } },
      { role: 'landlord', ask: { zh: '租客报修了，怎么派给师傅？', en: 'My tenant reported a repair — how do I dispatch someone?' } },
    ],
    // a tenant's repair is the one service the conversation completes today: a card, approved, sent to the landlord
    reach: { tenant: 'finishes', landlord: 'guides', agent: 'guides' },
    guide: {
      tenant:
        '维修与服务网络:租客报修就在对话里办——按上面的「报修整理」出报修卡,他批准后发给房东;进度在 /tenant/maintenance。维修由房东安排,正常使用坏掉的不该由租客出钱。',
      landlord:
        '维修与服务网络(试点,多伦多及周边):租客的报修是工单,在 /landlord/maintenance;给工单派人只能在那张工单上点「指派」(派给核验过的服务商或他自己的联系人;联系人与派单策略在 /landlord/providers);报价批准、完工验收由系统放进 /landlord/todo 等他点头。Stayloop 不抽成,费用由双方线下结算。你不能在对话里替他派单。',
      agent:
        '维修与服务网络:派单是房东在 /landlord/maintenance 那张工单上做的事;经纪替客户找服务商见下方「找经纪 / 找服务商」。',
    },
  },
  {
    href: '/agents',
    asks: [
      { role: 'tenant', ask: { zh: '我想找一位租赁经纪', en: 'I am looking for a leasing agent' } },
      { role: 'landlord', ask: { zh: '哪里能找到水管工？', en: 'Where can I find a plumber?' } },
    ],
    reach: { tenant: 'guides', landlord: 'guides', agent: 'guides' },
    guide: same('找经纪 · 服务商:见下方「找经纪 / 找服务商」——你看不到目录里有谁,只给入口。'),
  },
  {
    href: '/stayloop-api',
    asks: [{ role: 'agent', ask: { zh: 'Stayloop API 能查什么？怎么接进 AI 客户端？', en: 'What can the Stayloop API look up, and how do I connect it to an AI client?' } }],
    reach: { tenant: 'outside', landlord: 'outside', agent: 'outside' },
    guide: same(API_LINE),
  },
]

/** The entry for a module of the product list, or null. */
export function moduleInChat(href: string): ModuleInChat | null {
  return MODULES_IN_CHAT.find((m) => m.href === href) ?? null
}

/** The product list's modules that have no entry here — must stay empty (tests/moduleChat20261124). */
export function modulesUnknownToChat(): string[] {
  return PRODUCT_PAGE_MODULES.map((m) => m.href).filter((h) => !moduleInChat(h))
}

/** The section of the system prompt that tells the assistant about the product's modules, in the product list's order. */
export function productModulesGuide(role: AssistantRole): string {
  const lines = PRODUCT_PAGE_MODULES.map((m) => moduleInChat(m.href)).filter((m): m is ModuleInChat => !!m).map((m) => `- ${m.guide[role]}`)
  return `# 产品模块(产品页 /platform 上的那几个;用户问到其中任何一个,都按这里说)
对话里能直接办成的只有两类:原则 2 写明的动作,和下面写着「在对话里也能办」的事(那是系统放在你回复下面的卡,由用户本人在卡上确认,你看不到卡上的内容,也不能替他确认)。其余的事讲清楚怎么做、在哪一页做,并写出路径;不要说「登录后我可以替你……」这类你做不到的话,也不要编页面上没有的按钮。
${lines.join('\n')}`
}
