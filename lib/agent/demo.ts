// Local demo session — used when no auth user is present (marketing preview)
// or before the agent-core migration is applied. Mirrors the seed data in
// 20260606_agent_core.sql so the live and demo experiences match. Role-aware.
import type { AgentRole, AgentSessionResponse, MemoryItem, PendingAction } from './types'
import { ROLE_META, buildRecommendations } from './orchestrator'

type RoleDemo = {
  stage: string
  completed: string[]
  memories: MemoryItem[]
  pending: Omit<PendingAction, 'user_id' | 'role' | 'created_at' | 'requires_approval' | 'status'>[]
  result: { title: string; body: string }
}

const DEMO: Record<AgentRole, RoleDemo> = {
  tenant: {
    stage: 'shortlist_and_apply',
    completed: ['intake', 'preference_collection', 'passport_readiness'],
    memories: [
      { key: 'budget', label: '预算', value: { min: 2100, max: 2400, currency: 'CAD' }, confidence: 0.9, memory_type: 'preference' },
      { key: 'preferred_areas', label: '区域', value: { areas: ['Downtown', 'Midtown', 'North York'] }, confidence: 0.8, memory_type: 'preference' },
      { key: 'home_type', label: '户型', value: { beds: 1, in_unit_laundry: true, quiet: true }, confidence: 0.8, memory_type: 'preference' },
      { key: 'move_in_date', label: '入住', value: { target: '2026-09-01', flexible: true }, confidence: 0.7, memory_type: 'constraint' },
      { key: 'transit', label: '通勤', value: { requires_transit: true, max_walk_minutes: 12 }, confidence: 0.85, memory_type: 'preference' },
    ],
    pending: [
      {
        id: 'demo-tenant-1',
        workflow_id: null,
        action_type: 'share_passport_summary',
        title: '批准分享你的 Passport 摘要',
        summary: 'Luna 为 123 King St W 的房东准备了一份租赁 Passport 摘要 —— 只在你点头后才会发送。',
        recipient_label: '123 King St W 的房东',
        data_scope: ['就业状态', '收入区间', '租赁就绪分', '推荐人状态'],
        excluded_data: ['原始证件', '完整银行流水', '私人备注'],
        risk_level: 'medium',
        expires_at: null,
        metadata: { property_id: 'demo_property_123_king', prepared_by: 'Luna' },
      },
    ],
    result: {
      title: 'Luna 今天为你刷了 28 套房',
      body: '基于你的预算 ($2,100–2,400) 和偏好区域,筛掉价格偏高、Tier 不匹配、已 dismiss 的房型,留下 4 套真正值得看的。',
    },
  },

  landlord: {
    stage: 'decision',
    completed: ['intake', 'review_inbox', 'screening'],
    memories: [
      { key: 'min_tier', label: 'TIER', value: { value: '默认 Tier 3 起申 · 88 Harbour 提至 T3' }, confidence: 1, memory_type: 'preference' },
      { key: 'min_credit', label: 'CREDIT', value: { value: '最低 720 · 低于自动降级提示' }, confidence: 1, memory_type: 'constraint' },
      { key: 'dti', label: 'DTI', value: { value: '租金 / 收入 ≤ 35%' }, confidence: 1, memory_type: 'constraint' },
      { key: 'pets', label: 'PETS', value: { value: '猫 ✓ · 狗仅小型 + $500 押金' }, confidence: 0.9, memory_type: 'preference' },
      { key: 'term', label: 'TERM', value: { value: '12 个月起 · 拒绝 < 6 个月' }, confidence: 1, memory_type: 'preference' },
    ],
    pending: [
      {
        id: 'demo-landlord-1',
        workflow_id: null,
        action_type: 'send_lease',
        title: '把 88 Harbour 的电子租约寄给 Mia Wang?',
        summary: 'Mia (Tier 3, 92% match, 信用 758, 月入 $11k) 已通过 3-way 比较。租约草稿基于你 5/1 批的模板 + 88 Harbour 特殊条款(宠物押金 $500)。',
        recipient_label: 'Mia Wang · 租客',
        data_scope: ['租约草稿', '起租日 5/22', '12 个月期', '宠物押金 $500'],
        excluded_data: ['你的其他房源数据', '其他申请人资料'],
        risk_level: 'high',
        expires_at: null,
        metadata: { listing: '88 Harbour St', applicant: 'Mia Wang' },
      },
    ],
    result: {
      title: '88 Harbour 收到 7 份意向,我建议先看 3 份',
      body: '已按你设的 Tier 3 / 信用 ≥ 720 / DTI ≤ 35% 筛过:3 份完整匹配,1 份 Tier 2 但材料齐全可破例,3 份不达标。',
    },
  },

  agent: {
    stage: 'fieldwork',
    completed: ['intake', 'task_inbox'],
    memories: [
      { key: 'area', label: 'AREA', value: { value: 'Liberty · King West · Annex' }, confidence: 0.9, memory_type: 'preference' },
      { key: 'style', label: 'STYLE', value: { value: '更擅长讲故事 · 喜欢拍照' }, confidence: 0.8, memory_type: 'profile' },
      { key: 'goal', label: 'GOAL', value: { value: '本月目标 $7,200 · 已 $1,840' }, confidence: 1, memory_type: 'profile' },
    ],
    pending: [
      {
        id: 'demo-agent-1',
        workflow_id: null,
        action_type: 'schedule_viewing',
        title: '替 Karen Liu 约 Distillery 区下周末看房?',
        summary: 'Karen (来自 Stayloop 推荐) 想看 Distillery 区。我可按你日历空档发出 3 个备选时段,确认前不发任何消息给房东。',
        recipient_label: 'Karen Liu · 新客户',
        data_scope: ['你的可约时段', '房源地址', '看房须知'],
        excluded_data: ['你的佣金分成比例', '其他客户安排'],
        risk_level: 'low',
        expires_at: null,
        metadata: { client: 'Karen Liu', area: 'Distillery' },
      },
    ],
    result: {
      title: '今天 3 场看房 · $340 已结算 · 2 个客户在等回复',
      body: '11:00 带 Mia 看 88 Harbour(Zoom)· 14:30 Liberty Village 现场 · 17:00 为 432 Brunswick 拍照整理 Listing。每场都标了你被授权与未授权的动作。',
    },
  },
}

export function demoSession(role: AgentRole = 'tenant'): AgentSessionResponse {
  const now = new Date().toISOString()
  const d = DEMO[role]
  const workflow = {
    workflow_type: ROLE_META[role].workflowType,
    workflow_id: null,
    current_stage: d.stage,
    completed_steps: d.completed,
    status: 'active' as const,
  }

  return {
    session: { id: 'demo-session', user_id: 'demo-user', agent_config_id: 'demo-config', role, status: 'active', started_at: now },
    agent: {
      id: 'demo-config', user_id: 'demo-user', agent_name: ROLE_META[role].name, role,
      tone: 'clear_supportive', model_tier: 'standard', automation_level: 'approval_required', memory_enabled: true,
    },
    workflow,
    status: 'approval',
    memories: d.memories,
    pendingActions: d.pending.map((p) => ({
      ...p, user_id: 'demo-user', role, status: 'pending' as const, requires_approval: true, created_at: now,
    })),
    latestResult: { ...d.result, kind: 'summary' },
    recommendations: buildRecommendations(role, workflow),
  }
}
