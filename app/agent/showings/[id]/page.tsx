'use client'

export const runtime = 'edge'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'

/**
 * V5.3 ART 28 · Field Agent · 看房现场（Mobile）
 * 现场带看 · 秒级响应 · 单手操作 · RECO 授权回答合规核心。
 */

interface QA {
  q: { zh: string; en: string }
  a: { zh: string; en: string }
  authorized: boolean
}

const QAS: QA[] = [
  {
    q: { zh: '"水电包不包？"', en: '"Are utilities included?"' },
    a: { zh: '✓ 房东授权回答：水包 · 电不包（约 $80/月）· 暖气中央供应包', en: '✓ Landlord-authorized answer: water included · hydro not included (~$80/mo) · central heating included' },
    authorized: true,
  },
  {
    q: { zh: '"邻居吵不吵？"', en: '"Are the neighbours noisy?"' },
    a: { zh: '✓ 房东授权回答：右边是退休老夫妇 · 楼上是 Shopify 工程师 · 整栋禁止 Airbnb', en: '✓ Landlord-authorized answer: a retired couple to the right · a Shopify engineer upstairs · Airbnb banned building-wide' },
    authorized: true,
  },
  {
    q: { zh: '"你能不能再降 100？"', en: '"Can you knock off another 100?"' },
    a: { zh: '✗ 不授权 · 让 Mia 走 Stayloop 谈判流程 · 房东的 AI 会给 Sarah 评估', en: "✗ Not authorized · route Mia through the Stayloop negotiation flow · the landlord's AI will assess for Sarah" },
    authorized: false,
  },
]

// The calendar links six distinct showings here. Every one of them used to
// render Mia Chen at Unit 1207, so an agent tapping Anna's Brunswick Ave
// showing saw another client's name, stamps and unit. Keyed by the same slugs
// the calendar emits; the 1207 case stays the default for an unknown slug.
interface Showing {
  client: string
  stamps: number
  unit: { zh: string; en: string }
}

const SHOWINGS: Record<string, Showing> = {
  'sh-1207-mia': { client: 'Mia Chen', stamps: 3, unit: { zh: 'KING WEST UNIT 1207', en: 'KING WEST UNIT 1207' } },
  'sh-brunswick-anna': { client: 'Anna L.', stamps: 3, unit: { zh: 'BRUNSWICK AVE', en: 'BRUNSWICK AVE' } },
  'sh-cumberland-eric': { client: 'Eric K.', stamps: 4, unit: { zh: '155 CUMBERLAND', en: '155 CUMBERLAND' } },
  'sh-sumach-sophie': { client: 'Sophie B.', stamps: 1, unit: { zh: '210 SUMACH', en: '210 SUMACH' } },
  'sh-distillery-david': { client: 'David Z.', stamps: 3, unit: { zh: 'DISTILLERY 1207', en: 'DISTILLERY 1207' } },
  'sh-hanna-yuki': { client: 'Yuki M.', stamps: 2, unit: { zh: 'HANNA AVE LOFT', en: 'HANNA AVE LOFT' } },
}

const PREFS = [
  { label: { zh: '客户偏好', en: 'Client prefs' }, tone: 'plain' as const },
  { label: { zh: '猫友好', en: 'Cat-friendly' }, tone: 'green' as const },
  { label: { zh: '长租 2 年', en: '2-year lease' }, tone: 'blue' as const },
  { label: { zh: '中英双语', en: 'Bilingual EN/ZH' }, tone: 'purple' as const },
]

const TAPS = [
  { emoji: '😊', label: { zh: '喜欢', en: 'Liked it' }, kind: 'green' as const },
  { emoji: '😐', label: { zh: '一般', en: 'So-so' }, kind: 'amber' as const },
  { emoji: '😞', label: { zh: '不合适', en: 'Not a fit' }, kind: 'red' as const },
  { emoji: '📝', label: { zh: '写详细', en: 'Write detail' }, kind: 'plain' as const },
]

const CHIP_TONE: Record<string, string> = {
  plain: 'border-line-divider bg-surface-chip text-body-2',
  green: 'border-success/30 bg-success/10 text-success',
  blue: 'border-agent/30 bg-agent/10 text-agent',
  purple: 'border-[#1B1B3C]/30 bg-[#1B1B3C]/10 text-[#1B1B3C]',
}

