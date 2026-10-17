'use client'

// /stayloop-api — the partner-facing product (renamed from "Trust API",
// 2026-09-23; rewritten in three tiers for V1.0 stage 1 · 丁 #19, 2026-10-15).
// Everything on this page exists at www.stayloop.ai/api/v1. Tier 3 (/screen)
// is closed until Stayloop's Consumer Reporting Act registration is complete.
// Copy states boundaries in the same words the API responses use.
// Stage 5 (2026-10-16, design/open-api-contract-2026-10.md): tier 1 is seven
// endpoints + one MCP endpoint, free and keyless — rules, compliance checks,
// date arithmetic, rent benchmarks (CMHC + Statistics Canada, open licences).
// No prices here, no limit numbers (the docs read them from lib/api/v1Limits).
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

type Bi = { zh: string; en: string }
const pick = (b: Bi, lang: Lang) => (lang === 'zh' ? b.zh : b.en)

type Tier = 'open' | 'consent' | 'closed'

const TIER_LABEL: Record<Tier, Bi> = {
  open: { zh: '第一档 · 可直接调用', en: 'Tier 1 · open' },
  consent: { zh: '第二档 · 需申请人授权', en: 'Tier 2 · applicant authorisation' },
  closed: { zh: '第三档 · 暂不开放', en: 'Tier 3 · not yet open' },
}
const TIER_CLASS: Record<Tier, string> = {
  open: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  consent: 'border-sky-200 bg-sky-50 text-sky-800',
  closed: 'border-amber-300 bg-amber-50 text-amber-900',
}

const ENDPOINTS: { code: string; tier: Tier; title: Bi; body: Bi; who: Bi; key: Bi }[] = [
  {
    code: 'GET /rules · POST /listings/compliance · … + MCP',
    tier: 'open',
    title: { zh: '七个端点 + 一个 MCP 端点', en: 'Seven endpoints + one MCP endpoint' },
    body: { zh: '规则清单、房源合规检查、租约条款检查、租金指导比例、N4 最早终止日、持续迟付判定、租金基准，以及把同一套工具交给 AI 客户端的 MCP 端点。确定性规则与日期算术，返回规则编号与法条链接；只做规则比对，不是法律意见。', en: 'The rules list, listing compliance, lease-terms check, rent-increase guideline, N4 earliest termination, persistent late payment, rent benchmarks, and an MCP endpoint that hands the same tools to AI clients. Deterministic rules and date arithmetic; returns rule ids with statute links. Rule matching only, not legal advice.' },
    who: { zh: '房源平台、物业系统、经纪工具，以及 Claude / Claude Code / Cursor 这样的 AI 客户端', en: 'Listing platforms, property systems, brokerage tools, and AI clients such as Claude / Claude Code / Cursor' },
    key: { zh: '免费 · 无需密钥 · 不接受、不存储个人信息 · 按调用方或 IP 限流', en: 'Free · no key · accepts and stores no personal data · rate-limited per caller or IP' },
  },
  {
    code: 'POST /passport/verify',
    tier: 'consent',
    title: { zh: '申请人出示的核验结论', en: 'Applicant-presented verification' },
    body: { zh: '申请人在租客护照页生成分享链接并勾选允许 API 读取的范围（身份 / 银行 / 征信档位 / 已确认租史）。合作方传 token，只拿到结论；每次调用写审计并推送通知申请人；撤销链接即失效。同意基础是 PIPEDA 原则 4.3，披露按《消费者报告法》对报告机构的标准处理。', en: 'The applicant creates a share link on their passport page and ticks the scopes the API may read (identity / bank / credit band / confirmed tenancy). The partner sends the token and gets conclusions only; every call is audited and pushed to the applicant; revoking the link ends access. Consent rests on PIPEDA Principle 4.3; the disclosure is handled to the standard the Consumer Reporting Act sets for reporting agencies.' },
    who: { zh: '房东系统、租赁平台在收到申请时调用', en: 'Landlord systems and rental platforms, on receiving an application' },
    key: { zh: '合作方密钥 · 申请人 token · 只回结论不回文件', en: 'Partner key · applicant token · conclusions, never documents' },
  },
  {
    code: 'POST /screen',
    tier: 'closed',
    title: { zh: '发起筛查（暂不开放）', en: 'Start a screening (not yet open)' },
    body: { zh: '完成《消费者报告法》注册后开放，现在一律返回 503、不接受调用。开放后：密钥绑定一个 Stayloop 房东账号；必须附申请人的同意记录；文件从你的 https 地址抓取；202 返回 screening_id，完成后 POST 到你的 webhook。与产品同一条管线，录取与否由房东本人决定。', en: 'Opens once the Consumer Reporting Act registration is complete; returns 503 for now and accepts no calls. Once open: the key is bound to a Stayloop landlord account; the applicant’s consent record is mandatory; files are fetched from your https URLs; 202 returns a screening_id and the result is POSTed to your webhook. Same pipeline as the product; the decision stays with the landlord.' },
    who: { zh: '物业系统把筛查嵌进自己的申请流程（注册后）', en: 'Property systems embedding screening in their own application flow (after registration)' },
    key: { zh: '暂不接受调用（503） · 开放后需合作方密钥 + 同意记录 v1-2026-09', en: 'Not accepted today (503) · once open: partner key + consent record v1-2026-09' },
  },
]

