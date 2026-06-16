'use client'

import Header from '@/components/Header'
import Footer from '@/components/Footer'

type Icon = { ch: string; role: 'l' | 't' | 'a' | 'neutral' }

type ActionItem = {
  icon: Icon
  title: string
  body: string
  ts: string
  action: string
}

type InfoItem = {
  icon: Icon
  title: string
  body: string
  ts: string
}

const ACTION_REQUIRED: ActionItem[] = [
  {
    icon: { ch: 'L', role: 'l' },
    title: 'Sarah 提议租约第 7 条改回 1 个月通知',
    body: 'Luna 已起草你的回应 · 倾向接受 / 倾向拒绝 / 跟 Sarah 谈一下',
    ts: '2 分钟前',
    action: '查看草稿',
  },
  {
    icon: { ch: 'B', role: 'a' },
    title: 'David 完成看房 · 给你写了反馈',
    body: '"Mia 很喜欢主卧采光，问了猫的进出问题，对租金接受度高"',
    ts: '3 小时前',
    action: '安排下一步',
  },
  {
    icon: { ch: 'L', role: 't' },
    title: 'Luna · Liberty 305 突然降价了',
    body: '$2,650 → $2,500 · 是不是再去看一次？',
    ts: '今早 09:14',
    action: '约看房',
  },
  {
    icon: { ch: '✓', role: 'l' },
    title: 'Sarah 批准了你的看房 — 确认周三 14:00？',
    body: 'Unit 1207 · King West · David Park 带看',
    ts: '今早 08:02',
    action: '✓ 确认',
  },
  {
    icon: { ch: '✎', role: 't' },
    title: '租约待你签字 · 第 6/6 页',
    body: 'Unit 1207 · King West · $2,800 / 月',
    ts: '昨天',
    action: '去签字',
  },
  {
    icon: { ch: '$', role: 'l' },
    title: '下次自动扣 $2,800 · 5月22日',
    body: 'RBC ****8721 · 如需更换扣款账户请提前 3 天',
    ts: '昨天',
    action: '改账户',
  },
]

const ALREADY_KNOWN: InfoItem[] = [
  {
    icon: { ch: '$', role: 'l' },
    title: '租金已自动扣 $2,800 · 5/1',
    body: 'RBC ****8721 · 余额 $5,420',
    ts: '5/1 09:00',
  },
  {
    icon: { ch: '★', role: 't' },
    title: '你的 认证 3 级 完成 · Score 84',
    body: '解锁 23 套高端房源 · Sarah 已自动收到通知',
    ts: '5/4 10:24',
  },
  {
    icon: { ch: '✓', role: 'l' },
    title: 'Sarah 批准看房 · David 周三 14:00',
    body: '已加入你的日历 · 路线已存',
    ts: '5/3 11:47',
  },
  {
    icon: { ch: 'B', role: 'a' },
    title: 'David Park 接受了带看任务',
    body: 'Unit 1207 · King West · 周三 14:00',
    ts: '5/3 10:31',
  },
  {
    icon: { ch: '★', role: 't' },
    title: 'Flinks 完成认证 3 级核验',
    body: '收入 · 身份 · 信用 已全部通过',
    ts: '5/4 10:24',
  },
  {
    icon: { ch: '→', role: 't' },
    title: '你的申请进入第 3 步',
    body: 'Unit 1207 · King West · 等待房东最终确认',
    ts: '5/2 16:08',
  },
]

const ICON_STYLE: Record<Icon['role'], string> = {
  l: 'bg-landlord/10 text-landlord',
  t: 'bg-tenant/10 text-tenant',
  a: 'bg-agent/10 text-agent',
  neutral: 'bg-line-divider/50 text-body-2',
}

export default function NotificationsPage() {
  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-[920px] px-5 py-12 sm:px-7">
          <div className="text-center">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">
              3 件需要你 · 14 已知会
            </div>
            <h1 className="mt-3 text-[28px] font-bold tracking-tight sm:text-[32px]">
              通知 · 按重要度排
            </h1>
            <p className="mt-2 text-body-2 text-[14px]">
              Luna / Logic / Brief 已经替你过滤掉营销通知 · 这里只剩需要你看到的
            </p>
          </div>

          <div className="mt-9 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-[#B45309]">
            ⚠ 需要你 1-CLICK
          </div>
          <div className="mt-3.5 space-y-2.5">
            {ACTION_REQUIRED.map((n, i) => (
              <ActionRow key={i} item={n} />
            ))}
          </div>

          <div className="mt-7 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
            已知会 · 不需要你做什么
          </div>
          <div className="mt-3.5 space-y-2.5">
            {ALREADY_KNOWN.map((n, i) => (
              <InfoRow key={i} item={n} />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

function NotifIcon({ icon }: { icon: Icon }) {
  return (
    <div
      className={
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ' +
        ICON_STYLE[icon.role]
      }
    >
      {icon.ch}
    </div>
  )
}

function ActionRow({ item }: { item: ActionItem }) {
  return (
    <div className="sl-card flex items-center gap-3.5 border-l-2 border-l-[#B45309] p-4">
      <NotifIcon icon={item.icon} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold leading-snug">{item.title}</div>
        <div className="mt-0.5 text-body-2 text-[12.5px] leading-snug">{item.body}</div>
      </div>
      <div className="hidden shrink-0 font-mono text-[11px] text-body-3 sm:block">
        {item.ts}
      </div>
      <button className="sl-btn-primary shrink-0 whitespace-nowrap px-3.5 py-2 text-[12.5px]">
        {item.action}
      </button>
    </div>
  )
}

function InfoRow({ item }: { item: InfoItem }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl bg-surface-chip px-4 py-3">
      <NotifIcon icon={item.icon} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold leading-snug">{item.title}</div>
        <div className="mt-0.5 text-body-3 text-[12px] leading-snug">{item.body}</div>
      </div>
      <div className="shrink-0 font-mono text-[11px] text-body-3">{item.ts}</div>
    </div>
  )
}
