'use client'

// /stayloop-api/docs — the Stayloop API in three tiers (V1.0 stage 1 · 丁 #19,
// 2026-10-15; formerly Trust API, plan §3.3). Tier 1 is callable by anyone,
// tier 2 needs the applicant's authorisation, tier 3 (/screen) is closed until
// Stayloop's Consumer Reporting Act registration is complete. Every endpoint
// on this page exists at www.stayloop.ai; no fake base URL, no SDK.
//
// Stage 5 (2026-10-16, design/open-api-contract-2026-10.md): tier 1 is seven
// endpoints + one MCP endpoint, rendered from the same objects the routes are
// built from — lib/api/openapi.ts (OPENAPI_ENDPOINTS: method, path, bilingual
// summary, curl example) and lib/mcp/tools.ts (MCP_TOOLS). Conventions (date
// version, error body, limits, as_of / boundary / attribution) read their
// numbers from lib/api/v1Limits.ts and lib/api/v1Http.ts; nothing here is a
// hand-typed limit. Tier 2 and tier 3 keep their stage-1 wording.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'
import { OPENAPI_ENDPOINTS } from '@/lib/api/openapi'
import { API_VERSION, RULES_AS_OF } from '@/lib/api/v1Http'
import { V1_LIMITS } from '@/lib/api/v1Limits'
import { MCP_TOOLS } from '@/lib/mcp/tools'

const BASE = 'https://www.stayloop.ai/api/v1'
const MCP_URL = 'https://www.stayloop.ai/api/mcp'

type Bi = { zh: string; en: string }
type EndpointDoc = { method: string; path: string; summary: Bi; exampleCurl: string }
type ToolDoc = { name: string; title?: string | Bi; description?: string | Bi }

const ENDPOINTS = OPENAPI_ENDPOINTS as ReadonlyArray<EndpointDoc>
const TOOLS = MCP_TOOLS as ReadonlyArray<ToolDoc>

/** A tool's title / description may be a plain string or a {zh,en} pair. */
function text(v: string | Bi | undefined, zh: boolean): string {
  if (!v) return ''
  const s = typeof v === 'string' ? v : zh ? v.zh : v.en
  return s.trim()
}

/** The tool descriptions carry the boundary sentence and sources for AI clients; the page shows the first sentence only. */
function firstSentence(s: string): string {
  const m = s.match(/^.*?[.。!?](\s|$)/)
  return (m ? m[0] : s).trim()
}

// Cloudflare's Email Address Obfuscation rewrites any address it finds in a
// text run of the served HTML into an <a class="__cf_email__"> + decoder
// script. When the address sat inside a longer React text node the hydrated
// DOM no longer matched and React threw #418 on every load (site test
// 2026-10-02, L6-public:D1 / L7-anon:D-07). Splitting the address across
// elements means no single text run ever contains it, so Cloudflare leaves
// it alone and server and client render the same nodes.
function ContactEmail() {
  return <span translate="no" className="whitespace-nowrap"><span>privacy</span><span>@</span><span>stayloop.ai</span></span>
}

function Code({ children }: { children: string }) {
  return <pre className="mt-3 overflow-x-auto rounded-xl border border-line-divider bg-[#0f1b33] p-4 font-mono text-[12.5px] leading-relaxed text-[#D6E2EE]"><code>{children}</code></pre>
}