export default function ShowingLivePage() {
  const { id } = useParams<{ id: string }>()
  const { lang } = useT()
  const zh = lang === 'zh'
  const aiName = useAIName('agent')
  const showing = SHOWINGS[id] ?? SHOWINGS['sh-1207-mia']
  return (
    <WorkspaceShell role="agent" hideAside>
      <Link href="/agent/calendar" className="font-mono text-[12px] text-body-3 hover:text-body">
        {zh ? '← 返回日历' : '← Back to calendar'}
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
              {zh ? `⏱ 现在 · ${showing.unit.zh}` : `⏱ NOW · ${showing.unit.en}`}
            </div>
            <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">
              {zh ? `带看 · 客户 ${showing.client}` : `Showing · Client ${showing.client}`}
            </h1>
            <div className="mt-1 font-mono text-[11.5px] text-white/80">
              {zh ? `已盖 ${showing.stamps}/4 枚章 · 任务已确认` : `${showing.stamps}/4 stamps · task confirmed`}
            </div>
            <div className="mt-1 font-mono text-[11.5px] text-white/70">
              {zh ? '已 Check-in 23 分钟 · 记录将自动归档' : 'Checked in 23 min · notes will auto-file'}
            </div>
          </div>

          {/* Client context chips */}
          <div className="flex gap-2 overflow-x-auto border-b border-line-divider px-5 py-3">
            {PREFS.map((p) => (
              <span
                key={p.label.en}
                className={
                  'whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-medium ' +
                  CHIP_TONE[p.tone]
                }
              >
                {p.label[lang]}
              </span>
            ))}
          </div>

          {/* RECO authorization Q&A — compliance core */}
          <div className="px-5 pt-4">
            <div className="font-mono text-[10.5px] uppercase tracking-eyebrowLg text-body-3">
              {zh ? 'Mia 可能问的' : 'What Mia might ask'}
            </div>
          </div>
          <div className="space-y-2.5 px-5 pb-2 pt-3">
            {QAS.map((qa) => (
              <div
                key={qa.q.en}
                className={
                  'rounded-xl border p-3.5 ' +
                  (qa.authorized
                    ? 'border-line-divider bg-surface-muted'
                    : 'border-danger/30 bg-danger/[0.04]')
                }
              >
                <div className="text-body-2 text-[14px] font-semibold">{qa.q[lang]}</div>
                <div
                  className={
                    'mt-1.5 text-[12px] leading-relaxed ' +
                    (qa.authorized ? 'text-body-2' : 'text-danger')
                  }
                >
                  {qa.a[lang]}
                </div>
                <div
                  className={
                    'mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ' +
                    (qa.authorized
                      ? 'bg-success/10 text-success'
                      : 'bg-danger/10 text-danger')
                  }
                >
                  {qa.authorized ? (zh ? '✓ 授权回答' : '✓ Authorized answer') : (zh ? '✗ 不授权回答' : '✗ Not authorized')}
                </div>
              </div>
            ))}
          </div>

          {/* 1-tap feedback CTA band */}
          <div className="border-y border-line-divider bg-surface-muted px-5 py-3.5">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-agent">
              {zh ? '看完后 1-tap 反馈' : '1-tap feedback after viewing'}
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
                  key={t.label.en}
                  href={`/agent/showings/${id}/feedback`}
                  className={
                    'flex items-center justify-center gap-2 rounded-xl border py-3.5 text-[14px] font-bold ' +
                    tone
                  }
                >
                  <span className="text-[18px]">{t.emoji}</span>
                  {t.label[lang]}
                </Link>
              )
            })}
          </div>

          {/* Helper note */}
          <div className="bg-white px-5 pb-5 text-[11.5px] leading-relaxed text-body-3">
            {zh ? `反馈直接发给 Mia + Sarah · 你不需要写长文。${aiName} 帮你扩成完整反馈。` : `Feedback goes straight to Mia + Sarah · no need to write a long note. ${aiName} expands it into full feedback for you.`}
          </div>

          {/* Link to feedback subpage */}
          <div className="border-t border-line-divider bg-white px-5 py-4">
            <Link
              href={`/agent/showings/${id}/feedback`}
              className="flex items-center justify-center gap-2 rounded-xl bg-agent py-3.5 text-[14px] font-bold text-white"
            >
              {zh ? '用 90 秒给反馈 →' : 'Give feedback in 90 seconds →'}
            </Link>
          </div>
        </div>

        <div className="mt-4 text-center font-mono text-[10.5px] text-body-3">
          {zh ? `看房 #${id} · FIELD AGENT` : `Showing #${id} · FIELD AGENT`}
        </div>
      </div>
    </WorkspaceShell>
  )
}
