'use client'

import { createContext, useContext, useEffect, useState, useMemo, ReactNode, useCallback } from 'react'

export type Lang = 'zh' | 'en'

const LS_KEY = 'sl-lang'

type Dict = Record<string, { zh: string; en: string }>

// V5 phrase book — keep keys grouped by surface
export const dict: Dict = {
  // ==== HEADER / NAV ====
  'nav.listings':       { zh: '房源', en: 'Listings' },
  'nav.tenant':         { zh: '租客', en: 'Tenant' },
  'nav.landlord':       { zh: '房东', en: 'Landlord' },
  'nav.agent':          { zh: '经纪', en: 'Agent' },
  'nav.screening':      { zh: '审核', en: 'Screening' },
  'nav.trustApi':       { zh: 'Trust API', en: 'Trust API' },
  'nav.pricing':        { zh: '定价', en: 'Pricing' },
  'nav.login':          { zh: '登录', en: 'Sign in' },
  'nav.register':       { zh: '注册', en: 'Sign up' },
  'nav.dashboard':      { zh: '工作台', en: 'Dashboard' },
  'nav.signOut':        { zh: '退出', en: 'Sign out' },
  'nav.notifications':  { zh: '通知', en: 'Notifications' },
  'nav.menu':           { zh: '菜单', en: 'Menu' },
  'nav.settings':       { zh: '设置', en: 'Settings' },

  // ==== HERO (Vol1 ART01) ====
  'hero.eyebrow':       { zh: 'AI · 个人租住代理', en: 'AI · Personal Rental Agent' },
  'hero.title':         { zh: '让租住回到应有的秩序。', en: 'Bring rental back to the order it deserves.' },
  'hero.sub':           {
    zh: '你只需说出需求，其余从找房、申请到签约与后续服务，系统都会协助你轻松完成。每位用户都有自己的个人 AI Agent，读取专属记忆，理解当前进度。关键节点由你确认。',
    en: 'Just tell us what you need. From searching to applying, signing, and post-move-in service, the system handles the rest. Each user gets a personal AI Agent that reads its own memory and understands your progress. Key steps are confirmed by you.',
  },
  'hero.ctaPrimary':    { zh: '开始 · 90 秒完成身份验证', en: 'Start — 90-second ID verify' },
  'hero.ctaPricing':    { zh: '看看定价 →', en: 'See pricing →' },

  'hero.tenantEyebrow':   { zh: 'TENANT · 租客', en: 'TENANT' },
  'hero.tenantTitle':     { zh: '一次验证，处处通行', en: 'Verified once. Trusted everywhere.' },
  'hero.tenantBody':      {
    zh: '创建可复用的 Rental Passport，让你的身份、收入、信用与申请资料在租房流程中被清晰整理、可控分享。',
    en: 'Build a reusable Rental Passport. Your identity, income, credit and application files stay organized and shared on your terms.',
  },
  'hero.tenantArrow':     { zh: '→ 开始找房', en: '→ Start searching' },

  'hero.landlordEyebrow': { zh: 'LANDLORD · 房东', en: 'LANDLORD' },
  'hero.landlordTitle':   { zh: '让出租更清晰，也更可靠', en: 'Renting, made clear and reliable.' },
  'hero.landlordBody':    {
    zh: '从发布房源、筛选申请到准备租约，系统协助整理信息与流程；关键决策始终由你确认。',
    en: 'From listing to screening to lease prep, the system organizes information and flow. Key decisions stay with you.',
  },
  'hero.landlordArrow':   { zh: '→ 发布房源', en: '→ Post a listing' },

  'hero.agentEyebrow':    { zh: 'AGENT · 经纪', en: 'AGENT' },
  'hero.agentTitle':      { zh: '把行政交给系统，把关系留给人', en: 'Hand admin to the system. Keep relationships.' },
  'hero.agentBody':       {
    zh: 'AI 协助整理客户、准备房源材料、安排看房与跟进申请，让经纪专注线下服务、谈判和信任关系。',
    en: 'AI handles client files, listing prep, showings and follow-ups. You focus on people, negotiation, and trust.',
  },
  'hero.agentArrow':      { zh: '→ 加入经纪网络', en: '→ Join the agent network' },

  // ==== FOOTER ====
  'foot.product':       { zh: '产品', en: 'Product' },
  'foot.pricing':       { zh: '定价', en: 'Pricing' },
  'foot.trustApi':      { zh: 'Trust API', en: 'Trust API' },
  'foot.screening':     { zh: 'Screening', en: 'Screening' },
  'foot.passport':      { zh: 'Rental Passport', en: 'Rental Passport' },
  'foot.forWhom':       { zh: '面向用户', en: 'For' },
  'foot.tenants':       { zh: '租客', en: 'Tenants' },
  'foot.landlords':     { zh: '房东', en: 'Landlords' },
  'foot.agents':        { zh: '经纪', en: 'Agents' },
  'foot.partners':      { zh: '合作伙伴 (银行/法务)', en: 'Partners (banks/legal)' },
  'foot.company':       { zh: '关于', en: 'Company' },
  'foot.about':         { zh: '关于我们', en: 'About' },
  'foot.privacy':       { zh: '隐私', en: 'Privacy' },
  'foot.terms':         { zh: '条款', en: 'Terms' },
  'foot.contact':       { zh: '联系', en: 'Contact' },
  'foot.disputes':      { zh: '纠纷仲裁', en: 'Disputes' },
  'foot.tag':           {
    zh: 'Stayloop — 多伦多的可信任租住基础设施。',
    en: 'Stayloop — trusted rental infrastructure for Toronto.',
  },
  'foot.copy':          { zh: '© 2026 Stayloop. 保留所有权利。', en: '© 2026 Stayloop. All rights reserved.' },

  // ==== ONBOARDING (Tier 1) ====
  'onb.hi':             { zh: '我是 Luna。', en: "I'm Luna." },
  'onb.line2':          { zh: '90 秒后你就能开始找房。', en: 'In 90 seconds you can start searching.' },
  'onb.body':           {
    zh: '我先帮你做最基础的身份验证（护照 + 自拍）。之后你可以浏览房源、跟我聊、提交看房意向。',
    en: 'I’ll first run a basic ID check (passport + selfie). After that you can browse listings, chat with me, and submit showing intents.',
  },
  'onb.f1':             { zh: '浏览所有房源 / 询价 / 跟我聊', en: 'Browse all listings · ask about price · chat with me' },
  'onb.f2':             { zh: '提交看房意向（基础级别）', en: 'Submit showing intent (basic tier)' },
  'onb.f3':             { zh: '升级 Tier 不强制 · 随时可调', en: 'Upgrading Tier is optional · adjust any time' },
  'onb.cta1':           { zh: '✓ 开始 · Tier 1 · ~90 秒', en: '✓ Start · Tier 1 · ~90s' },
  'onb.cta2':           { zh: '先看看 Stayloop 怎么用', en: 'See how Stayloop works first' },
  'onb.foot':           { zh: '由 Persona SDK 提供 · 你的资料只属于你', en: 'Powered by Persona SDK · Your data stays yours' },

  // ==== LISTINGS ====
  'listings.title':     { zh: '为你筛选的房源', en: 'Listings curated for you' },
  'listings.searchPh':  { zh: '搜索 City / Neighborhood / 地址 / TTC 站', en: 'Search city, neighborhood, address, or transit' },
  'listings.search':    { zh: '搜索', en: 'Search' },
  'listings.sortBy':    { zh: '排序', en: 'Sort by' },
  'listings.matchScore':{ zh: '匹配度', en: 'Match' },
  'listings.luna':      { zh: 'Luna 推荐', en: 'Luna picks' },
  'listings.applyNow':  { zh: '提交申请', en: 'Apply now' },
  'listings.viewDetail':{ zh: '查看详情', en: 'View detail' },

  // Common
  'common.from':        { zh: '起', en: 'from' },
  'common.month':       { zh: '月', en: '/mo' },
  'common.bd':          { zh: '间', en: 'bd' },
  'common.ba':          { zh: '卫', en: 'ba' },
  'common.viewAll':     { zh: '全部查看', en: 'View all' },
  'common.comingSoon':  { zh: '即将上线', en: 'Coming soon' },
  'common.back':        { zh: '返回', en: 'Back' },
}

interface I18nCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, fallback?: string) => string
  toggle: () => void
}

const Ctx = createContext<I18nCtx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const v = window.localStorage.getItem(LS_KEY) as Lang | null
    if (v === 'zh' || v === 'en') setLangState(v)
    // also reflect on <html lang="...">
    document.documentElement.lang = v ?? 'zh'
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_KEY, l)
      document.documentElement.lang = l
    }
  }, [])

  const toggle = useCallback(() => {
    setLang(lang === 'zh' ? 'en' : 'zh')
  }, [lang, setLang])

  const t = useCallback(
    (key: string, fallback?: string) => {
      const entry = dict[key]
      if (!entry) return fallback ?? key
      return entry[lang] || entry.zh || fallback || key
    },
    [lang]
  )

  const value = useMemo(() => ({ lang, setLang, t, toggle }), [lang, setLang, t, toggle])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const v = useContext(Ctx)
  if (!v) {
    // Allow components to be rendered outside the provider during SSR
    return {
      lang: 'zh' as Lang,
      setLang: () => {},
      toggle: () => {},
      t: (key: string, fallback?: string) => dict[key]?.zh ?? fallback ?? key,
    }
  }
  return v
}
