'use client'

import AudienceLanding from '@/components/marketing/AudienceLanding'

export default function TenantsPage() {
  return (
    <AudienceLanding
      eyebrow_zh="租客"
      eyebrow_en="TENANTS"
      title_zh="一本 Passport，处处可用。"
      title_en="One Passport. Anywhere."
      accentWord_zh="Passport"
      accentWord_en="Passport"
      subtitle_zh="通过 Persona + Flinks 一次完成身份、收入、信用、租房记录验证。然后用同一份 Passport 申请任何一套房，90 秒搞定。"
      subtitle_en="Verify your identity, income, credit, and rental history once via Persona + Flinks. Then apply to any unit in 90 seconds with the same Passport."
      primaryCta={{ label_zh: '开始我的 Passport', label_en: 'Start my Passport', href: '/chat' }}
      secondaryCta={{ label_zh: '查看示例评分', label_en: 'See example score', href: '/chat' }}
      stats={[
        { value: '94%', label_zh: '相比纸质申请，步骤减少', label_en: 'fewer steps vs. paper applications' },
        { value: '90s', label_zh: '完成一次申请', label_en: 'to apply to a listing' },
        { value: '12mo', label_zh: 'Passport 有效期，可续', label_en: 'Passport validity, renewable' },
        { value: '$0', label_zh: '租客永远免费', label_en: 'Free for renters, always' },
      ]}
      features={[
        {
          title_zh: 'Echo 中英双语助手',
          title_en: 'Echo · bilingual concierge',
          body_zh: '中英双语对话搜索房源、解释租约条款、安排看房、报修。一次输入，通勤、预算、入住时间全部处理。',
          body_en: 'Chat in any mix of English and Mandarin to search listings, decode lease clauses, schedule showings, or file maintenance requests.',
        },
        {
          title_zh: 'Verified Renter Passport',
          title_en: 'Verified Renter Passport',
          body_zh: '带二维码的数字护照，房东只看到 "月收入 ≥ 3 倍租金"，原始数据从不外传。可随时撤销。',
          body_en: 'A QR-shareable digital passport. Landlords see assertions like "income ≥ 3× rent", never raw data. Revocable any time.',
        },
        {
          title_zh: '房源解释 · 逐条',
          title_en: 'Lease Explainer · clause-by-clause',
          body_zh: '安省标准租约 24 条，每一条都用大白话+中文解释。RTA 风险点自动高亮。',
          body_en: 'Every clause of the Ontario Standard Lease, plain-English plus Mandarin. RTA risk flags surface automatically.',
        },
        {
          title_zh: '保险 · 一键比价',
          title_en: 'Insurance in one tap',
          body_zh: 'Northbridge / Square One / Apollo 实时竞价，最低价直接绑定，自动同步证明给房东。',
          body_en: 'Northbridge, Square One, and Apollo bid live. Bind the lowest with one tap; certificate ships to your landlord automatically.',
        },
        {
          title_zh: '租房记录 · 永久保存',
          title_en: 'Rental history that travels',
          body_zh: '每一段租约都被前房东核签后归档。下次申请，准时缴租记录直接为你加分。',
          body_en: 'Every prior lease is co-signed by the previous landlord. On-time payment streaks travel with you across moves.',
        },
        {
          title_zh: '合租 · 智能分账',
          title_en: 'Roommates · smart split',
          body_zh: '3 人组合自动算出加权评分。Stayloop 内部分账，房东只看见单笔到账。',
          body_en: 'Group apply with up to 3 roommates. Stayloop computes a blended score and splits rent internally — landlord sees one payment.',
        },
      ]}
      closing_zh="一次验证，租遍北美。"
      closing_en="Verify once. Rent anywhere in North America."
    />
  )
}
