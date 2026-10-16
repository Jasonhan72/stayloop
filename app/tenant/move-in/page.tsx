'use client'

import Link from 'next/link'
import AIProactive from '@/components/AIProactive'
import InsuranceReferralCard from '@/components/tenant/InsuranceReferralCard'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import MoveInChecklist from '@/components/household/MoveInChecklist'
import { leaseProvince } from '@/lib/provinces/lease'
import { guidelineFor } from '@/lib/ontario/rules'
import { useReportLiveRows } from '@/lib/liveRows'

// The tenant's own tenancies (household membership) → the shared checklist
// (P2 2026-09-23). Rendered above the demo page through liveSlot.
function LiveMoveIn({ zh }: { zh: boolean }) {
  const auth = useAuth()
  const [hh, setHh] = useState<{ id: string; address: string; unit: string | null; city?: string | null; start_date: string | null }[] | null>(null)
  useReportLiveRows('households', hh ? hh.length : null)
  useEffect(() => {
    if (auth.loading || !auth.user) { setHh([]); return }
    let cancelled = false
    ;(async () => {
      const { data: mem } = await supabase.from('household_members').select('household_id').eq('user_id', auth.user!.id).eq('role', 'tenant').eq('status', 'active').limit(10)
      const ids = ((mem ?? []) as { household_id: string }[]).map((m) => m.household_id)
      const { data } = ids.length ? await supabase.from('households').select('id, address, unit, city, start_date').in('id', ids).order('start_date', { ascending: false }).limit(3) : { data: [] }
      if (!cancelled) setHh((data ?? []) as typeof hh)
    })()
    return () => { cancelled = true }
  }, [auth.loading, auth.user])
  if (!hh || hh.length === 0) return null
  return (
    <div className="mb-6 space-y-4">
      {hh.map((h) => (
        <div key={h.id}>
          <div className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '我的在管租约 · 真实记录' : 'MY TENANCY · LIVE'} · {h.address}{h.unit ? ` #${h.unit}` : ''}{h.start_date ? ` · ${h.start_date}` : ''}</div>
          <MoveInChecklist householdId={h.id} zh={zh} province={leaseProvince({ household: h })} />
        </div>
      ))}
    </div>
  )
}

type Bi = { zh: string; en: string }

const PHOTO_TILES: { room: Bi; emoji: string; need: Bi; done?: number }[] = [
  { room: { zh: '客厅', en: 'Living room' }, emoji: '🛋️', need: { zh: '需 ≥4 张', en: 'Need ≥4 photos' }, done: 4 },
  { room: { zh: '卧室', en: 'Bedroom' }, emoji: '🛏️', need: { zh: '需 ≥4 张', en: 'Need ≥4 photos' }, done: 4 },
  { room: { zh: '厨房 · 含电器', en: 'Kitchen · incl. appliances' }, emoji: '🍳', need: { zh: '需 ≥6 张', en: 'Need ≥6 photos' } },
  { room: { zh: '卫生间', en: 'Bathroom' }, emoji: '🚿', need: { zh: '需 ≥4 张', en: 'Need ≥4 photos' } },
  { room: { zh: '已有损耗 · 特写', en: 'Existing wear · close-ups' }, emoji: '🔍', need: { zh: '逐处拍清', en: 'Capture each clearly' } },
]

const FACILITIES: { label: Bi; done: boolean }[] = [
  { label: { zh: '大门钥匙 × 2', en: 'Front door keys × 2' }, done: true },
  { label: { zh: '信箱钥匙', en: 'Mailbox key' }, done: true },
  { label: { zh: '健身房卡', en: 'Gym fob' }, done: true },
  { label: { zh: '暖气使用说明', en: 'Heating instructions' }, done: false },
  { label: { zh: 'WiFi 名称 + 密码', en: 'WiFi name + password' }, done: false },
]

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={
        'flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold ' +
        (on ? 'bg-success text-white' : 'border border-line-divider text-body-3')
      }
    >
      {on ? '✓' : ''}
    </span>
  )
}