function TierTag({ tone, children }: { tone: 'open' | 'consent' | 'closed'; children: string }) {
  const cls = tone === 'open'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : tone === 'consent'
      ? 'border-sky-200 bg-sky-50 text-sky-800'
      : 'border-amber-300 bg-amber-50 text-amber-900'
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 align-middle text-[11.5px] font-semibold ${cls}`}>{children}</span>
}

function MethodTag({ method }: { method: string }) {
  const m = method.toUpperCase()
  const cls = m === 'GET' ? 'bg-emerald-100 text-emerald-900' : 'bg-sky-100 text-sky-900'
  return <span className={`inline-block rounded-md px-2 py-0.5 font-mono text-[11.5px] font-bold ${cls}`}>{m}</span>
}

export default function TrustApiDocsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const perKey = V1_LIMITS.perKeyPerHour
  const perEndpoint = V1_LIMITS.perEndpointPerHour
  const mcpPerIp = V1_LIMITS.mcpPerIpPerHour
  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto max-w-[960px] px-5 py-14 sm:px-7 lg:py-18">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[.12em] text-brand">{zh ? 'STAYLOOP API · 安省租房核验 API' : 'STAYLOOP API · Ontario rental verification'}</div>
          <h1 className="mt-4 text-[clamp(28px,3.4vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">{zh ? '三档端点：可直接调用、需申请人授权、暂不开放。' : 'Three tiers: open, applicant-authorised, not yet open.'}</h1>
          <p className="mt-4 max-w-[680px] text-[16px] leading-[1.6] text-body-2">
            {zh
              ? '规则、合规检查、日期算术、租金基准任何人都能调，还有一个给 AI 客户端的 MCP 端点；核验结论由申请人本人授权后才返回，只回结论不回文件；合作方发起筛查要等 Stayloop 完成《消费者报告法》注册后才开放。每次调用留痕，法规边界写在响应里。Base URL 与本站同源；没有 SDK，用任何 HTTP 客户端即可。'
              : 'Rules, compliance checks, date arithmetic and rent benchmarks are open to anyone, plus an MCP endpoint for AI clients; verification conclusions are returned only with the applicant’s authorisation, conclusions only, never documents; partner-initiated screening opens once Stayloop’s Consumer Reporting Act registration is complete. Every call is audited and the legal boundary is stated in the response. Same origin as this site; no SDK — any HTTP client works.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[12.5px]">
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">Base <code className="font-mono">{BASE}</code></span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">MCP <code className="font-mono">{MCP_URL}</code></span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1"><code className="font-mono">x-api-version</code> <code className="font-mono">{API_VERSION}</code></span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '密钥：' : 'Key: '}<code className="font-mono">X-API-Key</code>{zh ? '（第一档与 MCP 不需要）' : ' (not needed for tier 1 or MCP)'}</span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '数据库驻加拿大' : 'Database in Canada'}</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-10 sm:px-7">
        <h2 className="text-[20px] font-semibold">{zh ? '三档一览' : 'The three tiers'}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line-divider bg-white p-4">
            <TierTag tone="open">{zh ? '第一档 · 可直接调用' : 'Tier 1 · open'}</TierTag>
            <div className="mt-2 font-mono text-[12.5px] font-bold text-brand">{zh ? `${ENDPOINTS.length} 个端点 + MCP` : `${ENDPOINTS.length} endpoints + MCP`}</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">{zh ? '规则清单、房源合规检查（POST /listings/compliance）、租约条款检查、租金指导比例、N4 最早终止日、持续迟付判定、租金基准，以及同一套工具的 MCP 端点。免费，无需密钥，不接受、不存储个人信息。' : 'The rules list, listing compliance (POST /listings/compliance), lease-terms check, rent-increase guideline, N4 earliest termination, persistent late payment, rent benchmarks, and the same tools over MCP. Free, no key; no personal data accepted or stored.'}</p>
          </div>
          <div className="rounded-2xl border border-line-divider bg-white p-4">
            <TierTag tone="consent">{zh ? '第二档 · 需申请人授权' : 'Tier 2 · applicant authorisation'}</TierTag>
            <div className="mt-2 font-mono text-[12.5px] font-bold text-brand">POST /passport/verify</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">{zh ? '申请人签发 token、勾选范围后才返回结论。合作方密钥 + 申请人 token。' : 'Conclusions only after the applicant issues a token and ticks scopes. Partner key + applicant token.'}</p>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-amber-50/40 p-4">
            <TierTag tone="closed">{zh ? '第三档 · 暂不开放' : 'Tier 3 · not yet open'}</TierTag>
            <div className="mt-2 font-mono text-[12.5px] font-bold text-brand">POST /screen</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">{zh ? '完成《消费者报告法》注册后开放。现在一律返回 503，不接受调用。' : 'Opens once the Consumer Reporting Act registration is complete. Returns 503 for now; calls are not accepted.'}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-6 sm:px-7">
        <h2 className="text-[20px] font-semibold">{zh ? '边界（先读这段）' : 'Boundary (read this first)'}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-body-2">
          <li>{zh ? '第一档与 MCP 只做确定性规则与日期算术，不是法律意见；不选表、不建议是否发出任何通知；不接受也不存储个人信息。' : 'Tier 1 and MCP do deterministic rules and date arithmetic only, not legal advice; they do not pick forms or advise whether to serve any notice; they accept and store no personal information.'}</li>
          <li>{zh ? '核验结论只在申请人签发的 token 有效期内、按申请人勾选的范围返回。同意的法律基础是 PIPEDA 原则 4.3（本人知情同意）；披露按《消费者报告法》对报告机构的标准处理——只在申请人本人书面指示下、按其勾选的范围披露，申请人可随时撤销。' : 'Conclusions are returned only within an applicant-issued token’s validity and only for the scopes the applicant ticked. The legal basis is the applicant’s consent (PIPEDA Principle 4.3); the disclosure is handled to the standard the Consumer Reporting Act sets for reporting agencies — only on the applicant’s own written instructions, only for the ticked scopes, revocable at any time.'}</li>
          <li>{zh ? '筛查分数与档位是房东自行决定的参考信息，不是拒绝依据（OHRC 租房政策）；不得设收入比截止线。' : 'Screening score and tier are information for the landlord’s own decision, never grounds to decline (OHRC housing policy); no income-ratio cut-offs.'}</li>
          <li>{zh ? '合作方发起筛查（第三档）在 Stayloop 完成《消费者报告法》注册前暂不开放；开放后也只对房东身份的接入方，且必须附申请人的同意记录，录取与否由房东本人决定。' : 'Partner-initiated screening (tier 3) is closed until Stayloop’s Consumer Reporting Act registration is complete; once open it is limited to landlord-bound keys, requires the applicant’s consent record, and the decision stays with the landlord.'}</li>
          <li>{zh ? '面向金融机构的用途尚未开放，待法律意见。' : 'Use by financial institutions is not yet open, pending legal advice.'}</li>
          <li>{zh ? <>第二档密钥由 Stayloop 发放（联系 <ContactEmail />），只存哈希、可随时停用。第一档与 MCP 的限流见下面的「通用约定」。</> : <>Tier 2 keys are issued by Stayloop (<ContactEmail />), stored hashed, and can be disabled at any time. Tier 1 and MCP limits are under “Conventions” below.</>}</li>
          <li>{zh ? '使用规则在服务条款第 7 节：只能用于你自己的产品，不得转售、不得训练模型，租金基准必须展示来源句。' : 'Usage rules are in the Terms of Service §7: your own product only, no resale, no model training, benchmarks must show the attribution.'} <Link href="/terms" className="underline">/terms</Link></li>
        </ul>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-6 sm:px-7" id="tier-1">
        <h2 className="text-[20px] font-semibold"><TierTag tone="open">{zh ? '第一档 · 可直接调用' : 'Tier 1 · open'}</TierTag> {zh ? '通用约定' : 'Conventions'}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-body-2" data-testid="tier1-conventions">
          <li>{zh ? '无需密钥、无需注册。跨域开放（CORS *）。' : 'No key, no registration. Open cross-origin (CORS *).'}</li>
          <li>{zh ? '版本按日期：每个响应带 ' : 'Date versions: every response carries '}<code className="font-mono">x-api-version: {API_VERSION}</code>{zh ? '；弃用提前 90 天通知。' : '; deprecations are announced 90 days ahead.'}</li>
          <li>{zh ? '错误体统一 ' : 'One error body: '}<code className="font-mono">{'{ error, message, retry_after? }'}</code>{zh ? '；错误码 invalid_json · invalid_input（message 写明哪个字段）· unsupported_province · not_available · rate_limited · method_not_allowed；429 带 Retry-After 头。' : '; codes invalid_json · invalid_input (message names the field) · unsupported_province · not_available · rate_limited · method_not_allowed; 429 carries Retry-After.'}</li>
          <li>{zh ? `限流：按请求头 X-Client-Id（可选，自报，≤${V1_LIMITS.clientIdMaxLen} 字符）或 IP，每小时 ${perKey} 次；每个端点全站每小时 ${perEndpoint} 次。响应头 X-RateLimit-Limit。` : `Limits: per X-Client-Id header (optional, self-declared, ≤${V1_LIMITS.clientIdMaxLen} chars) or IP, ${perKey} requests an hour; ${perEndpoint} an hour per endpoint site-wide. Header X-RateLimit-Limit.`}</li>
          <li>{zh ? '每个响应体都带 ' : 'Every response body carries '}<code className="font-mono">as_of</code>{zh ? `（规则快照日，现为 ${RULES_AS_OF}）和 ` : ` (the rules snapshot, currently ${RULES_AS_OF}) and `}<code className="font-mono">boundary</code>{zh ? '（固定的边界句）。' : ' (the fixed boundary sentence).'}</li>
          <li>{zh ? '租金基准响应带必填的 ' : 'Rent-benchmark responses carry a mandatory '}<code className="font-mono">attribution</code>{zh ? '（CMHC 租赁市场调查 + 加拿大统计局，开放授权），展示时必须原样保留。' : ' (CMHC Rental Market Survey + Statistics Canada, open licences) that must be shown as-is.'}</li>
          <li>{zh ? '省份参数 ' : 'Province parameter '}<code className="font-mono">province</code>{zh ? '：ON（默认）或其他 12 个省 / 地区代码；其余返回 400 unsupported_province。' : ': ON (default) or the other 12 provincial / territorial codes; anything else is 400 unsupported_province.'}</li>
          <li>{zh ? 'OpenAPI 3.1 文档可下载：' : 'OpenAPI 3.1 document: '}<a href={`${BASE}/openapi.json`} className="font-mono underline">GET /api/v1/openapi.json</a></li>
        </ul>

        <h3 className="mt-8 text-[17px] font-semibold">{zh ? `端点（${ENDPOINTS.length} 个）` : `Endpoints (${ENDPOINTS.length})`}</h3>
        <div className="mt-3 space-y-6" data-testid="tier1-endpoints">
          {ENDPOINTS.map((e) => (
            <div key={`${e.method} ${e.path}`} className="rounded-2xl border border-line-divider bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <MethodTag method={e.method} />
                <code className="font-mono text-[13px] font-bold text-brand">{e.path}</code>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-body-2">{zh ? e.summary.zh : e.summary.en}</p>
              <Code>{e.exampleCurl}</Code>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13.5px] text-body-3">{zh ? '规则全文与编号见 ' : 'Rules and their ids: '}<Link href="/rules" className="underline">/rules</Link>{zh ? '；只做规则比对与日期算术，不是法律意见。' : '; rule matching and date arithmetic only, not legal advice.'}</p>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-6 sm:px-7" id="mcp">
        <h2 className="text-[20px] font-semibold"><TierTag tone="open">{zh ? '第一档 · 可直接调用' : 'Tier 1 · open'}</TierTag> {zh ? 'MCP 端点' : 'MCP endpoint'}</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-body-2">
          <code className="font-mono text-brand">{MCP_URL}</code>{zh ? ' · Streamable HTTP（JSON-RPC 2.0，无状态，只 JSON 响应）· 无鉴权 · ' : ' · Streamable HTTP (JSON-RPC 2.0, stateless, JSON responses only) · no auth · '}{zh ? `每 IP 每小时 ${mcpPerIp} 次。` : `${mcpPerIp} requests per IP an hour.`}
          {zh ? ' 工具与上面的端点调同一套函数，响应同样带 as_of、boundary 与 attribution。' : ' The tools call the same functions as the endpoints above; results carry the same as_of, boundary and attribution.'}
        </p>
        <h3 className="mt-5 text-[15px] font-semibold">{zh ? `工具（${TOOLS.length} 个）` : `Tools (${TOOLS.length})`}</h3>
        <ul className="mt-2 divide-y divide-line-divider rounded-2xl border border-line-divider bg-white" data-testid="mcp-tools">
          {TOOLS.map((t) => (
            <li key={t.name} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <code className="font-mono text-[13px] font-bold text-brand">{t.name}</code>
                {text(t.title, zh) && <span className="text-[13.5px] font-semibold">{text(t.title, zh)}</span>}
              </div>
              {text(t.description, zh) && <p className="mt-1 text-[13px] leading-relaxed text-body-2">{firstSentence(text(t.description, zh))}</p>}
            </li>
          ))}
        </ul>

        <h3 className="mt-6 text-[15px] font-semibold">{zh ? '接法' : 'Connecting'}</h3>
        <ol className="mt-2 list-decimal space-y-3 pl-5 text-[14px] leading-relaxed text-body-2" data-testid="mcp-howto">
          <li>
            <span className="font-semibold text-body">Claude</span>{zh ? '（claude.ai）：设置 → 连接器 → 添加自定义连接器，端点填 ' : ' (claude.ai): Settings → Connectors → Add custom connector, endpoint '}<code className="font-mono">{MCP_URL}</code>{zh ? '，鉴权选 None。' : ', authentication None.'}
          </li>
          <li>
            <span className="font-semibold text-body">Claude Code</span>
            <Code>{'claude mcp add --transport http stayloop https://www.stayloop.ai/api/mcp'}</Code>
          </li>
          <li>
            <span className="font-semibold text-body">Cursor</span>{zh ? '：在 ' : ': in '}<code className="font-mono">mcp.json</code>{zh ? ' 里加一条：' : ' add:'}
            <Code>{`{
  "mcpServers": {
    "stayloop": { "url": "https://www.stayloop.ai/api/mcp" }
  }
}`}</Code>
          </li>
        </ol>
        <h3 className="mt-6 text-[15px] font-semibold">{zh ? '用 curl 试一下（initialize）' : 'Try it with curl (initialize)'}</h3>
        <Code>{`curl -X POST ${MCP_URL} \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2025-06-18","capabilities":{},
                 "clientInfo":{"name":"curl","version":"0"}}}'

