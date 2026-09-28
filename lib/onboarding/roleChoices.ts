// First-sign-in identity choice (V0.7, 2026-09-27).
//
// The homepage's "三步开始" promises「选身份，给助手起个名字」, but an account
// created from the homepage login card carries no role intent (the role
// pages pass ?role=, the card cannot), so /onboarding/name used to default
// that person to tenant without asking. This is the list it asks with: pure
// data, read by the page, the chooser component and the guards alike, so
// the copy can never drift from what ships.
import type { AgentRole } from '@/lib/agent/types'

export type OnboardingRole = AgentRole | 'provider'
export type Bi = { zh: string; en: string }

export type RoleChoice = {
  key: OnboardingRole
  label: Bi
  /** one line on what this identity gets — only what is live */
  blurb: Bi
  /** where the first step lands, in words (no page path promised) */
  lands: Bi
  /** the provider network is a Toronto pilot */
  pilot?: boolean
}

export const ROLE_CHOICES: RoleChoice[] = [
  {
    key: 'tenant',
    label: { zh: '租客', en: 'Tenant' },
    blurb: { zh: '找房、申请、签约、入住；材料交一次，处处通行。', en: 'Search, apply, sign, move in; submit your documents once and reuse them everywhere.' },
    lands: { zh: '助手对话 · 找房 · 申请 · 租约', en: 'assistant chat · search · apply · lease' },
  },
  {
    key: 'landlord',
    label: { zh: '房东', en: 'Landlord' },
    blurb: { zh: '筛查申请、起草租约、维修派单；会影响到别人的事，先给你看再执行。', en: 'Screen applications, draft leases, dispatch repairs; anything that reaches another person waits for your approval.' },
    lands: { zh: '开通房东身份 · 筛查 · 租约 · 维修', en: 'landlord hat · screening · leases · repairs' },
  },
  {
    key: 'agent',
    label: { zh: '经纪', en: 'Agent' },
    blurb: { zh: '客户表、定价、带看准备、合规边界；需要先核验 RECO 注册。', en: 'Client book, pricing, showing prep, compliance boundaries; your RECO registration is verified first.' },
    lands: { zh: '先核验 RECO 注册', en: 'RECO registration check first' },
  },
  {
    key: 'provider',
    pilot: true,
    label: { zh: '服务商', en: 'Provider' },
    blurb: { zh: '接多伦多出租房的维修工单：先核资质，再收派单；线下结算，不抽成。', en: 'Repair work orders from Toronto rentals: credentials verified first, then dispatches; settled offline, no commission.' },
    lands: { zh: '入驻与资质', en: 'onboarding & credentials' },
  },
]

/** A provider has no assistant page yet — its first step is the onboarding form. */
export const PROVIDER_ONBOARD = '/provider/onboard'

export const isAgentRole = (v: unknown): v is AgentRole => v === 'tenant' || v === 'landlord' || v === 'agent'
export const isOnboardingRole = (v: unknown): v is OnboardingRole => isAgentRole(v) || v === 'provider'
