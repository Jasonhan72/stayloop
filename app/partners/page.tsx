'use client'

// /partners → "where our data comes from" (2026-09-22, EliseAI benchmark
// item L). EliseAI's integrations page is a filterable partner directory; we
// have no signed partnerships to show, so the honest equivalent is a source
// directory: every external system a Stayloop result can rest on, what it is
// used for, and its real status today. Nothing here is a logo wall.
import Link from 'next/link'
import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

type Status = 'live' | 'sandbox' | 'preparing' | 'demo'
type Cat = 'screening' | 'listings' | 'verification' | 'ai'

const STATUS: Record<Status, { label: Record<Lang, string>; cls: string }> = {
  live: { label: { zh: '已接入', en: 'Live' }, cls: 'bg-success/10 text-success' },
  sandbox: { label: { zh: '已接入 · 沙箱', en: 'Integrated · sandbox' }, cls: 'bg-warning/10 text-warning' },
  preparing: { label: { zh: '筹备中', en: 'In preparation' }, cls: 'bg-surface-chip text-body-3' },
  demo: { label: { zh: '示范阶段', en: 'Demonstration stage' }, cls: 'bg-warning/10 text-warning' },
}

const CATS: { key: Cat | 'all'; label: Record<Lang, string> }[] = [
  { key: 'all', label: { zh: '全部', en: 'All' } },
  { key: 'screening', label: { zh: '筛查与公开记录', en: 'Screening & public records' } },
  { key: 'listings', label: { zh: '房源与行情', en: 'Listings & market' } },
  { key: 'verification', label: { zh: '申请人本人授权核验', en: 'Applicant-authorised verification' } },
  { key: 'ai', label: { zh: 'AI 服务商', en: 'AI providers' } },
]

