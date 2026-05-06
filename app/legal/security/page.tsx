'use client'
// -----------------------------------------------------------------------------
// /legal/security — Security overview
// -----------------------------------------------------------------------------
// What we do at the platform level to protect tenant documents and account
// data. Bilingual. Stays high-level — we link to /legal/privacy for the
// data-handling specifics.
// -----------------------------------------------------------------------------

import LegalPage from '@/components/marketing/LegalPage'

export default function SecurityPage() {
  return (
    <LegalPage
      title_en="Security overview"
      title_zh="安全说明"
      lede_en="How Stayloop protects tenant documents, account data, and AI processing."
      lede_zh="Stayloop 在租赁文件、账户数据和 AI 处理上的安全设计。"
      updated_en="Last updated May 5, 2026"
      updated_zh="最近更新 2026 年 5 月 5 日"
      bodyEn={<>
        <h2>Data in transit</h2>
        <p>
          All traffic between your browser and Stayloop uses HTTPS (TLS 1.2 or higher).
          Cloudflare terminates TLS at the edge, then re-encrypts traffic to upstream services.
        </p>

        <h2>Data at rest</h2>
        <p>
          Account data lives in Supabase Postgres with encryption-at-rest provided by the
          hosting provider. Uploaded tenancy documents live in Supabase Storage, served
          through expiring signed URLs — no public buckets.
        </p>

        <h2>Access control</h2>
        <ul>
          <li><strong>Row-Level Security (RLS)</strong> is enforced on every Postgres table holding personal data. Users can only read or modify rows they own.</li>
          <li><strong>Service-role keys</strong> are restricted to server-side API routes; they never appear in client bundles.</li>
          <li><strong>Authentication</strong> is handled by Supabase Auth. Passwords never reach our servers.</li>
        </ul>

        <h2>AI processing</h2>
        <p>
          Document text and metadata are sent to Anthropic's API for analysis. Stayloop uses
          Anthropic's enterprise data terms: prompts and responses are not used to train
          models, and are retained only for the period required to deliver the service.
        </p>

        <h2>Audit logs</h2>
        <p>
          Sensitive workflow events — application submissions, screening decisions, lease
          drafts — are written to an append-only audit log. The log is searchable from
          your account but cannot be edited or deleted by users.
        </p>

        <h2>Vulnerability reporting</h2>
        <p>
          If you find a security issue, email{' '}
          <a href="mailto:security@stayloop.ai">security@stayloop.ai</a>. We commit to:
        </p>
        <ul>
          <li>Acknowledging your report within 3 business days.</li>
          <li>Working with you on a coordinated disclosure timeline.</li>
          <li>Crediting you publicly if you'd like to be credited.</li>
        </ul>
        <p>
          Please do not run automated scanners against the production service without
          coordinating in advance. Please do not access or modify other users' data.
        </p>

        <h2>Compliance posture</h2>
        <p>
          Stayloop aligns with Canada's PIPEDA framework. See{' '}
          <a href="/legal/privacy">Privacy notice</a> for the full data-handling story.
          We're working toward SOC 2 Type II; current status is reflected on the homepage trust line.
        </p>

        <h2>Contact</h2>
        <p>
          Security: <a href="mailto:security@stayloop.ai">security@stayloop.ai</a><br />
          Privacy: <a href="mailto:privacy@stayloop.ai">privacy@stayloop.ai</a>
        </p>
      </>}
      bodyZh={<>
        <h2>传输加密</h2>
        <p>
          浏览器与 Stayloop 之间的所有通信均使用 HTTPS（TLS 1.2 及以上）。
          Cloudflare 在边缘节点终止 TLS，然后以加密方式回源到后端服务。
        </p>

        <h2>存储加密</h2>
        <p>
          账户数据存放在 Supabase Postgres 中，由托管方提供存储层加密。
          上传的租赁文件存放在 Supabase Storage，通过有时效的签名链接发放访问权限——不存在公开桶。
        </p>

        <h2>权限控制</h2>
        <ul>
          <li><strong>行级权限（RLS）</strong>：所有保存个人数据的 Postgres 表均启用行级权限，用户只能读写自己拥有的记录。</li>
          <li><strong>服务端密钥</strong>：service-role key 只在服务端 API 路由中使用，绝不会出现在客户端打包中。</li>
          <li><strong>认证</strong>：由 Supabase Auth 处理，密码不会到达我们的服务器。</li>
        </ul>

        <h2>AI 处理</h2>
        <p>
          文档文本与元数据会发送到 Anthropic API 进行分析。Stayloop 使用 Anthropic 企业数据条款：
          请求与响应不会用于模型训练，仅在交付服务所需期限内保留。
        </p>

        <h2>审计日志</h2>
        <p>
          敏感工作流事件——申请提交、筛查决策、租约草稿——会写入只追加（append-only）的审计日志。
          你可以从账户中检索该日志，但无法编辑或删除其中的记录。
        </p>

        <h2>漏洞报告</h2>
        <p>
          如发现安全问题，请发邮件至 <a href="mailto:security@stayloop.ai">security@stayloop.ai</a>。我们承诺：
        </p>
        <ul>
          <li>3 个工作日内回复确认。</li>
          <li>与你协调一致的披露时间线。</li>
          <li>如你希望，会公开致谢。</li>
        </ul>
        <p>
          请勿在未事先沟通的情况下对生产服务进行自动化扫描，请勿访问或修改其他用户的数据。
        </p>

        <h2>合规情况</h2>
        <p>
          Stayloop 对齐加拿大 PIPEDA 框架，完整数据处理说明见 <a href="/legal/privacy">隐私声明</a>。
          SOC 2 Type II 工作正在推进，当前状态以首页 trust line 为准。
        </p>

        <h2>联系方式</h2>
        <p>
          安全：<a href="mailto:security@stayloop.ai">security@stayloop.ai</a><br />
          隐私：<a href="mailto:privacy@stayloop.ai">privacy@stayloop.ai</a>
        </p>
      </>}
    />
  )
}
