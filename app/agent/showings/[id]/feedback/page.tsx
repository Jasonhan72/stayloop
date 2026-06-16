'use client'

export const runtime = 'edge'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'

/**
 * V5.3 ART 37 · Field Agent · 看房后反馈表（90 秒反馈）
 * 1-tap reaction + 星级 + 喜欢/顾虑 chip picker + Brief 自动扩写预览。
 */

const REACTIONS = [
  { emoji: '😊', label: '喜欢', kind: 'green' as const },
  { emoji: '😐', label: '一般', kind: 'amber' as const },
  { emoji: '😞', label: '不合适', kind: 'red' as const },
]

const LIKED = ['主卧采光', '猫的进出', '客厅大小', '通勤距离', '健身房', '厨房']
const CONCERNS = ['楼下吵', '浴室小', '价格高', '阳台']
const NEXT_STEPS = ['想申请', '再考虑', '不合适'] as const

const BRIEF_PREVIEW =
  '"Mia 在 1207 待了约 35 分钟。她非常喜欢主卧朝南采光、客厅尺寸和厨房灯光配置。猫从客厅到厨房有顺畅过道，她说妈妈那只猫会很舒服。顾虑两个：楼下声音她进卧室能听到（中等敏感）；主卫淋浴房尺寸偏小她略有担心。整体表达想申请意向，问到能否谈租金 — 我引导她走 Stayloop 谈判流程。建议 Sarah：批了。匹配度高，长租倾向真实。"'

function useToggleSet(initial: string[]) {
  const [set, setSet] = useState<Set<string>>(new Set(initial))
  const toggle = (v: string) =>
    setSet((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  return { set, toggle }
}

export default function ShowingFeedbackPage() {
  const { id } = useParams<{ id: string }>()
  const [reaction, setReaction] = useState<string>('喜欢')
  const [stars, setStars] = useState(4)
  const [nextStep, setNextStep] = useState<(typeof NEXT_STEPS)[number]>('想申请')
  const [briefOpen, setBriefOpen] = useState(false)
  const liked = useToggleSet(['主卧采光', '猫的进出', '客厅大小', '厨房'])
  const concerns = useToggleSet(['楼下吵', '浴室小'])

  return (
    <WorkspaceShell role="agent" hideAside>
      <Link
        href={`/agent/showings/${id}`}
        className="font-mono text-[12px] text-body-3 hover:text-body"
      >
        ← 返回看房现场
      </Link>

      <div className="mx-auto mt-4 w-full max-w-[430px]">
        <div className="sl-card overflow-hidden p-0">
          <div className="p-5">
            <div className="font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3">
              UNIT 1207 · MIA CHEN · 看房 ✓ 完成
            </div>
            <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">
              用 90 秒给反馈 · Brief 帮你扩成完整版本
            </h1>
            <p className="mt-2 text-[13.5px] text-body-2">
              这条反馈会同时发给 Mia + Sarah · 你的语气会被保留
            </p>

            {/* 1-tap reactions */}
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {REACTIONS.map((r) => {
                const on = reaction === r.label
                const tone =
                  r.kind === 'green'
                    ? 'border-success/40 bg-success/10 text-success'
                    : r.kind === 'amber'
                      ? 'border-warning/40 bg-warning/10 text-warning'
                      : 'border-danger/40 bg-danger/10 text-danger'
                return (
                  <button
                    key={r.label}
                    onClick={() => setReaction(r.label)}
                    className={
                      'flex flex-col items-center gap-1 rounded-xl border py-3 text-[13px] font-bold transition ' +
                      (on ? tone : 'border-line-divider bg-surface-chip text-body-2')
                    }
                  >
                    <span className="text-[22px]">{r.emoji}</span>
                    {r.label}
                  </button>
                )
              })}
            </div>

            {/* Star rating */}
            <div className="mt-5">
              <div className="font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3">
                Mia 的整体态度
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setStars(n)}
                    aria-label={`${n} 星`}
                    className={
                      'text-[26px] leading-none transition ' +
                      (n <= stars ? 'text-warning' : 'text-line-divider')
                    }
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[11.5px] text-body-3">
                {stars}/5 · 喜欢，但有顾虑
              </div>
            </div>

            {/* Liked chips */}
            <ChipPicker
              label="Mia 喜欢的（点选）"
              options={LIKED}
              selected={liked.set}
              onToggle={liked.toggle}
              tone="pro"
            />

            {/* Concern chips */}
            <ChipPicker
              label="Mia 顾虑的（点选）"
              options={CONCERNS}
              selected={concerns.set}
              onToggle={concerns.toggle}
              tone="con"
            />

            {/* Next-step intent */}
            <div className="mt-5">
              <div className="font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3">
                下一步意向
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {NEXT_STEPS.map((s) => {
                  const on = nextStep === s
                  return (
                    <button
                      key={s}
                      onClick={() => setNextStep(s)}
                      className={
                        'rounded-xl border py-3.5 text-[13px] font-bold transition ' +
                        (on && s === '想申请'
                          ? 'border-success/40 bg-success/[0.06] text-success'
                          : on
                            ? 'border-agent/40 bg-agent/[0.06] text-agent'
                            : 'border-line-divider bg-surface-chip text-body-2')
                      }
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Brief auto-expand preview */}
            <div className="mt-5 rounded-xl border border-agent/20 bg-agent/[0.04] p-4">
              <button
                onClick={() => setBriefOpen((v) => !v)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-[13px] font-bold text-agent">
                  📝 Brief 帮你扩成完整版本（你确认才发出）
                </span>
                <span className="font-mono text-[12px] text-agent">
                  {briefOpen ? '收起 ▲' : '展开 ▼'}
                </span>
              </button>
              {briefOpen && (
                <p className="mt-3 text-[13px] italic leading-relaxed text-body">
                  {BRIEF_PREVIEW}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-2.5">
              <button className="sl-btn-primary flex-1 rounded-xl py-3.5 text-[14px] font-bold">
                ✓ 用这版发出
              </button>
              <button className="rounded-xl border border-line-divider bg-white px-5 py-3.5 text-[14px] font-bold text-body-2">
                改一改
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center font-mono text-[10.5px] text-body-3">
          看房 #{id} · DAVID PARK · FIELD AGENT
        </div>
      </div>
    </WorkspaceShell>
  )
}

function ChipPicker({
  label,
  options,
  selected,
  onToggle,
  tone,
}: {
  label: string
  options: string[]
  selected: Set<string>
  onToggle: (v: string) => void
  tone: 'pro' | 'con'
}) {
  const onClass =
    tone === 'pro'
      ? 'border-success/40 bg-success/10 text-success'
      : 'border-danger/40 bg-danger/10 text-danger'
  return (
    <div className="mt-5">
      <div className="font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.has(o)
          return (
            <button
              key={o}
              onClick={() => onToggle(o)}
              className={
                'rounded-full border px-3 py-1.5 text-[13px] font-medium transition ' +
                (on ? onClass : 'border-line-divider bg-surface-chip text-body-2')
              }
            >
              {o}
            </button>
          )
        })}
        <button className="rounded-full border border-dashed border-line-divider bg-white px-3 py-1.5 text-[13px] font-medium text-body-3">
          + 添加
        </button>
      </div>
    </div>
  )
}
