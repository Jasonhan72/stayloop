'use client'

import AudienceLanding from '@/components/marketing/AudienceLanding'

export default function AgentsPage() {
  return (
    <AudienceLanding
      eyebrow_zh="经纪"
      eyebrow_en="AGENTS"
      title_zh="只做带看，不做文书。"
      title_en="Show. Don't shuffle paper."
      accentWord_zh="带看"
      accentWord_en="Show"
      subtitle_zh="AI 替你写 MLS、起草租约、安排看房、回答租客咨询。你专注于线下的人和判断。Stayloop 把佣金透明化，房东不付额外钱。"
      subtitle_en="AI writes the MLS pack, drafts the lease, schedules showings, and answers tenant FAQ. You handle the human. Commission stays transparent — landlord pays the same total."
      primaryCta={{ label_zh: '加入 Field Agent 网络', label_en: 'Join the Field Agent network', href: '/chat' }}
      secondaryCta={{ label_zh: '查看示例 Day Brief', label_en: 'See a sample Day Brief', href: '/chat' }}
      stats={[
        { value: '3.4×', label_zh: '每位经纪每月签约量', label_en: 'more closings per agent / month' },
        { value: '~14h', label_zh: '每周节省的行政时间', label_en: 'admin hours saved each week' },
        { value: '80%', label_zh: 'AI 已经替你做完的工作', label_en: 'of your workflow handled by AI' },
        { value: '20%', label_zh: '佣金分成给 Stayloop', label_en: 'commission share to Stayloop' },
      ]}
      features={[
        {
          title_zh: 'Day Brief',
          title_en: 'Day Brief',
          body_zh: 'Echo + Logic 早晨给你一份按地理聚类排好的当日任务：3 场带看 + 1 个待签 + Logic 推荐的开场白。',
          body_en: 'Each morning, Echo + Logic deliver a geography-clustered day plan: today\u2019s showings, pending leases, and the highest-fit talking point per tour.',
        },
        {
          title_zh: 'MLS Ready Pack',
          title_en: 'MLS Ready Pack',
          body_zh: 'TRREB 格式正文 + 12 张 Nova 推荐拍摄角度 + SEO 评分。复制粘贴上 MLS 即可。',
          body_en: 'TRREB-format copy, 12 Nova-recommended capture angles, SEO score. Copy-paste straight into MLS.',
        },
        {
          title_zh: 'Showing Brief',
          title_en: 'Showing Brief',
          body_zh: '每场带看前自动生成租客 Passport 摘要、6 维评分、问答记录、议价比价。开车路上听一遍就准备好。',
          body_en: 'Before each tour: tenant passport summary, six-axis score, prior Q\u0026A, comp-driven negotiation pointers. Listen to it on the drive over.',
        },
        {
          title_zh: '佣金 · 全程透明',
          title_en: 'Commission · fully transparent',
          body_zh: '房东端 console 永远显示分配比例。Stayloop 暂存到租约签字才放款。',
          body_en: 'Landlord console always shows the split. Stayloop holds escrow and releases on lease signature.',
        },
        {
          title_zh: '6 因子推荐',
          title_en: '6-factor matching',
          body_zh: '房东发布 listing 时算法把你推送给最合适的房源。也可以主动 apply 任何同区域 listing。',
          body_en: 'Landlords get you recommended by the matching algorithm; you can also apply to any listing in your area.',
        },
        {
          title_zh: '从真实交易里跑出来的工作流',
          title_en: 'A workflow shaped by real deals',
          body_zh: '我们和首位 Field Agent 一起走完了 47 套实际签约。AI 在哪段帮上忙、哪段必须留给人，全是从这些真实交易里学出来的。',
          body_en: 'The workflow is shaped by 47 real signings walked through with our first Field Agent — every place where AI helps, and every place where it should step aside, came out of actual deals.',
        },
      ]}
      closing_zh="把行政交给 AI，把人留给你。"
      closing_en="Hand the paperwork to AI. Keep the humans."
    />
  )
}