// What tier 1 actually contains — the five facts a reader needs before the docs.
const TIER1_FACTS: { title: Bi; body: Bi }[] = [
  { title: { zh: '规则', en: 'Rules' }, body: { zh: '安省与其他 12 个省 / 地区的住宅租赁规则清单，每条带编号、法条与快照日 as_of。', en: 'The residential tenancy rules of Ontario and the other 12 provinces / territories, each with an id, the statute and the as_of snapshot date.' } },
  { title: { zh: '合规检查', en: 'Compliance checks' }, body: { zh: '房源与租约条款的确定性检查：押金上限、钥匙押金、禁宠条款、申请费 / 宠物押金 / 清洁押金。返回命中的规则编号与法条链接。', en: 'Deterministic checks on listings and lease terms: deposit caps, key deposits, pet bans, application / pet / cleaning fees. Returns the rule ids hit, with statute links.' } },
  { title: { zh: '日期算术', en: 'Date arithmetic' }, body: { zh: '租金指导比例与 N1 截止日、N4 最早终止日、持续迟付判定。只做算术，不选表、不建议是否发出任何通知。', en: 'Rent-increase guideline with the N1 deadline, N4 earliest termination, persistent late payment. Arithmetic only — it does not pick forms or advise whether to serve any notice.' } },
  { title: { zh: '租金基准', en: 'Rent benchmarks' }, body: { zh: 'CMHC 租赁市场调查与加拿大统计局的季度挂牌租金，都是开放授权；响应带必填的来源句 attribution，展示时必须原样保留。调查均租不是成交价。', en: 'CMHC Rental Market Survey and Statistics Canada’s quarterly asking rents, both under open licences; the response carries a mandatory attribution that must be shown as-is. A survey average is not a leased price.' } },
  { title: { zh: 'MCP', en: 'MCP' }, body: { zh: '同一套工具经 Streamable HTTP 开放给 AI 客户端，无鉴权；Claude、Claude Code、Cursor 填一个地址即可接入。', en: 'The same tools over Streamable HTTP for AI clients, no auth; Claude, Claude Code and Cursor connect with a single URL.' } },
]