const SOURCES: { name: string; cat: Cat; status: Status; use: Record<Lang, string>; note?: Record<Lang, string>; href?: string }[] = [
  { name: 'Ontario LTB order catalogue', cat: 'screening', status: 'live', href: 'https://data.ontario.ca/dataset/ltb-order-catalogue',
    use: { zh: '安省开放数据的 LTB 终局判令，落库后按姓名与地址佐证实查；每月 3 号自动刷新（增 + 删）。', en: 'Ontario open-data LTB final orders, indexed and searched by name with address corroboration; refreshed on the 3rd of each month (adds and removals).' },
    note: { zh: '目录只覆盖安省已发布的窗口，「未查到」不等于「从未涉诉」；目录没有判决结果字段。', en: 'Covers only the window Ontario has published — "not found" is not "never involved"; the catalogue carries no outcome field.' } },
  { name: 'Ontario Courts portal (Civil & Small Claims)', cat: 'screening', status: 'live',
    use: { zh: '真当事人检索：申请人与共同申请人的民事与小额法庭记录，全部字序与模糊变体都查后合并。', en: 'True party search: civil and small-claims records for the applicant and co-applicants; every name order and fuzzy variant is queried, then merged.' },
    note: { zh: '门户对部分出口地区返回 403 时走加拿大区数据库中转；立案不等于结果，报告不下结论。', en: 'When the portal returns 403 to some egress regions, requests relay through the Canadian-region database; a filing is not an outcome and the report says so.' } },
  { name: 'CanLII (index search)', cat: 'screening', status: 'live',
    use: { zh: '判例索引的「提及」检索，永不计分；CanLII API 本身没有当事人检索，报告如实标注。', en: '"Mention" search over the case-law index, never scored; the CanLII API has no party search and the report says so.' } },
  { name: 'Corporations Canada (federal registry)', cat: 'screening', status: 'live', href: 'https://ised-isde.canada.ca/site/corporations-canada/en',
    use: { zh: '深度核查的雇主 / BN 核验；每月 5 号全量刷新，截断下载会直接失败而不是静默「成功」。', en: 'Employer / BN verification for deep checks; full refresh on the 5th of each month, and a truncated download fails loudly instead of "succeeding".' } },
  { name: 'OpenCorporates (Ontario registry)', cat: 'screening', status: 'live', href: 'https://opencorporates.com',
    use: { zh: '安省公司注册状态（Active / Inactive）、董事（如公开）；Inactive 时再查 Ontario Gazette 的注销原因。', en: 'Ontario corporate status (Active / Inactive) and officers where published; an Inactive result triggers the Ontario Gazette lookup for the reason.' } },
  { name: 'Ontario Gazette · Government Notices Respecting Corporations', cat: 'screening', status: 'live', href: 'https://www.ontario.ca/search/ontario-gazette',
    use: { zh: '公司为何注销：《公司税法》违约注销、《公司信息法》未申报、自愿解散、复活。只读 ontario.ca 页面。', en: 'Why a corporation was dissolved: Corporations Tax Act default, Corporations Information Act non-filing, voluntary dissolution, revival. Reads ontario.ca pages only.' } },
  { name: 'Bank Act Schedules I / II / III', cat: 'screening', status: 'live', href: 'https://laws-lois.justice.gc.ca/eng/acts/B-1.01/',
    use: { zh: '雇主是银行时不查公司注册库，直接对照《银行法》附表（OSFI 监管实体）。', en: 'When the employer is a bank it is matched against the Bank Act schedules (OSFI-regulated entities) instead of a corporate registry.' } },
  { name: 'RDAP (domain registration data)', cat: 'screening', status: 'live', href: 'https://rdap.org',
    use: { zh: '在职信上的雇主域名注册日期；域名不存在或注册晚于信称入职一年以上会标记。', en: 'Registration date of the employer domain on an employment letter; a non-existent domain, or one registered more than a year after the claimed start date, is flagged.' } },
  { name: 'Realtor.ca (live listings)', cat: 'listings', status: 'demo', href: 'https://www.realtor.ca',
    use: { zh: '租客助手的实时房源补充与行情样本（经 Jina 阅读器抓取）；导入房源带来源徽章。', en: 'Live listing top-up and market samples for the tenant assistant (read via the Jina reader); imported listings carry a source badge.' },
    note: { zh: '示范阶段：TRREB 数据库未接入，正式数据源计划换 DDF Partner。', en: 'Demonstration stage: the TRREB feed is not connected; the production source is planned to be DDF Partner.' } },
  { name: 'TRREB Rental Market Report', cat: 'listings', status: 'live', href: 'https://trreb.ca/market-data/rental-market-report/',
    use: { zh: '季度官方租赁基准（按房型均租），每周一自动刷新；行情卡与续约 90 天触点都引用它。', en: 'Official quarterly benchmark (average rent by layout), refreshed every Monday; the market card and the 90-day renewal touchpoint both cite it.' } },
  { name: 'Veriff', cat: 'verification', status: 'sandbox', href: 'https://www.veriff.com',
    use: { zh: '申请人本人授权的证件 + 活体核验，只保留证件末四位。', en: 'Applicant-authorised document and liveness check; only the last four characters of the ID are kept.' },
    note: { zh: '生产凭证待签约。', en: 'Production credentials pending contract.' } },
  { name: 'Flinks', cat: 'verification', status: 'sandbox', href: 'https://flinks.com',
    use: { zh: '申请人授权的 90 天入账摘要（掩码账号、循环入账、NSF 次数），原始流水不落库。', en: 'Applicant-authorised 90-day deposit summary (masked account, recurring deposits, NSF count); raw transactions are never stored.' },
    note: { zh: '沙箱结果标 sandbox，不进评分。', en: 'Sandbox results are labelled and never scored.' } },
  { name: 'Equifax Canada', cat: 'verification', status: 'preparing', href: 'https://www.consumer.equifax.ca',
    use: { zh: '申请人本人授权的征信直拉（姓名 / 出生日期 / 现住址，不收 SIN），结果与上传报告同一形状。', en: 'Applicant-authorised bureau pull (name / date of birth / current address, no SIN) in the same shape as an uploaded report.' },
    note: { zh: '等待加拿大商业协议与 API 参考；Stayloop 不是消费者报告机构。', en: 'Awaiting the Canadian commercial agreement and API reference; Stayloop is not a consumer reporting agency.' } },
  { name: 'Anthropic · OpenAI · Google (default models)', cat: 'ai', status: 'live',
    use: { zh: '助手对话、文件读取与一致性审查；模型槽位由管理员配置、登录用户可自选。服务器位于美国。', en: 'Assistant turns, document reading and coherence review; model slots are set by administrators and users may choose their own. Servers in the United States.' } },
  { name: 'Alibaba DashScope (Qwen OCR fallback)', cat: 'ai', status: 'live',
    use: { zh: '扫描件无法读取时的 OCR 回退，端点在中国大陆；隐私页第 2 节如实披露。', en: 'OCR fallback for unreadable scans; endpoint in mainland China, disclosed in section 2 of the privacy page.' } },
  { name: 'Jina Reader / Search', cat: 'ai', status: 'live', href: 'https://jina.ai',
    use: { zh: '网页阅读与检索中转（Realtor.ca、CanLII 索引、雇主网页、TRREB 季报），服务器在德国 / 美国。', en: 'Web reading and search relay (Realtor.ca, the CanLII index, employer pages, the TRREB report); servers in Germany / United States.' } },
]