export default function TenantMoveInPage() {
  const name = useAIName()
  const { lang } = useT()
  // Deposit interest = the guideline for the year it falls due (lib/ontario/rules is the only source).
  const guideline = guidelineFor(new Date())
  return (
    <WorkspaceShell role="tenant" hideAside liveSlot={<LiveMoveIn zh={lang === 'zh'} />}>
      <div className="mx-auto max-w-[760px]">
        <LiveMoveIn zh={lang === 'zh'} />
        <div className="mb-7">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">
            {lang === 'zh' ? '入住 · DAY 1 · 2026/06/01' : 'MOVE-IN · DAY 1 · 2026/06/01'}
          </div>
          <h1 className="mt-2 text-[24px] sm:text-[32px] font-bold tracking-tight">
            {lang === 'zh' ? '欢迎搬入 Unit 1207 · King West' : 'Welcome to Unit 1207 · King West'}
          </h1>
          <p className="mt-2 text-[13.5px] text-body-2">
            {lang === 'zh'
              ? 'Mia，房东 Sarah Wang 已交接。完成这三步，今天就正式安顿好了。'
              : 'Mia, your landlord Sarah Wang has handed over the unit. Complete these three steps and you’re officially settled in today.'}
          </p>
        </div>

        <AIProactive
          role="tenant"
          insights={[
            {
              text: {
                zh: '入住 7 天内拍照记录既有损耗，退租时是最有力的证据。{ai} 给你一份 Day-1 检查清单。',
                en: 'Photographing existing wear within 7 days of move-in is your strongest move-out evidence. {ai} has a Day-1 checklist for you.',
              },
              action: {
                label: { zh: '生成清单', en: 'Get the checklist' },
                prompt: {
                  zh: '给我一份入住第一天的检查清单，告诉我哪些地方必须拍照留证。',
                  en: 'Give me a Day-1 move-in checklist and tell me exactly what to photograph.',
                },
              },
            },
          ]}
        />

        {/* ── Luna guidance banner ── */}
        <div className="mb-6 sl-card border border-tenant/30 bg-tenant/[0.04] p-5">
          <div className="flex items-center gap-2">
            <span className="inline-block h-5 w-5 rounded-full bg-tenant/20 text-center text-[11px] leading-5">🟣</span>
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-tenant">
              {lang === 'zh' ? `${name} · 入住向导` : `${name} · Move-in guide`}
            </span>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-body-2">
            {lang === 'zh' ? (
              <>退租时最常见的纠纷就是押金。今天先把房子的真实状态拍清楚、确认收到的实物、拿到押金和首月租金的收据 — 这三件事做完，你的 <b>$2,800 押金</b>在搬出时就有据可依。</>
            ) : (
              <>The deposit is the most common dispute at move-out. Today, photograph the unit’s real condition, confirm what you received, and get receipts for the deposit and first month’s rent — once these three things are done, your <b>$2,800 deposit</b> has solid evidence behind it when you move out.</>
            )}
          </p>
        </div>

        {/* ── Task 1 · move-in condition photos ── */}
        <div className="mb-5 sl-card p-5 sm:p-7">
          <h2 className="text-[18px] font-bold tracking-tight">{lang === 'zh' ? '📷 入住状态拍照（关键）' : '📷 Move-in condition photos (critical)'}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
            {lang === 'zh'
              ? `这些照片会被时间戳锁定，作为退租时的对照标准 — 保护你的押金。${name} 会把它们存进 audit log，搬出时房东无法以「原本就有的损耗」扣你的钱。`
              : `These photos are timestamp-locked as the baseline for comparison at move-out — protecting your deposit. ${name} stores them in the audit log, so the landlord can’t deduct from your deposit for "pre-existing wear" when you leave.`}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PHOTO_TILES.map((t) => {
              const captured = typeof t.done === 'number'
              return (
                <Link
                  key={t.room.en}
                  href={`/tenant/agent?prompt=${encodeURIComponent(lang === 'zh' ? `我要上传${t.room.zh}的入住状态照片，帮我记录进 audit log` : `I want to upload move-in condition photos of the ${t.room.en.toLowerCase()} — log them in my audit trail`)}`}
                  className={
                    'flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-5 text-center transition ' +
                    (captured
                      ? 'border-success/40 bg-success/[0.06]'
                      : 'border-dashed border-line-divider bg-surface-chip hover:border-tenant/50 hover:bg-tenant/[0.04]')
                  }
                >
                  <span className="text-[28px] leading-none">{t.emoji}</span>
                  <span className="mt-1 text-[13px] font-semibold">{t.room[lang]}</span>
                  {captured ? (
                    <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-success">
                      {lang === 'zh' ? `已拍 ${t.done} 张` : `${t.done} taken`}
                    </span>
                  ) : (
                    <span className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                      {t.need[lang]}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>

          <div className="mt-4 rounded-xl bg-surface-chip p-3 text-[12px] text-body-3">
            {lang === 'zh' ? '进度 2 / 5 房间已完成 · 全部拍完后才能提交给 Sarah' : 'Progress 2 / 5 rooms done · submit to Sarah once all are captured'}
          </div>
        </div>

        {/* ── Task 2 · facilities + keys ── */}
        <div className="mb-5 sl-card p-5 sm:p-7">
          <h2 className="text-[18px] font-bold tracking-tight">{lang === 'zh' ? '🔧 设施 + 钥匙' : '🔧 Facilities + keys'}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
            {lang === 'zh'
              ? '逐项确认收到的实物。打勾即记录交接时间，缺漏的当场告诉 Sarah。'
              : 'Confirm each item you received. Checking it logs the handover time; tell Sarah on the spot about anything missing.'}
          </p>

          <div className="mt-5 divide-y divide-line-divider rounded-2xl border border-line-divider">
            {FACILITIES.map((f) => (
              <div key={f.label.en} className="flex items-center gap-3 px-4 py-3">
                <Check on={f.done} />
                <span
                  className={
                    'text-[14px] ' + (f.done ? 'text-body' : 'text-body-2')
                  }
                >
                  {f.label[lang]}
                </span>
                {f.done && (
                  <span className="ml-auto font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-success">
                    {lang === 'zh' ? '已确认' : 'Confirmed'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Task 3 · deposit receipt (RTA s.105–106 facts; Stayloop never handles money) ── */}
        <div className="mb-5 sl-card p-5 sm:p-7" data-testid="deposit-receipt-card">
          <h2 className="text-[18px] font-bold tracking-tight">{lang === 'zh' ? '🧾 押金收据 + 首月租金收据' : '🧾 Deposit receipt + first month’s rent receipt'}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
            {lang === 'zh'
              ? '押金是付给房东的，Stayloop 不经手任何资金。今天要做的只有一件事：让房东给你一张写明金额和日期的收据（RTA s.109：你要求时房东必须免费出具）。'
              : 'The deposit is paid to the landlord; Stayloop never handles money. The one thing to do today: get a receipt from the landlord stating the amount and date (RTA s.109: the landlord must provide one free of charge when asked).'}
          </p>

          <div className="mt-5 divide-y divide-line-divider rounded-2xl border border-line-divider">
            <div className="flex items-start gap-3 px-4 py-4">
              <Check on={false} />
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">{lang === 'zh' ? '租金押金 $2,800 · 收据' : 'Rent deposit $2,800 · receipt'}</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-body-3">
                  {lang === 'zh'
                    ? `RTA s.105–106：押金最多一个月租金，只能抵扣租期最后一个月的租金，不能用于清洁、维修或损坏；房东每年按当年指导比例付息（${guideline.year} 年 ${guideline.pct}%）。安省没有损坏押金、宠物押金。`
                    : `RTA s.105–106: at most one month’s rent, applied only to the last month of the tenancy — never to cleaning, repairs or damage; the landlord pays interest every year at that year’s guideline (${guideline.pct}% for ${guideline.year}). Ontario has no damage or pet deposits.`}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-4">
              <Check on={false} />
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">{lang === 'zh' ? '首月租金 $2,800 · 收据' : 'First month’s rent $2,800 · receipt'}</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-body-3">
                  {lang === 'zh'
                    ? '按你和房东约定的方式支付（e-Transfer、支票……）。收据上要有地址、金额、期间和日期。'
                    : 'Paid the way you and the landlord agreed (e-Transfer, cheque…). The receipt should state the address, amount, period and date.'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-4">
              <Check on={false} />
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">{lang === 'zh' ? '钥匙押金（如有）' : 'Key deposit (if any)'}</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-body-3">
                  {lang === 'zh'
                    ? '只能按钥匙或门禁卡的更换成本收取，交还时全额退还。'
                    : 'Only up to the replacement cost of the keys or fob, refunded in full when they are returned.'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-surface-chip p-3 text-[12px] leading-relaxed text-body-3">
            {lang === 'zh'
              ? '收据拿到后，在在管租约页记录首月租金已付；押金利息到期没收到，可以在租约对话里问房东。'
              : 'Once you have the receipts, record the first month as paid on your tenancy page; if deposit interest is not paid when due, ask the landlord in the tenancy thread.'}
            {' '}
            <Link href="/tenant/payments" className="font-semibold text-brand-strong underline underline-offset-2">{lang === 'zh' ? '去租金记录 →' : 'Rent records →'}</Link>
          </div>
        </div>

        {/* ── Optional insurance referral (config-driven; hidden unless enabled in app_config) ── */}
        <InsuranceReferralCard />

        {/* ── Actions ── */}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href={`/tenant/agent?prompt=${encodeURIComponent(lang === 'zh' ? '入住检查完成，帮我把检查结果提交给房东' : 'Move-in check complete — submit the results to my landlord')}`} className="sl-btn-primary px-7 py-3.5">{lang === 'zh' ? '完成入住检查 · 提交给 Sarah' : 'Finish move-in check · submit to Sarah'}</Link>
          <Link href={`/tenant/agent?prompt=${encodeURIComponent(lang === 'zh' ? '入住检查发现问题，先暂停提交，帮我记录问题清单' : 'Found issues during move-in check — pause the submission and help me log them')}`} className="sl-btn-ghost px-6 py-3.5">{lang === 'zh' ? '有问题，先暂停' : 'Something’s wrong, pause'}</Link>
        </div>
        {/* 乙 #10: the move-out tools live on the lease page */}
        <p className="mt-4 text-center text-[12.5px] text-body-3" data-testid="move-out-entry">
          {lang === 'zh' ? '要退租了？' : 'Moving out?'}{' '}
          <Link href="/tenant/lease#move-out" className="font-semibold text-brand-strong underline underline-offset-2">{lang === 'zh' ? '退租工具 →' : 'Move-out tools →'}</Link>
        </p>
      </div>
    </WorkspaceShell>
  )
}