const BOUNDARY: Bi[] = [
  { zh: '核验结论只在申请人签发的 token 有效期内、按申请人勾选的范围返回。同意的法律基础是 PIPEDA 原则 4.3（本人知情同意）；披露按《消费者报告法》对报告机构的标准处理——只在申请人本人书面指示下、按其勾选的范围披露，申请人可随时撤销。', en: 'Conclusions are returned only within an applicant-issued token’s validity and only for the scopes the applicant ticked. The legal basis is the applicant’s consent (PIPEDA Principle 4.3); the disclosure is handled to the standard the Consumer Reporting Act sets for reporting agencies — only on the applicant’s own written instructions, only for the ticked scopes, revocable at any time.' },
  { zh: '筛查分数与档位是房东自行决定的参考信息，不是拒绝依据（OHRC 租房政策）；不得设收入比截止线。', en: 'Screening score and tier are information for the landlord’s own decision, never grounds to decline (OHRC housing policy); no income-ratio cut-offs.' },
  { zh: '合作方发起筛查（第三档）在 Stayloop 完成《消费者报告法》注册前暂不开放；开放后也只对房东身份的接入方，并要求申请人的同意记录。', en: 'Partner-initiated screening (tier 3) is closed until Stayloop’s Consumer Reporting Act registration is complete; once open it is limited to landlord-bound keys and requires the applicant’s consent record.' },
  { zh: '面向金融机构的用途尚未开放，待法律意见。', en: 'Use by financial institutions is not yet open, pending legal advice.' },
  { zh: '第二档密钥由 Stayloop 发放，只存哈希，可随时停用；第一档与 MCP 按调用方或 IP 限流，具体次数写在文档里。', en: 'Tier 2 keys are issued by Stayloop, stored hashed, and can be disabled at any time; tier 1 and MCP are rate-limited per caller or IP, with the numbers in the docs.' },
  { zh: '使用规则在服务条款第 7 节：只能用于你自己的产品，不得转售、不得训练模型，租金基准必须展示来源句。', en: 'Usage rules are in the Terms of Service §7: your own product only, no resale, no model training, benchmarks must show the attribution.' },
]

const AI_CLIENTS: Bi[] = [
  { zh: '允许：由用户发起的实时访问——用户自己的 AI 助理在对话中替 TA 实时调用，把结果展示给这位用户。', en: 'Allowed: real-time access initiated by a user — a person’s own AI Agent calling on their behalf during a conversation and showing the result to that person.' },
  { zh: '不允许：留存响应、为响应建索引、用于训练模型或作为数据集转售；第二档响应含个人信息，只能在该用户的会话内使用。', en: 'Not allowed: retaining responses, indexing them, training models on them or reselling them as a dataset; tier 2 responses contain personal information and may be used only within that user’s session.' },
  { zh: '以上工具与端点只做确定性规则与日期算术，不是法律意见。', en: 'The tools and endpoints above do deterministic rules and date arithmetic only; they are not legal advice.' },
  { zh: 'MCP 端点已开放：Claude、Claude Code、Cursor 的接法在文档里。', en: 'The MCP endpoint is live: how to connect Claude, Claude Code and Cursor is in the docs.' },
]

