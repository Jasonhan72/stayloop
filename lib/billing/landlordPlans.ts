// The landlord plans, one source for /pricing, the dashboard upgrade dialog
// and the subscription card in /settings (2026-09-28).
//
// Why one list: the dashboard dialog had its own copy that sold features that
// never existed (an "Openroom" landlord database, Slack notifications,
// branded apply pages, a priority scoring queue, CanLII name search) and put
// unlimited listings under Free while /pricing put them under Pro; the
// settings card had a third copy. And /pricing itself listed as Pro perks
// things every landlord already has — unlimited listings, the AI Agent, lease
// drafting and renewals are not plan-gated anywhere in the code.
//
// What Pro actually unlocks (the only plan checks in the code): screening past
// the free 5 a month (app/api/screen-score), deep checks
// (app/api/deep-check enforceProGate), applicant verification links
// (lib/billing/access hasProAccess), and dispatch to the verified provider
// network (lib/marketplace networkDispatchAllowed). Keep this list to those.
export type PlanFeature = { zh: string; en: string; href?: string; /** for compact grids (the /settings card) */ short?: { zh: string; en: string } }

export const LANDLORD_PRO_PRICE = 19

export const LANDLORD_GO: { name: PlanFeature; tagline: PlanFeature; features: PlanFeature[] } = {
  name: { zh: '起步', en: 'Go' },
  tagline: { zh: '免费开始发布房源。', en: 'Free to start listing.' },
  features: [
    { zh: '房源发布，不限套数', en: 'Publish listings, no cap' },
    { zh: '接收在线申请', en: 'Receive online applications' },
    { zh: '每月 5 次租客筛查（含取证与信用分析）', en: '5 tenant screenings a month (forensics + credit analysis included)' },
    { zh: '深度核查按次解锁 $14.99', en: 'Deep checks unlock per applicant at $14.99' },
    { zh: 'AI 助理、安省标准租约与电子签、续约提醒', en: 'AI Agent, Ontario standard lease with e-signing, renewal reminders' },
    { zh: '维修工单 + 派给你自己的联系人', en: 'Repair tickets + dispatch to your own contacts', href: '/services' },
  ],
}

export const LANDLORD_PRO: { name: PlanFeature; tagline: PlanFeature; features: PlanFeature[] } = {
  name: { zh: '专业', en: 'Pro' },
  tagline: { zh: '筛查不限次，核验与服务商网络全开。', en: 'Unlimited screening, verification and the provider network.' },
  features: [
    { zh: '租客筛查不限次数', en: 'Unlimited tenant screenings' },
    { zh: '深度核查全含（法庭 · 取证 · 雇主）', en: 'Deep checks included (courts · forensics · employer)', short: { zh: '深度核查全含', en: 'Deep checks included' } },
    { zh: '申请人本人核验链接（身份 · 银行 · 征信，陆续开通）', en: 'Applicant verification links (ID · bank · credit, rolling out)', short: { zh: '申请人本人核验链接', en: 'Applicant verification links' } },
    { zh: '维修派单：已核验服务商网络 + 派单策略（紧急件自动派、预授权）· 不抽成，付款你与服务商直接结算', en: 'Repairs: verified provider network + dispatch policy (auto-dispatch emergencies, pre-approval) · no commission, you pay the provider directly', href: '/services', short: { zh: '已核验服务商网络派单', en: 'Verified provider network' } },
    { zh: '财务面板（即将推出）', en: 'Finance dashboard (coming soon)' },
  ],
}
