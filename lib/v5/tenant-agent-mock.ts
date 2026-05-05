// -----------------------------------------------------------------------------
// Stayloop V5 — Tenant agent mock session
// -----------------------------------------------------------------------------
// Static, deterministic mock data used by:
//   - app/api/agent/session/route.ts  (returns this for any signed-in user)
//   - components/v5/tenant-agent/TenantAgentWorkspace.tsx (initial render)
//
// Replace this file with live Supabase reads once the v5_agent_foundation
// migration ships and the real workflow orchestrator starts populating
// agent_sessions / user_memories / task_memories. Until then, every fetch
// returns the same persona ("Mei Lin Chen") to keep the prototype legible.
// -----------------------------------------------------------------------------

import type { TenantAgentSession } from './agent-types'

// Use a stable past timestamp so snapshot tests / screenshots are stable.
const NOW_ISO = '2026-05-05T14:32:00Z'

export const TENANT_AGENT_MOCK: TenantAgentSession = {
  session_id: 'mock-luna-session-001',
  role: 'tenant',
  agent_name: 'Luna',
  agent_role_label_en: 'Tenant Personal Agent',
  agent_role_label_zh: '租客个人助手',
  status: 'waiting_approval',
  status_message_en:
    'Luna is helping you prepare a stronger rental application. Two actions are waiting for your approval.',
  status_message_zh:
    'Luna 正在帮你完善租房申请，有两个操作等待你的确认。',
  last_active_at: NOW_ISO,

  workflow_stages: [
    {
      id: 'search_preferences',
      label_en: 'Search Preferences',
      label_zh: '搜索偏好',
      description_en: 'Areas, budget, move-in date and lifestyle priorities locked in.',
      description_zh: '区域、预算、入住日期和生活方式偏好已确认。',
      status: 'completed',
      hint_en: 'Saved 3 days ago',
      hint_zh: '3 天前已保存',
    },
    {
      id: 'passport_readiness',
      label_en: 'Passport Readiness',
      label_zh: 'Passport 准备',
      description_en: 'Verified ID, income proof and references gathered into your reusable Tenant Passport.',
      description_zh: '已核实的身份、收入证明与推荐人已整理进可复用的 Tenant Passport。',
      status: 'completed',
      hint_en: '4 of 5 documents verified',
      hint_zh: '5 项文件已核实 4 项',
    },
    {
      id: 'application_preparation',
      label_en: 'Application Preparation',
      label_zh: '申请准备',
      description_en: 'Tailoring application packages for your shortlisted listings.',
      description_zh: '正在为入围房源准备申请材料包。',
      status: 'current',
      hint_en: '2 listings shortlisted',
      hint_zh: '入围 2 个房源',
    },
    {
      id: 'screening_review',
      label_en: 'Screening Review',
      label_zh: '背调审核',
      description_en: 'Wait for landlord-side screening result and respond if questions arise.',
      description_zh: '等待房东方完成背调，如有问题及时回应。',
      status: 'upcoming',
    },
    {
      id: 'lease_review',
      label_en: 'Lease Review',
      label_zh: '租约审阅',
      description_en: 'Plain-language lease explainer + key-term flags before you sign.',
      description_zh: '签约前提供直白语言解读和关键条款提示。',
      status: 'upcoming',
    },
    {
      id: 'move_in_services',
      label_en: 'Move-in Services',
      label_zh: '入住服务',
      description_en: 'Insurance, utilities, internet, and move-in checklist coordination.',
      description_zh: '协调保险、水电、宽带和入住清单。',
      status: 'upcoming',
    },
  ],

  pending_actions: [
    {
      id: 'pa-share-passport-001',
      title_en: 'Share verified Tenant Passport with 88 Harbour St (Unit 3305)',
      title_zh: '向 88 Harbour St (3305 单元) 分享已核实的 Tenant Passport',
      description_en:
        'Luna will send a one-time view link of your Passport (ID, income summary, rental history snapshot) to the listing landlord. Link expires in 7 days.',
      description_zh:
        'Luna 会把 Passport（身份、收入摘要、租房历史快照）的一次性查看链接发给该房源的房东，链接 7 天后过期。',
      reason_en:
        'This shares verified personal information outside Stayloop. Approval keeps you in control of who sees what.',
      reason_zh:
        '这一步会把核实过的个人信息分享给 Stayloop 之外的人，需要你确认才能继续。',
      sensitivity: 'high',
      status: 'pending',
      created_at: '2026-05-05T13:48:00Z',
      expires_at: '2026-05-12T13:48:00Z',
      preview: {
        recipient: '88 Harbour St — listing #3305',
        passport_sections: ['identity', 'income_summary', 'rental_history'],
        link_ttl_days: 7,
      },
    },
    {
      id: 'pa-submit-application-002',
      title_en: 'Submit application package for 30 Roehampton Ave (Unit 712)',
      title_zh: '向 30 Roehampton Ave (712 单元) 提交完整申请包',
      description_en:
        'Luna has assembled your application form, employment letter, two recent paystubs and a cover note. Review the bundle and approve to send.',
      description_zh:
        'Luna 已经准备好申请表、雇佣信、近两期工资单和一封简短自荐信。审核通过后会发出。',
      reason_en:
        'Submitting an application is a commitment to a landlord. We never send packages without your explicit go-ahead.',
      reason_zh:
        '提交申请就是对房东作出意向承诺，没有你的明确同意我们不会发送。',
      sensitivity: 'high',
      status: 'pending',
      created_at: '2026-05-05T14:12:00Z',
      preview: {
        listing: '30 Roehampton Ave — Unit 712',
        documents: ['application_form_v2.pdf', 'employment_letter.pdf', 'paystub_apr_15.pdf', 'paystub_apr_30.pdf'],
        cover_note_chars: 412,
      },
    },
    {
      id: 'pa-followup-message-003',
      title_en: 'Send a follow-up message to the agent for 1188 Yonge St',
      title_zh: '向 1188 Yonge St 房源的经纪人发送跟进消息',
      description_en:
        'Drafted a polite check-in asking whether the landlord has reviewed your application. You can edit before sending.',
      description_zh:
        '已经为你起草一段礼貌的跟进消息，询问房东是否已查看你的申请。发送前可以编辑。',
      reason_en:
        'Messages sent on your behalf appear under your name — approval ensures the wording reflects you.',
      reason_zh:
        '以你的名义发出的消息会署你的名字，需要你确认措辞代表你的本意。',
      sensitivity: 'medium',
      status: 'pending',
      created_at: '2026-05-05T14:25:00Z',
      preview: {
        recipient: 'agent — 1188 Yonge St',
        draft_chars: 168,
        tone: 'polite, brief',
      },
    },
  ],

  private_memory: [
    {
      id: 'mem-areas',
      category: 'preferences',
      label_en: 'Preferred areas',
      label_zh: '偏好区域',
      value: ['Downtown Toronto', 'North York', 'Midtown'],
      updated_at: '2026-05-02T10:14:00Z',
      user_confirmed: true,
    },
    {
      id: 'mem-budget',
      category: 'preferences',
      label_en: 'Budget',
      label_zh: '预算',
      value: '$2,400–$2,900 / month',
      updated_at: '2026-05-02T10:14:00Z',
      user_confirmed: true,
    },
    {
      id: 'mem-move-in',
      category: 'preferences',
      label_en: 'Move-in date',
      label_zh: '入住日期',
      value: 'September 1, 2026',
      updated_at: '2026-05-02T10:14:00Z',
      user_confirmed: true,
    },
    {
      id: 'mem-household',
      category: 'household',
      label_en: 'Household',
      label_zh: '家庭组成',
      value: '1 person · no pets · non-smoker',
      updated_at: '2026-05-02T10:14:00Z',
      user_confirmed: true,
    },
    {
      id: 'mem-language',
      category: 'language',
      label_en: 'Language',
      label_zh: '语言',
      value: ['English', '中文'],
      updated_at: '2026-05-02T10:14:00Z',
      user_confirmed: true,
    },
    {
      id: 'mem-priorities',
      category: 'priorities',
      label_en: 'Priorities',
      label_zh: '优先级',
      value: ['Transit access', 'Quiet building', 'Verified landlord'],
      updated_at: '2026-05-04T08:32:00Z',
      user_confirmed: false,
    },
    {
      id: 'mem-constraints',
      category: 'constraints',
      label_en: 'Hard requirements',
      label_zh: '硬性条件',
      value: ['In-unit laundry', 'Walking distance to subway'],
      updated_at: '2026-05-04T08:32:00Z',
      user_confirmed: true,
    },
  ],

  recommendations: [
    {
      id: 'rec-employment-letter',
      kind: 'improvement',
      title_en: 'Add an employment letter to your Passport',
      title_zh: '把雇佣信补进你的 Passport',
      rationale_en:
        'Verified employment letters lift Passport readiness from 78 to ~92, which materially improves landlord response rate on the listings you shortlisted.',
      rationale_zh:
        '加入核实过的雇佣信可以把 Passport 准备度从 78 提升到约 92，对你入围房源的房东回复率有明显帮助。',
      cta_label_en: 'Open Passport',
      cta_label_zh: '打开 Passport',
      cta_href: '/passport',
    },
    {
      id: 'rec-passport-readiness',
      kind: 'improvement',
      title_en: 'Refresh your most recent paystub',
      title_zh: '更新最近一期工资单',
      rationale_en:
        'Your most recent paystub is 47 days old. Landlords typically expect something from the last 30 days — a quick re-upload keeps the package strong.',
      rationale_zh:
        '当前最新一期工资单已 47 天，房东通常期望近 30 天的版本，重新上传一份就能维持竞争力。',
      cta_label_en: 'Upload paystub',
      cta_label_zh: '上传工资单',
      cta_href: '/passport',
    },
    {
      id: 'rec-compare-listings',
      kind: 'comparison',
      title_en: 'Compare 88 Harbour St 3305 vs 30 Roehampton 712',
      title_zh: '对比 88 Harbour 3305 与 30 Roehampton 712',
      rationale_en:
        'Both fit your shortlist. Side-by-side view highlights commute times, rent vs market, building age, and lease terms so you can apply to the stronger fit first.',
      rationale_zh:
        '两套房都符合你的入围条件。并排对比能看到通勤时间、与市场租金的差距、楼龄和租约条款，先申请更合适的那套。',
      cta_label_en: 'Open comparison',
      cta_label_zh: '打开对比',
      cta_href: '/tenant/listings',
    },
  ],

  audit_note: {
    message_en:
      'Key actions are recorded in your approval history. Luna may prepare, suggest, summarize and draft — but cannot submit applications, share verified information, sign documents or accept lease terms without your approval.',
    message_zh:
      '关键操作会留存到你的审批历史。Luna 可以为你准备、建议、总结、起草，但提交申请、分享已核实信息、签署文件或接受租约条款，必须经你确认。',
  },
}

/** Convenience helper used by the API route — returns a fresh copy each
 *  call so any in-memory mutations the page makes don't bleed across users
 *  while we're still in mock mode. */
export function getTenantAgentMock(): TenantAgentSession {
  return JSON.parse(JSON.stringify(TENANT_AGENT_MOCK)) as TenantAgentSession
}