export default function StayloopApiPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />

      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7 lg:py-18">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[.12em] text-brand">{zh ? 'STAYLOOP API · 安省租房核验 API' : 'STAYLOOP API · Ontario rental verification'}</div>
          <h1 className="mt-4 max-w-[760px] text-[clamp(28px,3.4vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            {zh ? '全流程里的事实与规则，分三档开放给你的系统。' : 'The facts and rules of the whole lifecycle, opened to your system in three tiers.'}
          </h1>
          <p className="mt-4 max-w-[680px] text-[16px] leading-[1.6] text-body-2">
            {zh
              ? '规则、合规检查、日期算术、租金基准：七个端点 + 一个 MCP 端点，免费、无需密钥；核验结论由申请人本人授权后才返回；合作方发起筛查要等 Stayloop 完成《消费者报告法》注册后才开放。同源 Base URL，没有 SDK，任何 HTTP 客户端即可。'
              : 'Rules, compliance checks, date arithmetic, rent benchmarks: seven endpoints + one MCP endpoint, free and keyless; verification conclusions are returned only with the applicant’s authorisation; partner-initiated screening opens once Stayloop’s Consumer Reporting Act registration is complete. Same-origin base URL, no SDK, any HTTP client.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[12.5px]">
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">Base <code className="font-mono">https://www.stayloop.ai/api/v1</code></span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">MCP <code className="font-mono">https://www.stayloop.ai/api/mcp</code></span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '密钥头 ' : 'Key header '}<code className="font-mono">X-API-Key</code>{zh ? '（仅第二档）' : ' (tier 2 only)'}</span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '数据库驻加拿大' : 'Database in Canada'}</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/stayloop-api/docs" className="sl-btn-primary">{zh ? '接口文档与示例' : 'Docs and examples'}</Link>
            <Link href="/stayloop-api/docs#mcp" className="sl-btn-secondary">{zh ? '接入 MCP' : 'Connect over MCP'}</Link>
            <Link href="/contact" className="sl-btn-ghost">{zh ? '第二档密钥 / 试点' : 'Tier 2 key / pilot'}</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7">
        <h2 className="text-[24px] font-extrabold tracking-tight sm:text-[30px]">{zh ? '三档端点' : 'Three tiers of endpoints'}</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {ENDPOINTS.map((e) => (
            <div key={e.code} className={`flex flex-col rounded-2xl border bg-white p-5 ${e.tier === 'closed' ? 'border-amber-300' : 'border-line-divider'}`}>
              <span className={`self-start rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${TIER_CLASS[e.tier]}`}>{pick(TIER_LABEL[e.tier], lang)}</span>
              <code className="mt-3 font-mono text-[12.5px] font-bold text-brand">{e.code}</code>
              <div className="mt-2 text-[17px] font-bold">{pick(e.title, lang)}</div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{pick(e.body, lang)}</p>
              <div className="mt-4 border-t border-line-divider pt-3 text-[12.5px] text-body-3">
                <div><span className="font-semibold text-body-2">{zh ? '谁用：' : 'Who: '}</span>{pick(e.who, lang)}</div>
                <div className="mt-1"><span className="font-semibold text-body-2">{zh ? '门槛：' : 'Door: '}</span>{pick(e.key, lang)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line-divider" style={{ background: '#F3F8FC' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-12 sm:px-7">
          <h2 className="text-[22px] font-extrabold tracking-tight">{zh ? '第一档里有什么' : 'What is in tier 1'}</h2>
          <p className="mt-2 max-w-[760px] text-[14.5px] leading-relaxed text-body-2">{zh ? '全部免费、无需密钥、不接受也不存储个人信息；每个响应带规则快照日 as_of 与固定的边界句。' : 'All free, keyless, and no personal data accepted or stored; every response carries the as_of snapshot date and the fixed boundary sentence.'}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" data-testid="tier1-facts">
            {TIER1_FACTS.map((f) => (
              <div key={f.title.en} className="rounded-2xl border border-line-divider bg-white p-4">
                <div className="text-[15px] font-bold">{pick(f.title, lang)}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">{pick(f.body, lang)}</p>
              </div>
            ))}
          </div>
          <h2 className="mt-10 text-[22px] font-extrabold tracking-tight">{zh ? '它从哪里来' : 'Where it comes from' }</h2>
          <p className="mt-2 max-w-[760px] text-[14.5px] leading-relaxed text-body-2">
            {zh
              ? 'API 不是另一套系统。规则与合规检查用的是发布向导、租约草稿与 /rules 页同一份规则；日期算术是续约卡与 N 表工具箱同一套函数；租金基准是房源页同一张表；核验结论来自申请人本人授权的核验与双方确认的在管租约；筛查（开放后）就是房东在工作台点的那一次筛查。'
              : 'The API is not a second system. Rules and compliance checks use the same rules as the publish wizard, lease drafts and the /rules page; the date arithmetic is the same functions behind the renewal card and the N-form toolbox; rent benchmarks are the same table the listing page reads; conclusions come from applicant-authorised verification and counterparty-confirmed tenancies; a screening (once open) is the very screening a landlord runs in the workspace.'}
            {' '}<Link href="/platform" className="underline">{zh ? '看整条流程 →' : 'See the whole flow →'}</Link>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 py-12 sm:px-7">
        <h2 className="text-[22px] font-extrabold tracking-tight">{zh ? '边界（先读这段）' : 'Boundary (read this first)'}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-body-2">
          {BOUNDARY.map((b) => <li key={b.en}>{pick(b, lang)}</li>)}
        </ul>
        <h2 className="mt-10 text-[22px] font-extrabold tracking-tight">{zh ? '给 AI 客户端的说明' : 'Notes for AI clients'}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-body-2">
          {AI_CLIENTS.map((b) => <li key={b.en}>{pick(b, lang)}</li>)}
        </ul>
        <p className="mt-6 text-[13px] text-body-3">{zh ? '数据来源目录见 ' : 'Data sources: '}<Link href="/partners" className="underline">/partners</Link>{zh ? '；规则全文见 ' : '; rules: '}<Link href="/rules" className="underline">/rules</Link>{zh ? '；使用规则见 ' : '; usage rules: '}<Link href="/terms" className="underline">/terms</Link>.</p>
      </section>
      <Footer />
    </div>
  )
}