{ "jsonrpc": "2.0", "id": 1,
  "result": { "protocolVersion": "2025-06-18", "capabilities": { "tools": {} },
              "serverInfo": { "name": "stayloop", "version": "${API_VERSION}" },
              "instructions": "…boundary…" } }

// then: {"jsonrpc":"2.0","id":2,"method":"tools/list"}
//       {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"rent_increase_guideline","arguments":{"effective":"2027-01-01"}}}`}</Code>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-6 sm:px-7">
        <h2 className="text-[20px] font-semibold"><TierTag tone="consent">{zh ? '第二档 · 需申请人授权' : 'Tier 2 · applicant authorisation'}</TierTag> <code className="font-mono text-brand">POST /passport/verify</code> · {zh ? '申请人出示的核验结论' : 'Applicant-presented verification'}</h2>
        <p className="mt-2 text-[14.5px] text-body-2">{zh ? '申请人在 Stayloop 的租客护照页生成分享链接，并勾选允许 API 读取的范围（身份 / 银行 / 征信 / 租史）。链接末尾的 token 就是你要传的值。响应只有结论；每次调用写审计并推送通知申请人。' : 'The applicant generates a share link on their Stayloop passport page and ticks the scopes the API may read (identity / bank / credit / tenancy). The token at the end of that link is what you send. The response holds conclusions only; every call is audited and the applicant is notified.'}</p>
        <p className="mt-2 text-[14.5px] text-body-2">{zh ? '同意基础：申请人勾选范围即 PIPEDA 原则 4.3 的知情同意，勾选页写明每个范围的用途、接收方类别与风险（接入方及其 AI 服务商可能在境外、可能留存会话、已送出的内容无法撤回），拒绝不影响申请人在站内的任何功能。披露按《消费者报告法》对报告机构的标准处理：只在本人书面指示下、按勾选范围披露。' : 'Consent basis: ticking scopes is the applicant’s informed consent under PIPEDA Principle 4.3; the consent page states each scope’s purpose, the categories of recipient and the risks (the recipient and its AI providers may be outside Canada, may retain the session, and content already sent cannot be recalled), and declining does not affect anything the applicant does on Stayloop. The disclosure is handled to the standard the Consumer Reporting Act sets for reporting agencies: only on the applicant’s own written instructions, only for the ticked scopes.'}</p>
        <Code>{`curl -X POST ${BASE}/passport/verify \\
  -H "X-API-Key: sk_trust_..." -H "Content-Type: application/json" \\
  -d '{"token": "<from the applicant's share link>", "scopes": ["identity","bank","tenancy"]}'

{ "verified": true, "scopes": ["identity","bank","tenancy"],
  "identity": { "verified": true, "provider": "veriff", "verified_at": "2026-09-20T14:02:11Z" },
  "bank":     { "verified": true, "provider": "flinks", "payroll_monthly_estimate": 5480, "nsf_count_90d": 0 },
  "tenancy":  { "confirmed_tenancies": 1, "rent_records": { "paid": 11, "late": 0 } },
  "issued_by": "applicant", "boundary": { "zh": "...", "en": "..." }, "audited": true }

// 403 when the applicant has not enabled API reads, or none of the requested scopes are shared
// 404 when the token is unknown, expired or revoked`}</Code>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-6 sm:px-7">
        <h2 className="text-[20px] font-semibold"><TierTag tone="closed">{zh ? '第三档 · 暂不开放' : 'Tier 3 · not yet open'}</TierTag> <code className="font-mono text-brand">POST /screen</code> · {zh ? '发起一次筛查' : 'Start a screening'}</h2>
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] leading-relaxed text-amber-900">
          {zh
            ? '暂不接受调用（503）。向合作方提供关于申请人的筛查报告，正是《消费者报告法》要求注册才能做的事；这个端点在 Stayloop 完成注册后开放。下面的请求 / 响应示例是开放后的形态，供接入方提前准备。'
            : 'Calls are not accepted (503). Furnishing a screening report about an applicant to a partner is exactly what the Consumer Reporting Act requires registration for; this endpoint opens once Stayloop’s registration is complete. The request / response below is the shape it will have, so integrators can prepare.'}
        </div>
        <Code>{`// today — every call, with or without a key
503 { "error": "partner_screening_closed",
      "message": "Partner screening is closed until Stayloop’s Consumer Reporting Act registration is complete." }`}</Code>
        <p className="mt-4 text-[14.5px] text-body-2">{zh ? '开放后的规则：密钥须绑定一个 Stayloop 房东账号（筛查记在该账号名下、计入其配额）。必须附申请人对 Stayloop 筛查同意文本的接受记录；文件从你的 https 地址抓取（每个 ≤25 MB，最多 14 个）。返回 202 与 screening_id，完成后 POST 到你的 webhook。与产品同一条管线、同样的配额与合规规则；录取与否由房东本人决定。' : 'Rules once open: the key must be bound to a Stayloop landlord account (the screening runs under it and counts toward its quota). The applicant’s acceptance of Stayloop’s screening consent text is mandatory; files are fetched from your https URLs (≤25 MB each, up to 14). Returns 202 with a screening_id and POSTs the result to your webhook. Same pipeline, quotas and compliance rules as the product; the decision stays with the landlord.'}</p>
        <Code>{`// shape once open — not accepted today
curl -X POST ${BASE}/screen \\
  -H "X-API-Key: sk_trust_..." -H "Content-Type: application/json" \\
  -d '{
    "applicant_name": "Jane Doe", "monthly_rent": 2450, "external_ref": "APP-1042",
    "consent": { "version": "v1-2026-09", "accepted_at": "2026-09-23T10:00:00Z", "typed_name": "Jane Doe" },
    "files": [ { "url": "https://files.example.com/paystub-1.pdf", "kind": "pay_stub" },
               { "url": "https://files.example.com/id.jpg", "kind": "government_id" } ],
    "webhook_url": "https://api.example.com/stayloop/webhook"
  }'

202 { "ok": true, "screening_id": "…", "status": "queued", "files": 2, "webhook": true,
      "report_url": "https://www.stayloop.ai/screening/<id>/report" }

// webhook (X-Stayloop-Event: screening.completed)
{ "screening_id": "…", "external_ref": "APP-1042", "status": "scored", "overall": 74, "tier": "review",
  "hard_gates": [], "report_url": "…/report", "notice_letter_url": "…/notice",
  "boundary": "Score and tier are information for the landlord's own decision — never grounds to decline (OHRC)." }`}</Code>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-6 sm:px-7">
        <h2 className="text-[20px] font-semibold">{zh ? '给 AI 客户端的说明' : 'Notes for AI clients'}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-body-2">
          <li>{zh ? '允许：由用户发起的实时访问——用户自己的 AI 助理在对话中替 TA 实时调用这些端点，把结果展示给这位用户。' : 'Allowed: real-time access initiated by a user — a person’s own AI Agent calling these endpoints on their behalf during a conversation and showing the result to that person.'}</li>
          <li>{zh ? '不允许：留存响应、为响应建索引、把响应用于训练模型，或把它作为数据集转售。第二档响应含个人信息，只能在该用户的会话内使用，不得持久化、不得与其他来源合并画像。' : 'Not allowed: retaining responses, indexing them, using them to train models, or reselling them as a dataset. Tier 2 responses contain personal information and may be used only within that user’s session — never persisted, never merged with other sources into a profile.'}</li>
          <li>{zh ? '展示时保留响应里的边界句与来源说明；规则检查不是法律意见，核验结论不等于「已筛查」。' : 'Keep the boundary and attribution text from the response when displaying it; rule checks are not legal advice, and a verification conclusion is not a screening.'}</li>
          <li>{zh ? '以上工具与端点只做确定性规则与日期算术，不是法律意见。' : 'The tools and endpoints above do deterministic rules and date arithmetic only; they are not legal advice.'}</li>
          <li>{zh ? '远程 MCP 端点见上面「MCP 端点」一节；Claude、Claude Code、Cursor 都可直接接入。' : 'The remote MCP endpoint is described under “MCP endpoint” above; Claude, Claude Code and Cursor connect to it directly.'}</li>
        </ul>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-10 sm:px-7">
        <h2 className="text-[20px] font-semibold">{zh ? '错误' : 'Errors'}</h2>
        <table className="mt-3 w-full text-[13.5px]">
          <tbody>
            {[['400', zh ? 'invalid_json / invalid_input / unsupported_province（第一档；message 写明哪个字段）' : 'invalid_json / invalid_input / unsupported_province (tier 1; message names the field)'], ['401', zh ? '缺少 X-API-Key（第二档）' : 'X-API-Key missing (tier 2)'], ['403', zh ? '密钥无效 / 停用；或申请人未开放该范围' : 'Key invalid / disabled; or the applicant has not shared that scope'], ['404', zh ? 'token 不存在、过期或已撤销；或 not_available（该省没有这项数据）' : 'Token unknown, expired or revoked; or not_available (no data for that province)'], ['405', zh ? 'method_not_allowed' : 'method_not_allowed'], ['422', zh ? '缺少同意记录或文件不可抓取' : 'Consent missing or files unfetchable'], ['429', zh ? 'rate_limited：超过限流（看 Retry-After）' : 'rate_limited: rate limit (see Retry-After)'], ['503', zh ? 'partner_screening_closed：第三档暂不开放' : 'partner_screening_closed: tier 3 is not yet open']].map(([c, t]) => (
              <tr key={c} className="border-t border-line-divider"><td className="w-16 py-2 font-mono font-bold">{c}</td><td className="py-2 text-body-2">{t}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-8 text-[13px] text-body-3">{zh ? <>第二档密钥或试点：<ContactEmail />。数据来源目录见 </> : <>Tier 2 keys and pilots: <ContactEmail />. Data sources: </>}<Link href="/partners" className="underline">/partners</Link>{zh ? '；使用规则见 ' : '; usage rules: '}<Link href="/terms" className="underline">/terms</Link>.</p>
      </section>
      <Footer />
    </div>
  )
}
