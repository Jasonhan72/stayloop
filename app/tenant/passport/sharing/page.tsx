'use client'

import { useState } from 'react'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useT } from '@/lib/i18n'

type Bi = { zh: string; en: string }

interface Grant {
  id: string
  name: string
  initial: string
  color: string
  role: Bi
  time: Bi
  scopes: Bi
  expiry: Bi | null
  systemLevel: boolean
}

const GRANTS: Grant[] = [
  {
    id: 'sarah',
    name: 'Sarah Wang',
    initial: 'S',
    color: '#F97316',
    role: { zh: '房东 · Unit 1207 King West', en: 'Landlord · Unit 1207 King West' },
    time: { zh: '2026/05/02 14:30 授权', en: 'Authorized 2026/05/02 14:30' },
    scopes: { zh: '身份 + 收入章数据 · 雇主验证 · 偏好 · 回复语气', en: 'Identity + income stamp data · employer verification · preferences · reply tone' },
    expiry: null,
    systemLevel: false,
  },
  {
    id: 'david',
    name: 'David Park',
    initial: 'D',
    color: '#3B82F6',
    role: { zh: 'Field Agent · 看房', en: 'Field Agent · Showing' },
    time: { zh: '2026/05/03 11:48 授权 · 临时', en: 'Authorized 2026/05/03 11:48 · temporary' },
    scopes: { zh: '偏好 · 方式 · 看房问题清单', en: 'Preferences · approach · showing question list' },
    expiry: { zh: '看房后自动撤销', en: 'Auto-revokes after showing' },
    systemLevel: false,
  },
  {
    id: 'persona',
    name: 'Persona SDK',
    initial: 'P',
    color: '#8B5CF6',
    role: { zh: '身份验证服务', en: 'Identity verification service' },
    time: { zh: '2026/04/28 · 永久加密存储', en: '2026/04/28 · permanent encrypted storage' },
    scopes: { zh: '护照/驾照 + 自拍 (仅用于身份核验)', en: 'Passport/licence + selfie (identity verification only)' },
    expiry: null,
    systemLevel: true,
  },
  {
    id: 'flinks',
    name: 'Flinks',
    initial: 'F',
    color: '#10B981',
    role: { zh: '银行 API · 收入验证', en: 'Banking API · Income verification' },
    time: { zh: '2026/05/04 10:21 授权', en: 'Authorized 2026/05/04 10:21' },
    scopes: { zh: '银行章 · 收入与稳定性核验', en: 'Bank stamp · income and stability verification' },
    expiry: { zh: '90 天后过期', en: 'Expires in 90 days' },
    systemLevel: false,
  },
]

export default function PassportSharing() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [revoking, setRevoking] = useState<string | null>(null)
  const [revoked, setRevoked] = useState<Set<string>>(new Set())

  const handleRevoke = (id: string) => {
    setRevoking(id)
    setTimeout(() => {
      setRevoked((prev) => new Set(prev).add(id))
      setRevoking(null)
    }, 800)
  }

  const activeGrants = GRANTS.filter((g) => !revoked.has(g.id))

  return (
    <WorkspaceShell role="tenant" hideAside>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div>
          <Link
            href="/tenant/passport"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-tenant hover:underline mb-3"
          >
            ← {zh ? '返回 Passport' : 'Back to Passport'}
          </Link>
          <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight">
            {zh ? '授权管理' : 'Manage Authorizations'}
          </h1>
          <p className="mt-1.5 max-w-[560px] text-[14px] leading-relaxed text-body-2">
            {zh
              ? '以下人员和服务可以访问你的 Passport 数据。撤销后 30 秒内生效，对方系统立即删除缓存。'
              : 'These people and services can access your Passport data. Revocation takes effect within 30 seconds.'}
          </p>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="sl-card px-4 py-4 text-center">
            <div className="text-[24px] font-bold text-tenant">{activeGrants.length}</div>
            <div className="mt-0.5 text-[11.5px] text-body-3">{zh ? '活跃授权' : 'Active'}</div>
          </div>
          <div className="sl-card px-4 py-4 text-center">
            <div className="text-[24px] font-bold">3</div>
            <div className="mt-0.5 text-[11.5px] text-body-3">{zh ? '本月查询' : 'This month'}</div>
          </div>
          <div className="sl-card px-4 py-4 text-center">
            <div className="text-[24px] font-bold">{revoked.size}</div>
            <div className="mt-0.5 text-[11.5px] text-body-3">{zh ? '已撤销' : 'Revoked'}</div>
          </div>
        </div>

        {/* ── Active grants ── */}
        <div className="space-y-3">
          {activeGrants.map((g) => (
            <div key={g.id} className="sl-card p-5">
              <div className="flex items-start gap-4">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
                  style={{ background: g.color }}
                >
                  {g.initial}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-bold">{g.name}</span>
                    <span className="text-[12.5px] text-body-3">{g.role[lang]}</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-body-3">{g.time[lang]}</div>
                  <div className="mt-2.5 text-[13px] text-body-2">
                    <span className="font-semibold text-tenant">{zh ? '可见范围：' : 'Scopes: '}</span>
                    {g.scopes[lang]}
                  </div>
                  {g.expiry && (
                    <div className="mt-1 text-[12px] text-body-3">
                      ⏱ {g.expiry[lang]}
                    </div>
                  )}
                </div>
                <div className="shrink-0 pt-1">
                  {g.systemLevel ? (
                    <span className="text-[11.5px] font-mono text-body-3">
                      {zh ? '系统级' : 'System'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRevoke(g.id)}
                      disabled={revoking === g.id}
                      className="rounded-lg border border-danger/30 px-3 py-1.5 text-[12.5px] font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-50"
                    >
                      {revoking === g.id
                        ? (zh ? '撤销中…' : 'Revoking…')
                        : (zh ? '撤销' : 'Revoke')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Revoked section ── */}
        {revoked.size > 0 && (
          <div>
            <h3 className="text-[14px] font-bold text-body-3 mb-3">
              {zh ? '已撤销' : 'Revoked'}
            </h3>
            <div className="space-y-2">
              {GRANTS.filter((g) => revoked.has(g.id)).map((g) => (
                <div key={g.id} className="flex items-center gap-3 rounded-xl bg-surface-chip px-4 py-3 opacity-60">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{ background: g.color }}
                  >
                    {g.initial}
                  </span>
                  <span className="text-[13.5px] font-semibold line-through">{g.name}</span>
                  <span className="ml-auto text-[11px] font-mono text-body-3">
                    {zh ? '已撤销' : 'Revoked'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Info ── */}
        <div className="rounded-xl border border-dashed border-line-strong bg-surface-chip px-5 py-4">
          <p className="text-[12.5px] leading-relaxed text-body-2">
            🔐{' '}
            {zh
              ? '每次数据访问都记录在审计日志中。撤销后对方无法再调用 Trust API 获取你的验证状态。'
              : 'Every data access is recorded in the audit log. After revocation, the party can no longer query your verification status via Trust API.'}
          </p>
          <Link href="/tenant/audit" className="mt-2 inline-block text-[12.5px] font-semibold text-tenant hover:underline">
            {zh ? '查看审计日志 →' : 'View audit log →'}
          </Link>
        </div>
      </div>
    </WorkspaceShell>
  )
}
