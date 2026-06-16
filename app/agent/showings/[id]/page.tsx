'use client'

export const runtime = 'edge'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'

/**
 * V5.3 ART 28 · Field Agent · 看房现场（Mobile）
 * David Park 现场带看 · 秒级响应 · 单手操作 · RECO 授权回答合规核心。
 */

interface QA {
  q: string
  a: string
  authorized: boolean
}

const QAS: QA[] = [
  {
    q: '"水电包不包？"',
    a: '✓ 房东授权回答：水包 · 电不包（约 $80/月）· 暖气中央供应包',
    authorized: true,
  },
  {
    q: '"邻居吵不吵？"',
    a: '✓ 房东授权回答：右边是退休老夫妇 · 楼上是 Shopify 工程师 · 整栋禁止 Airbnb',
    authorized: true,
  },
  {
    q: '"你能不能再降 100？"',
    a: '✗ 不授权 · 让 Mia 走 Stayloop 谈判流程 · Logic 会给 Sarah 评估',
    authorized: false,
  },
]

const PREFS = [
  { label: '客户偏好', tone: 'plain' as const },
  { label: '猫友好', tone: 'green' as const },
  { label: '长租 2 年', tone: 'blue' as const },
  { label: '中英双语', tone: 'purple' as const },
]

const TAPS = [
  { emoji: '😊', label: '喜欢', kind: 'green' as const },
  { emoji: '😐', label: '一般', kind: 'amber' as const },
  { emoji: '😞', label: '不合适', kind: 'red' as const },
  { emoji: '📝', label: '写详细', kind: 'plain' as const },
]

const CHIP_TONE: Record<string, string> = {
  plain: 'border-line-divider bg-surface-chip text-body-2',
  green: 'border-success/30 bg-success/10 text-success',
  blue: 'border-agent/30 bg-agent/10 text-agent',
  purple: 'border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#7C3AED]',
}

export default function ShowingLivePage() {
  const { id } = useParams<{ id: string }>()
  return (
    <WorkspaceShell role="agent" hideAside>
      <Link href="/agent/calendar" className="font-mono text-[12px] text-body-3 hover:text-body">
        ← 返回日历
      </Link>

      <div className="mx-auto mt-4 w-full max-w-[430px]">
        {/* Mobile frame */}
        <div className="overflow-hidden rounded-[28px] border border-line-divider bg-white shadow-[0_18px_48px_rgba(0,0,0,0.14)]">
          {/* Status bar */}
          <div className="flex items-center justify-between bg-[#0B0B0E] px-5 py-2 font-mono text-[11px] text-white">
            <span>14:23</span>
            <span>● ● ● 📶 100%</span>
          </div>

          {/* Showing header */}
          <div className="bg-agent px-5 py-5 text-white">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-white/80">
              ⏱ 现在 · KING WEST UNIT 1207
            </div>
            <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">带看 · 客户 Mia Chen</h1>
            <div className="mt-1 font-mono text-[11.5px] text-white/80">
              认证 2 级 · $80 已 Stripe 预授权
            </div>
            <div className="mt-1 font-mono text-[11.5px] text-white/70">
              已 Check-in 23 分钟 · $80 即将释放
            </div>
          </div>

          {/* Client context chips */}
          <div className="flex gap-2 overflow-x-auto border-b border-line-divider px-5 py-3">
            {PREFS.map((p) => (
              <span
                key={p.label}
                className={
                  'whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-medium ' +
                  CHIP_TONE[p.tone]
                }
              >
                {p.label}
              </span>
            ))}
          </div>

          {/* RECO authorization Q&A — compliance core */}
          <div className="px-5 pt-4">
            <div className="font-mono text-[10.5px] uppercase tracking-eyebrowLg text-body-3">
              Mia 可能问的
            </div>
          </div>
          <div className="space-y-2.5 px-5 pb-2 pt-3">
            {QAS.map((qa) => (
              <div
                key={qa.q}
                className={
                  'rounded-xl border p-3.5 ' +
                  (qa.authorized
                    ? 'border-line-divider bg-surface-muted'
                    : 'border-danger/30 bg-danger/[0.04]')
                }
              >
                <div className="text-body-2 text-[14px] font-semibold">{qa.q}</div>
                <div
                  className={
                    'mt-1.5 text-[12px] leading-relaxed ' +
                    (qa.authorized ? 'text-body-2' : 'text-danger')
                  }
                >
                  {qa.a}
                </div>
                <div
                  className={
                    'mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ' +
                    (qa.authorized
                      ? 'bg-success/10 text-success'
                      : 'bg-danger/10 text-danger')
                  }
                >
                  {qa.authorized ? '✓ 授权回答' : '✗ 不授权回答'}
                </div>
              </div>
            ))}
          </div>

          {/* 1-tap feedback CTA band */}
          <div className="border-y border-line-divider bg-surface-muted px-5 py-3.5">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-agent">
              看完后 1-tap 反馈
            </div>
          </div>

          {/* 1-tap reaction pills */}
          <div className="grid grid-cols-2 gap-2.5 px-5 py-4">
            {TAPS.map((t) => {
              const tone =
                t.kind === 'green'
                  ? 'border-success/30 bg-success/[0.06] text-success'
                  : t.kind === 'amber'
                    ? 'border-warning/30 bg-warning/[0.06] text-warning'
                    : t.kind === 'red'
                      ? 'border-danger/30 bg-danger/[0.06] text-danger'
                      : 'border-line-divider bg-surface-chip text-body-2'
              return (
                <Link
                  key={t.label}
                  href={`/agent/showings/${id}/feedback`}
                  className={
                    'flex items-center justify-center gap-2 rounded-xl border py-3.5 text-[14px] font-bold ' +
                    tone
                  }
                >
                  <span className="text-[18px]">{t.emoji}</span>
                  {t.label}
                </Link>
              )
            })}
          </div>

          {/* Helper note */}
          <div className="bg-white px-5 pb-5 text-[11.5px] leading-relaxed text-body-3">
            反馈直接发给 Mia + Sarah · 你不需要写长文。Brief 帮你扩成完整反馈。
          </div>

          {/* Link to feedback subpage */}
          <div className="border-t border-line-divider bg-white px-5 py-4">
            <Link
              href={`/agent/showings/${id}/feedback`}
              className="flex items-center justify-center gap-2 rounded-xl bg-agent py-3.5 text-[14px] font-bold text-white"
            >
              用 90 秒给反馈 →
            </Link>
          </div>
        </div>

        <div className="mt-4 text-center font-mono text-[10.5px] text-body-3">
          看房 #{id} · DAVID PARK · FIELD AGENT
        </div>
      </div>
    </WorkspaceShell>
  )
}
