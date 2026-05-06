'use client'
// -----------------------------------------------------------------------------
// /legal/terms — Terms of service
// -----------------------------------------------------------------------------
// Plain-language overview of the Stayloop service contract. Bilingual.
// Not a substitute for individual legal review of any specific use case.
// -----------------------------------------------------------------------------

import LegalPage from '@/components/marketing/LegalPage'

export default function TermsPage() {
  return (
    <LegalPage
      title_en="Terms of service"
      title_zh="使用条款"
      lede_en="The basic agreement between Stayloop and the people who use it. Plain language; not a substitute for legal advice."
      lede_zh="Stayloop 与使用者之间的基本约定。直白语言，不构成法律意见。"
      updated_en="Last updated May 5, 2026"
      updated_zh="最近更新 2026 年 5 月 5 日"
      bodyEn={<>
        <h2>1. What Stayloop is</h2>
        <p>
          Stayloop provides AI-assisted screening, application, and lease workflow tools for the
          Ontario rental market. Stayloop is a software service. It is not a real-estate brokerage,
          credit bureau, law firm, or financial advisor.
        </p>

        <h2>2. Who can use it</h2>
        <p>
          You may use Stayloop if you are at least 18, can form a binding contract under Ontario
          law, and agree to these terms. Use Stayloop only for lawful rental-related purposes.
        </p>

        <h2>3. Your responsibilities</h2>
        <ul>
          <li>You're responsible for the accuracy of the documents and information you upload.</li>
          <li>You must have a valid reason to upload another person's information (e.g. a rental application that named you as a reference) and must comply with applicable consent and privacy laws.</li>
          <li>You make the final rental decision. Stayloop produces decision support, not approvals or rejections.</li>
          <li>You must comply with the Ontario Human Rights Code and Residential Tenancies Act when using outputs from Stayloop.</li>
        </ul>

        <h2>4. AI-assisted output</h2>
        <p>
          Stayloop uses AI to summarize and check documents. AI output can be wrong, incomplete, or
          biased. Treat every AI-generated finding as a hint, not a conclusion. Verify anything
          material before acting on it.
        </p>

        <h2>5. Limitations</h2>
        <p>
          Stayloop is provided <strong>as is</strong> and <strong>as available</strong>. We don't
          warrant that the service will be uninterrupted, error-free, or fit for any specific
          purpose. To the maximum extent permitted by Ontario law, Stayloop is not liable for any
          indirect, incidental, or consequential losses arising from your use of the service.
        </p>

        <h2>6. Billing</h2>
        <p>
          Paid plans are billed via Stripe. Billing terms (per-report, monthly, etc.) are shown on
          the <a href="/pricing">Pricing</a> page. You can cancel at any time; cancellation stops
          future renewals but does not refund the current period unless required by law.
        </p>

        <h2>7. Account suspension and termination</h2>
        <p>
          We may suspend or terminate accounts for fraud, misuse, abuse of other users, or
          repeated violations of these terms. We'll give reasonable notice when we can.
        </p>

        <h2>8. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. Material changes will be communicated
          through the app or by email. Continued use after a change means you accept it.
        </p>

        <h2>9. Governing law</h2>
        <p>
          These terms are governed by the laws of the Province of Ontario, Canada. Disputes are
          resolved in the courts of Ontario.
        </p>

        <h2>10. Contact</h2>
        <p>
          Questions about these terms: <a href="mailto:legal@stayloop.ai">legal@stayloop.ai</a><br />
          General contact: <a href="mailto:hello@stayloop.ai">hello@stayloop.ai</a>
        </p>
      </>}
      bodyZh={<>
        <h2>1. Stayloop 是什么</h2>
        <p>
          Stayloop 提供面向安省租赁市场的 AI 辅助筛查、申请和租约工作流工具。Stayloop 是一项软件服务，
          不是房地产经纪公司、征信机构、律师事务所或金融顾问。
        </p>

        <h2>2. 谁可以使用</h2>
        <p>
          你必须年满 18 岁、依据安省法律具有签订合同的能力，并同意本条款，才可以使用 Stayloop。
          仅可将 Stayloop 用于合法的租赁相关用途。
        </p>

        <h2>3. 你的责任</h2>
        <ul>
          <li>你对所上传的文件和信息的真实性负责。</li>
          <li>上传他人信息须有正当理由（例如对方在租赁申请中将你列为推荐人），并须遵守适用的同意与隐私法规。</li>
          <li>最终的租赁决定由你作出。Stayloop 提供的是决策支持，而非批准或拒绝。</li>
          <li>使用 Stayloop 的输出时须遵守《安省人权法典》和《住宅租赁法》。</li>
        </ul>

        <h2>4. AI 辅助产出</h2>
        <p>
          Stayloop 使用 AI 对文件进行摘要与一致性核查。AI 的产出可能存在错误、遗漏或偏见。
          请把每一条 AI 提示视为线索而非结论，处理重要事项前自行复核。
        </p>

        <h2>5. 服务限制</h2>
        <p>
          Stayloop 按 <strong>"现状"</strong> 与 <strong>"可用情况"</strong> 提供。
          我们不保证服务无中断、无错误或适用于特定目的。在安省法律允许的最大范围内，
          Stayloop 不对因使用本服务而产生的任何间接、附带或后果性损失承担责任。
        </p>

        <h2>6. 计费</h2>
        <p>
          付费套餐通过 Stripe 计费。计费方式（按报告、按月等）见 <a href="/pricing">价格页</a>。
          你可以随时取消；取消会停止后续续费，但当期内已缴费用除法律另有规定外不退还。
        </p>

        <h2>7. 账号暂停与终止</h2>
        <p>
          对于欺诈、滥用、骚扰其他用户或反复违反本条款的账号，我们可能会暂停或终止其使用权。
          条件允许时我们会提前通知。
        </p>

        <h2>8. 条款变更</h2>
        <p>
          我们可能不时更新本条款。重大变更会通过应用或邮件告知。变更后继续使用服务即视为接受新条款。
        </p>

        <h2>9. 适用法律</h2>
        <p>
          本条款受加拿大安大略省法律管辖。争议由安省法院管辖。
        </p>

        <h2>10. 联系方式</h2>
        <p>
          条款相关问题：<a href="mailto:legal@stayloop.ai">legal@stayloop.ai</a><br />
          一般联系：<a href="mailto:hello@stayloop.ai">hello@stayloop.ai</a>
        </p>
      </>}
    />
  )
}
