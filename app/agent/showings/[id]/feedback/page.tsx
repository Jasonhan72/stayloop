'use client'

export const runtime = 'edge'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useT } from '@/lib/i18n'

/**
 * V5.3 ART 37 · Field Agent · 看房后反馈表（90 秒反馈）
 * 1-tap reaction + 星级 + 喜欢/顾虑 chip picker + Brief 自动扩写预览。
 */

type Lang = 'zh' | 'en'

const REACTIONS = [
  { emoji: '😊', label: { zh: '喜欢', en: 'Liked it' }, kind: 'green' as const },
  { emoji: '😐', label: { zh: '一般', en: 'So-so' }, kind: 'amber' as const },
  { emoji: '😞', label: { zh: '不合适', en: 'Not a fit' }, kind: 'red' as const },
]

const LIKED = [
  { zh: '主卧采光', en: 'Master bedroom light' },
  { zh: '猫的进出', en: 'Cat access' },
  { zh: '客厅大小', en: 'Living room size' },
  { zh: '通勤距离', en: 'Commute distance' },
  { zh: '健身房', en: 'Gym' },
  { zh: '厨房', en: 'Kitchen' },
]
const CONCERNS = [
  { zh: '楼下吵', en: 'Noise from below' },
  { zh: '浴室小', en: 'Small bathroom' },
  { zh: '价格高', en: 'Price is high' },
  { zh: '阳台', en: 'Balcony' },
]
const NEXT_STEPS = [
  { zh: '想申请', en: 'Wants to apply' },
  { zh: '再考虑', en: 'Still deciding' },
  { zh: '不合适', en: 'Not a fit' },
] as const

