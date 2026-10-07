'use client'

// /stayloop-api — the partner-facing product (renamed from "Trust API",
// 2026-09-23). Everything on this page exists at www.stayloop.ai/api/v1;
// the old four-endpoint concept page (Verify agent, VOIE, GDPR chips) is
// gone. Copy states boundaries in the same words the API responses use.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

type Bi = { zh: string; en: string }
const pick = (b: Bi, lang: Lang) => (lang === 'zh' ? b.zh : b.en)

const ENDPOINTS: { code: string; title: Bi; body: Bi; who: Bi; key: Bi }[] = [
  {
    code: 'POST /listings/compliance',
    title: { zh: '房源合规检查', en: 'Listing compliance' },
    body: { zh: '押金 ≤ 一个月（RTA s.106）、钥匙押金（O. Reg. 516/06 s.17）、禁宠条款无效（s.14）、申请费 / 宠物押金 / 清洁押金禁止（s.134）。确定性规则，返回规则编号与法条链接。', en: 'Deposit ≤ one month (RTA s.106), key deposit (O. Reg. 516/06 s.17), void pet bans (s.14), no application / pet / cleaning fees (s.134). Deterministic rules; returns rule ids with statute links.' },
    who: { zh: '房源平台、物业系统在发布前调用', en: 'Listing platforms and property systems, before publishing' },
    key: { zh: '免费 · 无需密钥 · 不接受、不存储个人信息', en: 'Free · no key · accepts and stores no personal data' },
  },
  {
    code: 'POST /passport/verify',
    title: { zh: '申请人出示的核验结论', en: 'Applicant-presented verification' },
    body: { zh: '申请人在租客护照页生成分享链接并勾选允许 API 读取的范围（身份 / 银行 / 征信档位 / 已确认租史）。合作方传 token，只拿到结论；每次调用写审计并推送通知申请人；撤销链接即失效。', en: 'The applicant creates a share link on their passport page and ticks the scopes the API may read (identity / bank / credit band / confirmed tenancy). The partner sends the token and gets conclusions only; every call is audited and pushed to the applicant; revoking the link ends access.' },
    who: { zh: '房东系统、租赁平台在收到申请时调用', en: 'Landlord systems and rental platforms, on receiving an application' },
    key: { zh: '合作方密钥 · 申请人 token · 只回结论不回文件', en: 'Partner key · applicant token · conclusions, never documents' },
  },
  {
    code: 'POST /screen',
    title: { zh: '发起筛查', en: 'Start a screening' },
    body: { zh: '密钥绑定一个 Stayloop 房东账号；必须附申请人对 Stayloop 筛查同意文本的接受记录；文件从你的 https 地址抓取（≤25 MB，最多 14 个）。立即返回 202 与 screening_id，完成后 POST 到你的 webhook。与产品同一条管线、同样的配额与合规规则。', en: 'The key is bound to a Stayloop landlord account; the applicant’s acceptance of Stayloop’s screening consent text is mandatory; files are fetched from your https URLs (≤25 MB, up to 14). Returns 202 with a screening_id and POSTs the result to your webhook. Same pipeline, quotas and compliance rules as the product.' },
    who: { zh: '物业系统把筛查嵌进自己的申请流程', en: 'Property systems embedding screening in their own application flow' },
    key: { zh: '合作方密钥 · 同意记录 v1-2026-09 · webhook 回调', en: 'Partner key · consent record v1-2026-09 · webhook callback' },
  },
]

const BOUNDARY: Bi[] = [
  { zh: 'Stayloop 不是《消费者报告法》意义上的报告机构。核验结论只在申请人签发的 token 有效期内、按申请人勾选的范围返回。', en: 'Stayloop is not a consumer reporting agency under the Consumer Reporting Act. Conclusions are returned only within an applicant-issued token’s validity and only for the scopes the applicant ticked.' },
  { zh: '筛查分数与档位是房东自行决定的参考信息，不是拒绝依据（OHRC 租房政策）；不得设收入比截止线。', en: 'Screening score and tier are information for the landlord’s own decision, never grounds to decline (OHRC housing policy); no income-ratio cut-offs.' },
  { zh: '面向金融机构的用途尚未开放，待法律意见。', en: 'Use by financial institutions is not yet open, pending legal advice.' },
  { zh: '密钥由 Stayloop 发放，只存哈希，可随时停用；限流：verify 120/分钟，screen 20/分钟，compliance 每 IP 120/小时。', en: 'Keys are issued by Stayloop, stored hashed, and can be disabled at any time. Limits: verify 120/min, screen 20/min, compliance 120/h per IP.' },
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
            {zh ? '全流程里的事实与规则，变成你的系统能调用的三个端点。' : 'The facts and rules of the whole lifecycle, as three endpoints your system can call.'}
          </h1>
          <p className="mt-4 max-w-[680px] text-[16px] leading-[1.6] text-body-2">
            {zh
              ? '合规检查免费开放；核验结论由申请人主动出示；筛查走与 Stayloop 产品完全相同的管线。同源 Base URL，没有 SDK，任何 HTTP 客户端即可。'
              : 'Compliance checks are free and open; verification conclusions are presented by the applicant; screening runs on exactly the pipeline the product uses. Same-origin base URL, no SDK, any HTTP client.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[12.5px]">
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">Base <code className="font-mono">https://www.stayloop.ai/api/v1</code></span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '密钥头 ' : 'Key header '}<code className="font-mono">X-API-Key</code></span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '数据库驻加拿大' : 'Database in Canada'}</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/stayloop-api/docs" className="sl-btn-primary">{zh ? '接口文档与示例' : 'Docs and examples'}</Link>
            <Link href="/contact" className="sl-btn-secondary">{zh ? '申请密钥 / 试点' : 'Request a key / pilot'}</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7">
        <h2 className="text-[24px] font-extrabold tracking-tight sm:text-[30px]">{zh ? '三个端点，每个都有真实后端' : 'Three endpoints, each with a real backend'}</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {ENDPOINTS.map((e) => (
            <div key={e.code} className="flex flex-col rounded-2xl border border-line-divider bg-white p-5">
              <code className="font-mono text-[12.5px] font-bold text-brand">{e.code}</code>
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
          <h2 className="text-[22px] font-extrabold tracking-tight">{zh ? '它从哪里来' : 'Where it comes from' }</h2>
          <p className="mt-2 max-w-[760px] text-[14.5px] leading-relaxed text-body-2">
            {zh
              ? 'API 不是另一套系统。房源合规检查用的是发布向导与租约草稿同一份规则；核验结论来自申请人本人授权的核验与双方确认的在管租约；筛查就是房东在工作台点的那一次筛查。'
              : 'The API is not a second system. Compliance uses the same rules as the publish wizard and lease drafts; conclusions come from applicant-authorised verification and counterparty-confirmed tenancies; a screening is the very screening a landlord runs in the workspace.'}
            {' '}<Link href="/platform" className="underline">{zh ? '看整条流程 →' : 'See the whole flow →'}</Link>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 py-12 sm:px-7">
        <h2 className="text-[22px] font-extrabold tracking-tight">{zh ? '边界（先读这段）' : 'Boundary (read this first)'}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-body-2">
          {BOUNDARY.map((b) => <li key={b.en}>{pick(b, lang)}</li>)}
        </ul>
        <p className="mt-6 text-[13px] text-body-3">{zh ? '数据来源目录见 ' : 'Data sources: '}<Link href="/partners" className="underline">/partners</Link>{zh ? '；规则全文见 ' : '; rules: '}<Link href="/rules" className="underline">/rules</Link>.</p>
      </section>
      <Footer />
    </div>
  )
}
