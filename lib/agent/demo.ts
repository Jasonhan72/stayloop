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
        summary: 'AI 为 Unit 1207 · King West 的房东 Sarah Wang 准备了一份租赁 Passport 摘要 —— 只在你点头后才会发送。',
        recipient_label: 'Sarah Wang · Unit 1207 房东',
        data_scope: ['就业状态', '收入区间', '租赁就绪分', '推荐人状态'],
        excluded_data: ['原始证件', '完整银行流水', '私人备注'],
        risk_level: 'medium',
        expires_at: null,
        metadata: { property_id: 'unit_1207_king_west', prepared_by: 'AI Agent' },
      },
    ],
    result: {
      title: 'AI 今天为你刷了 28 套房',
      body: '基于你的预算 ($2,100–2,400) 和偏好区域,筛掉价格偏高、盖章门槛不匹配、已 dismiss 的房型,留下 4 套真正值得看的。',
    },
  },

  landlord: {
    stage: 'decision',
    completed: ['intake', 'review_inbox', 'screening'],
    memories: [
      { key: 'min_tier', label: '盖章门槛', value: { value: '默认 需收入章 起申 · Unit 1207 提至 需银行章' }, confidence: 1, memory_type: 'preference' },
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
        title: '把 Unit 1207 的电子租约寄给 Mia Chen?',
        summary: 'Mia (已盖 3/4 枚章, 92% match, 信用 758, 月入 $11k) 已通过 3-way 比较。租约草稿基于你批的 Ontario LTB 标准模板 + Unit 1207 特殊条款(宠物押金 $500)。',
        recipient_label: 'Mia Chen · 租客',
        data_scope: ['租约草稿', '起租日 6/1', '12 个月期', '宠物押金 $500'],
        excluded_data: ['你的其他房源数据', '其他申请人资料'],
        risk_level: 'high',
        expires_at: null,
        metadata: { listing: 'Unit 1207 · King West', applicant: 'Mia Chen' },
      },
    ],
    result: {
      title: 'Unit 1207 收到 8 份询盘,我建议先看 3 份',
      body: '已按你设的 需银行章 / 信用 ≥ 720 / DTI ≤ 35% 筛过:3 份完整匹配,1 份只盖到收入章但材料齐全可破例,4 份不达标。',
    },
  },

  agent: {
    stage: 'fieldwork',
    completed: ['intake', 'task_inbox'],
    memories: [
      { key: 'area', label: 'AREA', value: { value: 'Liberty · King West · Annex' }, confidence: 0.9, memory_type: 'preference' },
      { key: 'style', label: 'STYLE', value: { value: '更擅长讲故事 · 喜欢拍照' }, confidence: 0.8, memory_type: 'profile' },
      { key: 'goal', label: 'GOAL', value: { value: '本月目标 $7,200 · 已 $3,840' }, confidence: 1, memory_type: 'profile' },
      { key: 'reco', label: 'RECO', value: { value: '#7892341 · Toronto West · 4.9★ 47 评' }, confidence: 1, memory_type: 'profile' },
    ],
    pending: [
      {
        id: 'demo-agent-1',
        workflow_id: null,
        action_type: 'schedule_viewing',
        title: '接 Sarah 派的带看单：周三 14:00 · King West Unit 1207 · 客户 Mia Chen?',
        summary: 'Sarah Wang 派了一单。客户 Mia Chen (已盖 2/4 枚章)。90 秒决定接不接。下面是 RECO 合规命脉：你被授权 / 不被授权回答的问题清单。',
        recipient_label: 'Mia Chen · 已盖 2/4 枚章 · 客户',
        data_scope: ['✓ 房东授权回答：租金 + 押金细则', '✓ 看房时间 / 钥匙安排', '✓ 房源配套 / 朝向 / 暖通'],
        excluded_data: ['✗ 不授权：房东个人信息', '✗ 不授权：其他申请人资料', '✗ 不授权：替房东谈判或承诺'],
        risk_level: 'low',
        expires_at: null,
        metadata: { client: 'Mia Chen', listing: 'Unit 1207 · King West', landlord: 'Sarah Wang' },
      },
    ],
    result: {
      title: '今天 5 场带看 · 区域排名 #3 (GTA West · 23 经纪)',
      body: '14:00 带 Mia Chen 看 King West Unit 1207 · Carter Court 4F (已 Check-in)· 87 Niagara Loft (已确认)。每场都标了你被授权与未授权回答的问题清单。',
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
