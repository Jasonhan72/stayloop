'use client'

// /trust-api/docs — the three endpoints that exist (Trust API plan §3.3,
// 2026-09-23). Everything on this page is callable at www.stayloop.ai; the
// old four-endpoint design preview with its fake base URL is gone.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'

const BASE = 'https://www.stayloop.ai/api/v1'

function Code({ children }: { children: string }) {
  return <pre className="mt-3 overflow-x-auto rounded-xl border border-line-divider bg-[#0f1b33] p-4 font-mono text-[12.5px] leading-relaxed text-[#D6E2EE]"><code>{children}</code></pre>
}

export default function TrustApiDocsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />
      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto max-w-[960px] px-5 py-14 sm:px-7 lg:py-18">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[.12em] text-brand">{zh ? 'VERIFICATION API · 安省租房核验 API' : 'VERIFICATION API · Ontario rental verification'}</div>
          <h1 className="mt-4 text-[clamp(28px,3.4vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em]">{zh ? '三个端点，每个都有真实后端。' : 'Three endpoints, each with a real backend.'}</h1>
          <p className="mt-4 max-w-[680px] text-[16px] leading-[1.6] text-body-2">
            {zh
              ? '申请人主动出示、只返回结论不返回文件、每次调用留痕、法规边界写在响应里。Base URL 与本站同源；没有 SDK，用任何 HTTP 客户端即可。'
              : 'Applicant-presented, conclusions only (never documents), every call audited, the legal boundary stated in the response. Same origin as this site; no SDK — any HTTP client works.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[12.5px]">
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">Base <code className="font-mono">{BASE}</code></span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '密钥：' : 'Key: '}<code className="font-mono">X-API-Key</code>{zh ? '（compliance 端点不需要）' : ' (not needed for compliance)'}</span>
            <span className="rounded-full border border-line-divider bg-white px-3 py-1">{zh ? '数据库驻加拿大' : 'Database in Canada'}</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-10 sm:px-7">
        <h2 className="text-[20px] font-semibold">{zh ? '边界（先读这段）' : 'Boundary (read this first)'}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-body-2">
          <li>{zh ? 'Stayloop 不是《消费者报告法》意义上的报告机构。核验结论只在申请人签发的 token 有效期内、按申请人勾选的范围返回。' : 'Stayloop is not a consumer reporting agency under the Consumer Reporting Act. Conclusions are returned only within an applicant-issued token’s validity and only for the scopes the applicant ticked.'}</li>
          <li>{zh ? '筛查分数与档位是房东自行决定的参考信息，不是拒绝依据（OHRC 租房政策）；不得设收入比截止线。' : 'Screening score and tier are information for the landlord’s own decision, never grounds to decline (OHRC housing policy); no income-ratio cut-offs.'}</li>
          <li>{zh ? '面向金融机构的用途尚未开放，待法律意见。' : 'Use by financial institutions is not yet open, pending legal advice.'}</li>
          <li>{zh ? '密钥由 Stayloop 发放（联系 privacy@stayloop.ai），限流：verify 120/分钟，screen 20/分钟，compliance 每 IP 120/小时。' : 'Keys are issued by Stayloop (privacy@stayloop.ai). Limits: verify 120/min, screen 20/min, compliance 120/h per IP.'}</li>
        </ul>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-6 sm:px-7">
        <h2 className="text-[20px] font-semibold"><code className="font-mono text-brand">POST /listings/compliance</code> · {zh ? '房源合规检查（免费，无需密钥）' : 'Listing compliance (free, no key)'}</h2>
        <p className="mt-2 text-[14.5px] text-body-2">{zh ? '确定性规则：押金 ≤ 一个月（RTA s.106）、钥匙押金（O. Reg. 516/06 s.17）、禁宠条款无效（s.14）、申请费 / 宠物押金 / 清洁押金禁止（s.134）。不接受、不存储任何个人信息。规则见 ' : 'Deterministic rules: deposit ≤ one month (RTA s.106), key deposit (O. Reg. 516/06 s.17), void pet bans (s.14), no application / pet / cleaning fees (s.134). No personal data is accepted or stored. Rules: '}<Link href="/rules" className="underline">/rules</Link>.</p>
        <Code>{`curl -X POST ${BASE}/listings/compliance \\
  -H "Content-Type: application/json" \\
  -d '{"monthly_rent": 2450, "deposit": 4900, "pets_allowed": "no",
       "description": "Bright 1+1, no pets, $50 application fee"}'

{ "passed": false,
  "findings": [
    { "rule": "RTA-106-deposit-cap", "statute": "RTA s.106(2)", "severity": "block",
      "message": { "zh": "押金 $4,900 超过一个月租金 $2,450。", "en": "Deposit $4,900 exceeds one month's rent $2,450." },
      "url": "https://www.stayloop.ai/rules#RTA-106-deposit-cap" },
    { "rule": "RTA-14-no-pet-clause", ... }, { "rule": "RTA-134-no-fees", ... } ],
  "checked": ["RTA-106-deposit-cap", "OREG516-17-key-deposit", "RTA-14-no-pet-clause", "RTA-134-no-fees"] }`}</Code>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-6 sm:px-7">
        <h2 className="text-[20px] font-semibold"><code className="font-mono text-brand">POST /passport/verify</code> · {zh ? '申请人出示的核验结论' : 'Applicant-presented verification'}</h2>
        <p className="mt-2 text-[14.5px] text-body-2">{zh ? '申请人在 Stayloop 的租客护照页生成分享链接，并勾选允许 API 读取的范围（身份 / 银行 / 征信 / 租史）。链接末尾的 token 就是你要传的值。响应只有结论；每次调用写审计并推送通知申请人。' : 'The applicant generates a share link on their Stayloop passport page and ticks the scopes the API may read (identity / bank / credit / tenancy). The token at the end of that link is what you send. The response holds conclusions only; every call is audited and the applicant is notified.'}</p>
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
        <h2 className="text-[20px] font-semibold"><code className="font-mono text-brand">POST /screen</code> · {zh ? '发起一次筛查（同一条管线）' : 'Start a screening (same pipeline)'}</h2>
        <p className="mt-2 text-[14.5px] text-body-2">{zh ? '密钥须绑定一个 Stayloop 房东账号（筛查记在该账号名下、计入其配额）。必须附申请人对 Stayloop 筛查同意文本的接受记录；文件从你的 https 地址抓取（每个 ≤25 MB，最多 14 个）。立即返回 202 与 screening_id，完成后 POST 到你的 webhook。' : 'The key must be bound to a Stayloop landlord account (the screening runs under it and counts toward its quota). The applicant’s acceptance of Stayloop’s screening consent text is mandatory; files are fetched from your https URLs (≤25 MB each, up to 14). Returns 202 with a screening_id immediately and POSTs the result to your webhook when done.'}</p>
        <Code>{`curl -X POST ${BASE}/screen \\
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
  "boundary": "Score and tier are information for the landlord's own decision — never grounds to decline (OHRC). Not a consumer report." }`}</Code>
      </section>

      <section className="mx-auto max-w-[960px] px-5 py-10 sm:px-7">
        <h2 className="text-[20px] font-semibold">{zh ? '错误' : 'Errors'}</h2>
        <table className="mt-3 w-full text-[13.5px]">
          <tbody>
            {[['401', zh ? '缺少 X-API-Key' : 'X-API-Key missing'], ['403', zh ? '密钥无效 / 停用；或申请人未开放该范围' : 'Key invalid / disabled; or the applicant has not shared that scope'], ['404', zh ? 'token 不存在、过期或已撤销' : 'Token unknown, expired or revoked'], ['422', zh ? '缺少同意记录或文件不可抓取' : 'Consent missing or files unfetchable'], ['429', zh ? '超过限流（看 Retry-After）' : 'Rate limit (see Retry-After)']].map(([c, t]) => (
              <tr key={c} className="border-t border-line-divider"><td className="w-16 py-2 font-mono font-bold">{c}</td><td className="py-2 text-body-2">{t}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-8 text-[13px] text-body-3">{zh ? '申请密钥或试点：privacy@stayloop.ai。数据来源目录见 ' : 'Keys and pilots: privacy@stayloop.ai. Data sources: '}<Link href="/partners" className="underline">/partners</Link>.</p>
      </section>
      <Footer />
    </div>
  )
}
