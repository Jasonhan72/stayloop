'use client'
// -----------------------------------------------------------------------------
// /legal/privacy — Privacy notice (PIPEDA-aligned)
// -----------------------------------------------------------------------------
// Plain-language summary of what Stayloop collects, why it's collected, who
// it gets shared with, and how to exercise rights under Canada's Personal
// Information Protection and Electronic Documents Act (PIPEDA). This is not
// legal advice; the surface keeps the framing transparent rather than
// definitive.
// -----------------------------------------------------------------------------

import LegalPage from '@/components/marketing/LegalPage'

export default function PrivacyPage() {
  return (
    <LegalPage
      title_en="Privacy notice"
      title_zh="隐私声明"
      lede_en="How Stayloop handles personal information under Canada's PIPEDA framework. Plain language; not a substitute for legal advice."
      lede_zh="Stayloop 在加拿大《个人信息保护与电子文件法》（PIPEDA）框架下如何处理个人信息。直白语言，仅供信息参考，不构成法律意见。"
      updated_en="Last updated May 5, 2026"
      updated_zh="最近更新 2026 年 5 月 5 日"
      bodyEn={<>
        <h2>What we collect</h2>
        <p>
          When you use Stayloop, we collect:
        </p>
        <ul>
          <li><strong>Account details</strong> — name, email, role (tenant / landlord / agent).</li>
          <li><strong>Tenancy documents</strong> you upload — IDs, paystubs, employment letters, credit reports, references.</li>
          <li><strong>Workflow records</strong> — applications, screenings, decisions, lease drafts, audit events.</li>
          <li><strong>Service telemetry</strong> — basic logs needed to keep the service running (request IDs, error traces, IP for fraud prevention).</li>
        </ul>

        <h2>Why we collect it</h2>
        <p>
          Stayloop is a workflow tool for Ontario rentals. We use the data above to:
        </p>
        <ul>
          <li>Run the screening and application workflow you initiated.</li>
          <li>Show you AI-assisted analysis of documents you uploaded.</li>
          <li>Search public records (CanLII, Ontario Courts Portal) for names you submitted.</li>
          <li>Bill you for the plan you selected (via Stripe).</li>
          <li>Comply with applicable laws and respond to lawful requests.</li>
        </ul>

        <h2>What we do NOT do</h2>
        <ul>
          <li>We do not sell personal information.</li>
          <li>We do not use your tenancy documents to train third-party AI models.</li>
          <li>We do not show advertising on Stayloop.</li>
        </ul>

        <h2>Where data lives</h2>
        <p>
          Stayloop runs on Cloudflare and Supabase (Postgres). Your account data and uploaded files
          live in Canadian or US regions, depending on the provider. Stripe processes payments under
          its own security program. AI inference uses Anthropic's API; your prompts are processed under
          Anthropic's enterprise data terms and are not retained for model training.
        </p>

        <h2>Your rights under PIPEDA</h2>
        <p>
          You can:
        </p>
        <ul>
          <li>Ask what personal information we hold about you.</li>
          <li>Request correction of inaccurate information.</li>
          <li>Request deletion of your account and uploaded files (some records must be retained for tax / audit).</li>
          <li>Withdraw consent for any optional processing.</li>
          <li>File a complaint with the Office of the Privacy Commissioner of Canada.</li>
        </ul>
        <p>
          To exercise any of the above, email{' '}
          <a href="mailto:privacy@stayloop.ai">privacy@stayloop.ai</a>. We respond within 30 days.
        </p>

        <h2>Security</h2>
        <p>
          We rely on encryption-in-transit (HTTPS), encryption-at-rest on the storage layer, and
          row-level security in Postgres. See the{' '}
          <a href="/legal/security">Security overview</a> for the full picture.
        </p>

        <h2>Contact</h2>
        <p>
          Privacy questions: <a href="mailto:privacy@stayloop.ai">privacy@stayloop.ai</a><br />
          General contact: <a href="mailto:hello@stayloop.ai">hello@stayloop.ai</a>
        </p>
      </>}
      bodyZh={<>
        <h2>我们收集什么</h2>
        <p>
          你在使用 Stayloop 的过程中，我们会收集：
        </p>
        <ul>
          <li><strong>账户信息</strong> — 姓名、邮箱、角色（租客 / 房东 / 经纪）。</li>
          <li><strong>租赁文件</strong> — 你上传的身份证件、工资单、雇佣信、信用报告、推荐人。</li>
          <li><strong>工作流记录</strong> — 申请、筛查、决策、租约草稿、操作留痕。</li>
          <li><strong>服务运行日志</strong> — 维持服务运转所需（请求 ID、错误堆栈、IP 用于风控）。</li>
        </ul>

        <h2>为什么收集</h2>
        <p>
          Stayloop 是面向安省租赁场景的工作流工具。上面这些数据用于：
        </p>
        <ul>
          <li>运行你发起的筛查 / 申请 / 签约流程。</li>
          <li>对你上传的文件提供 AI 辅助分析。</li>
          <li>用你提交的姓名查询公开记录（CanLII、Ontario Courts Portal）。</li>
          <li>按你选择的套餐进行计费（通过 Stripe）。</li>
          <li>遵守适用法律及合法的执法请求。</li>
        </ul>

        <h2>我们不做这些</h2>
        <ul>
          <li>不出售个人信息。</li>
          <li>不会用你的租赁文件去训练第三方 AI 模型。</li>
          <li>Stayloop 上不放广告。</li>
        </ul>

        <h2>数据存放位置</h2>
        <p>
          Stayloop 运行在 Cloudflare 与 Supabase（Postgres）之上。账户数据与上传的文件存在加拿大或美国区域，
          取决于具体服务商。Stripe 在其自有安全程序下处理支付。AI 推理使用 Anthropic API；
          你的请求按 Anthropic 企业数据条款处理，不用于模型训练。
        </p>

        <h2>你在 PIPEDA 下的权利</h2>
        <p>
          你可以：
        </p>
        <ul>
          <li>询问我们持有你的哪些个人信息。</li>
          <li>请求更正不准确的信息。</li>
          <li>请求删除账户及上传文件（部分记录因税务 / 审计要求需保留）。</li>
          <li>撤回对可选处理的同意。</li>
          <li>向加拿大隐私专员公署投诉。</li>
        </ul>
        <p>
          以上任何一项请发邮件至 <a href="mailto:privacy@stayloop.ai">privacy@stayloop.ai</a>，我们会在 30 天内回复。
        </p>

        <h2>安全</h2>
        <p>
          我们使用 HTTPS 传输加密、存储层落盘加密、Postgres 行级权限。完整说明见 <a href="/legal/security">安全说明</a>。
        </p>

        <h2>联系方式</h2>
        <p>
          隐私问题：<a href="mailto:privacy@stayloop.ai">privacy@stayloop.ai</a><br />
          一般联系：<a href="mailto:hello@stayloop.ai">hello@stayloop.ai</a>
        </p>
      </>}
    />
  )
}
