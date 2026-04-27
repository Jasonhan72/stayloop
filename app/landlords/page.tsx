'use client'

import AudienceLanding from '@/components/marketing/AudienceLanding'

export default function LandlordsPage() {
  return (
    <AudienceLanding
      eyebrow_zh="房东"
      eyebrow_en="LANDLORDS"
      title_zh="AI 替你筛选每一位申请人。"
      title_en="AI ranks every applicant."
      accentWord_zh="筛选"
      accentWord_en="ranks"
      subtitle_zh="Logic agent 综合支付能力、租房历史、合规风险打分。Nova 负责房源文案与定价。Sentinel 守住 OHRC 与 RTA 红线。你只需要做最终批准。"
      subtitle_en="Logic agent scores ability-to-pay, rental history, and compliance risk. Nova drafts copy and pricing. Sentinel guards the OHRC + RTA red lines. You make the final call."
      primaryCta={{ label_zh: '查看 Pipeline', label_en: 'Open Pipeline', href: '/dashboard/pipeline' }}
      secondaryCta={{ label_zh: '让 Nova 写房源', label_en: 'Draft a listing', href: '/listings/new' }}
      stats={[
        { value: '6.2 d', label_zh: '平均挂牌天数（行业 18 d）', label_en: 'avg days-on-market (vs. 18 d industry)' },
        { value: '92%', label_zh: 'Logic 推荐租客签约后好评率', label_en: 'positive review rate of Logic-picked tenants' },
        { value: '0', label_zh: 'OHRC 投诉案例（Sentinel 守门）', label_en: 'OHRC complaints (Sentinel guards listings)' },
        { value: '$29/mo', label_zh: 'Pro 起步价', label_en: 'Pro plan starting price' },
      ]}
      features={[
        {
          title_zh: 'Logic AI Pipeline',
          title_en: 'Logic AI Pipeline',
          body_zh: 'Kanban 视图：新申请 → AI 审核 → 预约看房 → 起草租约。每位候选人都附带 6 维评分和理由说明。',
          body_en: 'Kanban: New → AI Reviewed → Showing Booked → Lease Drafted. Each candidate ships with a 6-axis score and a rationale you can question.',
        },
        {
          title_zh: 'Nova · 房源撰写',
          title_en: 'Nova · listing composer',
          body_zh: '从 MLS / Realtor / Kijiji 直接导入，输出双语标题、描述、Stayloop Index 价格区间。Sentinel 实时扫描合规。',
          body_en: 'Import from MLS / Realtor / Kijiji. Get bilingual title, description, and a Stayloop Index price band. Sentinel scans for compliance live.',
        },
        {
          title_zh: '文档真伪取证',
          title_en: 'Document forensics',
          body_zh: 'PDF metadata、字体多样性、修改时间差、拼接痕迹检测。Photoshop / GIMP / Canva 来源直接红牌。',
          body_en: 'PDF metadata, font diversity, mod-vs-create gaps, splice detection. Bank statements from Photoshop / GIMP / Canva are caught instantly.',
        },
        {
          title_zh: 'CanLII + 安省法庭门户',
          title_en: 'CanLII + Ontario Courts Portal',
          body_zh: '一次查询所有安省数据库 + Ontario Courts Portal Civil + Small Claims，被告记录直接展示。',
          body_en: 'One query searches every Ontario CanLII database plus the Civil and Small Claims portals. Defendant records surface immediately.',
        },
        {
          title_zh: 'Field Agent 6 因子匹配',
          title_en: 'Field Agent · 6-factor match',
          body_zh: '区域 25% / 语言 20% / 绩效 20% / 负载 15% / 物业类型 10% / 响应速度 10%。算法每月学习一次。',
          body_en: 'Area 25 / Language 20 / Performance 20 / Load 15 / Property type 10 / Response 10. The algorithm learns monthly from outcomes.',
        },
        {
          title_zh: 'Portfolio Analytics',
          title_en: 'Portfolio Analytics',
          body_zh: '6 套房产一屏看：现金流 vs 预测、空置天数、平均租客评分、Nova 提示降价或加广。',
          body_en: 'See cash flow vs. forecast, vacancy, average tenant score across all your properties. Nova suggests pricing fixes when units lag comps.',
        },
      ]}
      closing_zh="不再读 PDF，不再背 OHRC。"
      closing_en="Stop reading PDFs. Stop memorizing the OHRC."
    />
  )
}