export default function PartnersPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [cat, setCat] = useState<Cat | 'all'>('all')
  const rows = cat === 'all' ? SOURCES : SOURCES.filter((s) => s.cat === cat)
  return (
    <div style={{ background: '#FFFFFF', color: '#171717' }}>
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-20 sm:px-7 lg:px-12 lg:py-24">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[.12em] text-brand">{zh ? 'DATA SOURCES · 我们的数据从哪来' : 'DATA SOURCES · Where our data comes from'}</div>
          <h1 className="mt-4 max-w-[820px] text-[clamp(30px,4vw,48px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            {zh ? <>每一条结论，<br />都能指回它的来源。</> : <>Every conclusion<br />points back to its source.</>}
          </h1>
          <p className="mt-5 max-w-[680px] text-[19px] leading-[1.6] text-body-2">
            {zh
              ? '这一页列出 Stayloop 的结果所依赖的每一个外部系统：用来做什么、今天的真实状态。没有签约合作伙伴的 logo 墙——我们没有，也不会编。'
              : 'Every external system a Stayloop result can rest on: what it is used for and its real status today. No wall of partner logos — we have none and will not invent them.'}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/screening" className="sl-btn-primary !px-6 !py-[13px] !text-[15px]">{zh ? '看筛查怎么用这些来源 →' : 'How screening uses these →'}</Link>
            <Link href="/privacy" className="sl-btn-secondary !px-6 !py-[13px] !text-[15px]">{zh ? '隐私页 · 数据去向' : 'Privacy · where data goes'}</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1100px] px-5 py-16 sm:px-7 lg:px-12 lg:py-20">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={zh ? '分类' : 'Category'}>
            {CATS.map((c) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={cat === c.key}
                onClick={() => setCat(c.key)}
                className={`rounded-full border px-4 py-1.5 text-[13.5px] font-semibold transition ${cat === c.key ? 'border-brand bg-brand text-white' : 'border-line-divider bg-white text-body-2 hover:border-brand'}`}
              >
                {c.label[lang]}
              </button>
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {rows.map((p) => (
              <div key={p.name} className="sl-card flex flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[17px] font-bold leading-snug tracking-tight">{p.name}</span>
                  <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[p.status].cls}`}>{STATUS[p.status].label[lang]}</span>
                </div>
                <p className="mt-3 text-[14.5px] leading-relaxed text-body-2">{p.use[lang]}</p>
                {p.note && <p className="mt-2 text-[12.5px] leading-relaxed text-body-3">{p.note[lang]}</p>}
                {p.href && (
                  <a href={p.href} target="_blank" rel="noopener noreferrer" className="mt-auto pt-3 text-[12.5px] font-semibold text-brand">
                    {p.href.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
                  </a>
                )}
              </div>
            ))}
          </div>
          <p className="mt-10 max-w-[760px] text-[13.5px] leading-relaxed text-body-3">
            {zh
              ? 'Trust API（把核验结论嵌入第三方流程）仍是设计中的接口，目前没有外部调用方；有需要请通过'
              : 'The Trust API (embedding verification conclusions in third-party flows) remains a designed interface with no external callers yet; reach us via '}
            <Link href="/contact" className="underline">{zh ? '联系页' : 'the contact page'}</Link>
            {zh ? '联系。' : '.'}
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