const BRIEF_PREVIEW = {
  zh: '"Mia 在 1207 待了约 35 分钟。她非常喜欢主卧朝南采光、客厅尺寸和厨房灯光配置。猫从客厅到厨房有顺畅过道，她说妈妈那只猫会很舒服。顾虑两个：楼下声音她进卧室能听到（中等敏感）；主卫淋浴房尺寸偏小她略有担心。整体表达想申请意向，问到能否谈租金 — 我引导她走 Stayloop 谈判流程。建议 Sarah：批了。匹配度高，长租倾向真实。"',
  en: '"Mia spent about 35 minutes at 1207. She really liked the south-facing master bedroom light, the living room size, and the kitchen lighting setup. The cat has a smooth path from the living room to the kitchen — she said her mom\'s cat would be very comfortable. Two concerns: she can hear noise from below once inside the bedroom (moderately sensitive), and she\'s slightly worried the master ensuite shower stall feels a bit small. Overall she signaled an intent to apply and asked whether rent was negotiable — I steered her into the Stayloop negotiation flow. Recommendation for Sarah: approve. Strong match, genuine long-term intent."',
}

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
  const { lang } = useT()
  const zh = lang === 'zh'
  const [reaction, setReaction] = useState<string>('喜欢')
  const [stars, setStars] = useState(4)
  const [nextStep, setNextStep] = useState<string>('想申请')
  const [briefOpen, setBriefOpen] = useState(false)
  const liked = useToggleSet(['主卧采光', '猫的进出', '客厅大小', '厨房'])
  const concerns = useToggleSet(['楼下吵', '浴室小'])

  return (
    <WorkspaceShell role="agent" hideAside>
      <Link
        href={`/agent/showings/${id}`}
        className="font-mono text-[12px] text-body-3 hover:text-body"
      >
        {zh ? '← 返回看房现场' : '← Back to showing'}
      </Link>

      <div className="mx-auto mt-4 w-full max-w-[430px]">
        <div className="sl-card overflow-hidden p-0">
          <div className="p-5">
            <div className="font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3">
              {zh ? 'UNIT 1207 · MIA CHEN · 看房 ✓ 完成' : 'UNIT 1207 · MIA CHEN · SHOWING ✓ DONE'}
            </div>
            <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">
              {zh
                ? '用 90 秒给反馈 · Brief 帮你扩成完整版本'
                : 'Give feedback in 90 seconds · Brief expands it into a full version'}
            </h1>
            <p className="mt-2 text-[13.5px] text-body-2">
              {zh
                ? '这条反馈会同时发给 Mia + Sarah · 你的语气会被保留'
                : 'This feedback goes to both Mia + Sarah · your tone is preserved'}
            </p>

            {/* 1-tap reactions */}
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {REACTIONS.map((r) => {
                const on = reaction === r.label.zh
                const tone =
                  r.kind === 'green'
                    ? 'border-success/40 bg-success/10 text-success'
                    : r.kind === 'amber'
                      ? 'border-warning/40 bg-warning/10 text-warning'
                      : 'border-danger/40 bg-danger/10 text-danger'
                return (
                  <button
                    key={r.label.en}
                    onClick={() => setReaction(r.label.zh)}
                    className={
                      'flex flex-col items-center gap-1 rounded-xl border py-3 text-[13px] font-bold transition ' +
                      (on ? tone : 'border-line-divider bg-surface-chip text-body-2')
                    }
                  >
                    <span className="text-[22px]">{r.emoji}</span>
                    {r.label[lang]}
                  </button>
                )
              })}
            </div>

            {/* Star rating */}
            <div className="mt-5">
              <div className="font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3">
                {zh ? 'Mia 的整体态度' : "Mia's overall attitude"}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setStars(n)}
                    aria-label={zh ? `${n} 星` : `${n} stars`}
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
                {stars}/5 · {zh ? '喜欢，但有顾虑' : 'Likes it, but has concerns'}
              </div>
            </div>

            {/* Liked chips */}
            <ChipPicker
              label={zh ? 'Mia 喜欢的（点选）' : 'What Mia liked (tap to select)'}
              options={LIKED}
              selected={liked.set}
              onToggle={liked.toggle}
              tone="pro"
              lang={lang}
            />

            {/* Concern chips */}
            <ChipPicker
              label={zh ? 'Mia 顾虑的（点选）' : "Mia's concerns (tap to select)"}
              options={CONCERNS}
              selected={concerns.set}
              onToggle={concerns.toggle}
              tone="con"
              lang={lang}
            />

            {/* Next-step intent */}
            <div className="mt-5">
              <div className="font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3">
                {zh ? '下一步意向' : 'Next-step intent'}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {NEXT_STEPS.map((s) => {
                  const on = nextStep === s.zh
                  return (
                    <button
                      key={s.en}
                      onClick={() => setNextStep(s.zh)}
                      className={
                        'rounded-xl border py-3.5 text-[13px] font-bold transition ' +
                        (on && s.zh === '想申请'
                          ? 'border-success/40 bg-success/[0.06] text-success'
                          : on
                            ? 'border-agent/40 bg-agent/[0.06] text-agent'
                            : 'border-line-divider bg-surface-chip text-body-2')
                      }
                    >
                      {s[lang]}
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
                  {zh
                    ? '📝 Brief 帮你扩成完整版本（你确认才发出）'
                    : '📝 Brief expands it into a full version (sent only after you confirm)'}
                </span>
                <span className="font-mono text-[12px] text-agent">
                  {briefOpen ? (zh ? '收起 ▲' : 'Collapse ▲') : zh ? '展开 ▼' : 'Expand ▼'}
                </span>
              </button>
              {briefOpen && (
                <p className="mt-3 text-[13px] italic leading-relaxed text-body">
                  {BRIEF_PREVIEW[lang]}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-2.5">
              <button className="sl-btn-primary flex-1 rounded-xl py-3.5 text-[14px] font-bold">
                {zh ? '✓ 用这版发出' : '✓ Send this version'}
              </button>
              <button className="rounded-xl border border-line-divider bg-white px-5 py-3.5 text-[14px] font-bold text-body-2">
                {zh ? '改一改' : 'Tweak it'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center font-mono text-[10.5px] text-body-3">
          {zh ? `看房 #${id} · DAVID PARK · FIELD AGENT` : `Showing #${id} · DAVID PARK · FIELD AGENT`}
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
  lang,
}: {
  label: string
  options: { zh: string; en: string }[]
  selected: Set<string>
  onToggle: (v: string) => void
  tone: 'pro' | 'con'
  lang: Lang
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
          const on = selected.has(o.zh)
          return (
            <button
              key={o.en}
              onClick={() => onToggle(o.zh)}
              className={
                'rounded-full border px-3 py-1.5 text-[13px] font-medium transition ' +
                (on ? onClass : 'border-line-divider bg-surface-chip text-body-2')
              }
            >
              {o[lang]}
            </button>
          )
        })}
        <button className="rounded-full border border-dashed border-line-divider bg-white px-3 py-1.5 text-[13px] font-medium text-body-3">
          {lang === 'zh' ? '+ 添加' : '+ Add'}
        </button>
      </div>
    </div>
  )
}
