'use client'

import AudienceLanding from '@/components/marketing/AudienceLanding'

export default function TrustApiPage() {
  return (
    <AudienceLanding
      eyebrow_zh="Trust API"
      eyebrow_en="TRUST API"
      title_zh="Stripe-style 的租赁信任 API。"
      title_en="A Stripe-style API for rental trust."
      accentWord_zh="租赁信任"
      accentWord_en="rental trust"
      subtitle_zh="Identity / Income / Credit / Eviction / Score 五个端点。POST 一次请求，拿回带 12 个月有效期的核验记录 + JWT proof。30 分钟接入沙盒。"
      subtitle_en="Five endpoints: Identity, Income, Credit, Eviction, Score. POST once, receive a sealed verification record with a 12-month JWT proof. 30 minutes from sandbox to live."
      primaryCta={{ label_zh: '获取 API Key', label_en: 'Get an API key', href: '/chat' }}
      secondaryCta={{ label_zh: '查看示例响应', label_en: 'See sample response', href: '/chat' }}
      stats={[
        { value: '$6', label_zh: 'Identity verify · 单次价格', label_en: 'per identity verification' },
        { value: '~400ms', label_zh: '中位响应时间', label_en: 'median response time' },
        { value: '99.95%', label_zh: 'API 可用率（最近 90 天）', label_en: 'API uptime (trailing 90 days)' },
        { value: '20k+', label_zh: 'Verified Passport 总量', label_en: 'verified passports issued' },
      ]}
      features={[
        {
          title_zh: 'Identity · Persona + GovID',
          title_en: 'Identity · Persona + GovID',
          body_zh: '政府 ID + 活体 selfie。返回欺诈分、文件元数据、12 个月可用 JWT proof。',
          body_en: 'Government ID + biometric liveness. Returns a fraud score, document metadata, and a 12-month JWT proof.',
        },
        {
          title_zh: 'Income (VOIE)',
          title_en: 'Income (VOIE)',
          body_zh: 'Flinks bank API + Argyle payroll。读取 90 天存款，AI 检测稳定性，输出 sealed average。',
          body_en: 'Flinks bank API + Argyle payroll. Reads 90 days of deposits, runs AI stability checks, returns a sealed average.',
        },
        {
          title_zh: 'Credit · Equifax Rental Connect',
          title_en: 'Credit · Equifax Rental Connect',
          body_zh: '原生 Equifax 加拿大对接。返回 score、tradelines、AI 解读。',
          body_en: 'Native Equifax Canada integration. Returns score, tradelines, and an AI-written interpretation.',
        },
        {
          title_zh: 'Eviction · Openroom + CanLII',
          title_en: 'Eviction · Openroom + CanLII',
          body_zh: 'Openroom LTB 数据 + CanLII 全省判例。同名消歧由 Verify agent 完成。',
          body_en: 'Openroom LTB data plus full-province CanLII rulings. Name disambiguation handled by the Verify agent.',
        },
        {
          title_zh: 'Webhook 事件',
          title_en: 'Webhook events',
          body_zh: 'identity.verified · income.verified · score.computed · passport.shared · passport.revoked。HMAC-SHA256 签名。',
          body_en: 'identity.verified · income.verified · score.computed · passport.shared · passport.revoked. HMAC-SHA256 signed.',
        },
        {
          title_zh: '合规 · PIPEDA + GDPR',
          title_en: 'Compliance · PIPEDA + GDPR',
          body_zh: 'Append-only 审计日志、租客可导出全部数据、可一键撤销。SOC2 进行中。',
          body_en: 'Append-only audit log, full data export for the tenant, one-click revocation. SOC2 in progress.',
        },
      ]}
      closing_zh="一份 Passport，整个北美都能读。"
      closing_en="One Passport. Read by every business in North America."
    />
  )
}
