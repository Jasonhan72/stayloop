'use client'
// /tenants — Tenant audience landing.
// V5 copy deck (stayloop_v5_final_copy_deck.md):
//   · 三角色入口 — Tenant: 一次验证，处处通行。
//   · 产品定义   — 每位用户都有自己的个人 AI Agent。
//   · 交互原则   — 不是 AI 替你做决定，而是 AI 协助你完成流程。

import AudienceLanding from '@/components/marketing/AudienceLanding'

export default function TenantsPage() {
  return (
    <AudienceLanding
      eyebrow_zh="租客"
      eyebrow_en="FOR TENANTS"
      title_zh="一次验证，处处通行。"
      title_en="Verify once. Apply anywhere."
      accentWord_zh="处处通行"
      accentWord_en="Apply anywhere"
      subtitle_zh="创建可复用的 Rental Passport，让你的身份、收入、信用与申请资料在租房流程中被清晰整理、可控分享。每一次申请、签约和后续服务，都有你的个人 AI Agent 在协助 —— 关键步骤由你确认，其余由系统协助完成。"
      subtitle_en="Create a reusable Rental Passport. Your ID, income, credit and documents stay organized — and you control who sees what. From applications to e-sign to move-in services, your personal AI agent assists every step; you confirm the key moments, the system handles the rest."
      primaryCta={{ label_zh: '开始我的 Passport', label_en: 'Start my Passport', href: '/passport' }}
      secondaryCta={{ label_zh: '看看示例评分', label_en: 'See an example score', href: '/score' }}
      stats={[
        { value: '90s', label_zh: '完成一份申请 · 一键复用', label_en: 'to apply · one tap to reuse' },
        { value: '12mo', label_zh: 'Passport 有效期，可续可撤销', label_en: 'Passport validity · revocable any time' },
        { value: '5×', label_zh: '相比逐套上传文件，平均加速', label_en: 'faster than uploading per listing' },
        { value: '$0', label_zh: '租客永远免费', label_en: 'Free for renters, always' },
      ]}
      features={[
        {
          title_zh: '你的个人 AI Agent',
          title_en: 'Your personal AI agent',
          body_zh: '每位用户都有自己的 Agent。它读取专属记忆、理解当前进度，协助你完成租房流程；跨角色协作由系统调度，关键节点由你确认。',
          body_en: 'Every user gets a personal AI agent — backed by private memory, aware of where you are in the process. Cross-role coordination runs in the background; every key step still goes through you.',
        },
        {
          title_zh: 'Rental Passport · 可控分享',
          title_en: 'Rental Passport · share with control',
          body_zh: '身份、收入、信用、租房记录一次整理。房东只看到他需要看到的（例如 "月收入 ≥ 3 倍租金"），原始数据从不外传。链接可设置范围、有效期，并随时撤销。',
          body_en: 'ID, income, credit and rental history organized once. Landlords only see what they need (e.g. "income ≥ 3× rent") — never raw data. Every share link is scoped, expirable, and revocable.',
        },
        {
          title_zh: '不是 AI 替你决定，是 AI 协助你完成',
          title_en: 'AI assists — it doesn’t decide for you',
          body_zh: '提交申请、分享资料、签约、付款和服务预约 —— 这些关键节点必须由你确认。其余的繁琐步骤，Agent 在后台帮你跑完。',
          body_en: 'Submitting an application, sharing documents, signing a lease, making a payment, booking a service — every key action goes through you. The grunt work in between, the agent handles.',
        },
        {
          title_zh: '一份申请，处处可读',
          title_en: 'One application, read everywhere',
          body_zh: '一次完成的 Passport 可以复用到任何 Stayloop 房源。同一份验证，房东、经纪、保险、金融服务都能验真，无需重复上传。',
          body_en: 'A completed Passport reuses across every Stayloop listing. The same verification reads natively for landlords, agents, insurers and financial services — no re-uploads.',
        },
        {
          title_zh: 'Echo · 中英双语助手',
          title_en: 'Echo · bilingual concierge',
          body_zh: '中英双语自由切换：搜索房源、解释租约条款、安排看房、报修。一句话说清需求，Agent 把找房、申请、签约串起来跑。',
          body_en: 'Switch freely between English and Mandarin. Search listings, decode lease clauses, book showings, file maintenance. One sentence in, the agent strings together search → apply → sign.',
        },
        {
          title_zh: '租房记录 · 跟着你走',
          title_en: 'Rental history that travels',
          body_zh: '每一段租约由前房东核签后归档。准时缴租记录在下一次申请时直接为你加分 —— 不再因为换城市而从零开始。',
          body_en: 'Every prior lease is co-signed by the previous landlord and archived. On-time payment streaks travel with you across moves — no more starting from zero just because you changed cities.',
        },
        {
          title_zh: '在正确的时机接入服务',
          title_en: 'The right service, at the right moment',
          body_zh: '从清洁、搬家到维修、保险，Agent 会根据租房阶段主动推荐合适服务，你确认后再继续。不在你需要之前打扰你。',
          body_en: 'Cleaning, moving, repairs, insurance — the agent suggests the right service for the current rental stage, and only proceeds once you confirm. No noise before you need it.',
        },
        {
          title_zh: '合租 · 智能分账',
          title_en: 'Roommates · smart split',
          body_zh: '最多 3 人组合自动算出加权评分。Stayloop 内部分账，房东只看见单笔到账。哪个室友该出多少 —— 系统帮你算清楚，确认权在你。',
          body_en: 'Group apply with up to 3 roommates. Stayloop computes a blended score and splits rent internally — landlord sees one payment. Who pays what is calculated for you; you confirm.',
        },
      ]}
      closing_zh="一次验证，租遍北美。"
      closing_en="Verify once. Rent anywhere in North America."
    />
  )
}
