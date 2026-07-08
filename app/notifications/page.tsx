'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import { useAuth } from '@/lib/useAuth'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'

type Icon = { ch: string; role: 'l' | 't' | 'a' | 'neutral' }
type Bi = { zh: string; en: string }

type ActionItem = {
  icon: Icon
  title: Bi
  body: Bi
  ts: Bi
  action: Bi
}

type InfoItem = {
  icon: Icon
  title: Bi
  body: Bi
  ts: Bi
}

const ACTION_REQUIRED = (tenantAi: string): ActionItem[] => [
  {
    icon: { ch: 'L', role: 'l' },
    title: { zh: 'Sarah 提议租约第 7 条改回 1 个月通知', en: 'Sarah proposes reverting lease clause 7 to 1-month notice' },
    body: { zh: `${tenantAi} 已起草你的回应 · 倾向接受 / 倾向拒绝 / 跟 Sarah 谈一下`, en: `${tenantAi} has drafted your reply · lean accept / lean decline / talk to Sarah` },
    ts: { zh: '2 分钟前', en: '2 minutes ago' },
    action: { zh: '查看草稿', en: 'View draft' },
  },
  {
    icon: { ch: 'B', role: 'a' },
    title: { zh: 'David 完成看房 · 给你写了反馈', en: 'David finished the showing · left you feedback' },
    body: { zh: '"Mia 很喜欢主卧采光，问了猫的进出问题，对租金接受度高"', en: '"Mia loved the master bedroom light, asked about cat access, and is comfortable with the rent."' },
    ts: { zh: '3 小时前', en: '3 hours ago' },
    action: { zh: '安排下一步', en: 'Plan next step' },
  },
  {
    icon: { ch: 'L', role: 't' },
    title: { zh: `${tenantAi} · Liberty 305 突然降价了`, en: `${tenantAi} · Liberty 305 just dropped its price` },
    body: { zh: '$2,650 → $2,500 · 是不是再去看一次？', en: '$2,650 → $2,500 · want to take another look?' },
    ts: { zh: '今早 09:14', en: 'Today 09:14' },
    action: { zh: '约看房', en: 'Book showing' },
  },
  {
    icon: { ch: '✓', role: 'l' },
    title: { zh: 'Sarah 批准了你的看房 — 确认周三 14:00？', en: 'Sarah approved your showing — confirm Wed 14:00?' },
    body: { zh: 'Unit 1207 · King West · David Park 带看', en: 'Unit 1207 · King West · shown by David Park' },
    ts: { zh: '今早 08:02', en: 'Today 08:02' },
    action: { zh: '✓ 确认', en: '✓ Confirm' },
  },
  {
    icon: { ch: '✎', role: 't' },
    title: { zh: '租约待你签字 · 第 6/6 页', en: 'Lease awaiting your signature · page 6/6' },
    body: { zh: 'Unit 1207 · King West · $2,800 / 月', en: 'Unit 1207 · King West · $2,800 / month' },
    ts: { zh: '昨天', en: 'Yesterday' },
    action: { zh: '去签字', en: 'Sign now' },
  },
  {
    icon: { ch: '$', role: 'l' },
    title: { zh: '下次自动扣 $2,800 · 5月22日', en: 'Next auto-debit $2,800 · May 22' },
    body: { zh: 'RBC ****8721 · 如需更换扣款账户请提前 3 天', en: 'RBC ****8721 · change the debit account at least 3 days ahead' },
    ts: { zh: '昨天', en: 'Yesterday' },
    action: { zh: '改账户', en: 'Change account' },
  },
]

const ALREADY_KNOWN: InfoItem[] = [
  {
    icon: { ch: '$', role: 'l' },
    title: { zh: '租金已自动扣 $2,800 · 5/1', en: 'Rent auto-debited $2,800 · 5/1' },
    body: { zh: 'RBC ****8721 · 余额 $5,420', en: 'RBC ****8721 · balance $5,420' },
    ts: { zh: '5/1 09:00', en: '5/1 09:00' },
  },
  {
    icon: { ch: '★', role: 't' },
    title: { zh: '你的 认证 3 级 完成 · Score 84', en: 'Your Tier 3 verification is complete · Score 84' },
    body: { zh: '解锁 23 套高端房源 · Sarah 已自动收到通知', en: 'Unlocked 23 premium listings · Sarah was notified automatically' },
    ts: { zh: '5/4 10:24', en: '5/4 10:24' },
  },
  {
    icon: { ch: '✓', role: 'l' },
    title: { zh: 'Sarah 批准看房 · David 周三 14:00', en: 'Sarah approved the showing · David Wed 14:00' },
    body: { zh: '已加入你的日历 · 路线已存', en: 'Added to your calendar · route saved' },
    ts: { zh: '5/3 11:47', en: '5/3 11:47' },
  },
  {
    icon: { ch: 'B', role: 'a' },
    title: { zh: 'David Park 接受了带看任务', en: 'David Park accepted the showing task' },
    body: { zh: 'Unit 1207 · King West · 周三 14:00', en: 'Unit 1207 · King West · Wed 14:00' },
    ts: { zh: '5/3 10:31', en: '5/3 10:31' },
  },
  {
    icon: { ch: '★', role: 't' },
    title: { zh: 'Flinks 完成认证 3 级核验', en: 'Flinks completed Tier 3 verification' },
    body: { zh: '收入 · 身份 · 信用 已全部通过', en: 'Income · identity · credit all passed' },
    ts: { zh: '5/4 10:24', en: '5/4 10:24' },
  },
  {
    icon: { ch: '→', role: 't' },
    title: { zh: '你的申请进入第 3 步', en: 'Your application advanced to step 3' },
    body: { zh: 'Unit 1207 · King West · 等待房东最终确认', en: 'Unit 1207 · King West · awaiting landlord’s final confirmation' },
    ts: { zh: '5/2 16:08', en: '5/2 16:08' },
  },
]

const ICON_STYLE: Record<Icon['role'], string> = {
  l: 'bg-landlord/10 text-landlord',
  t: 'bg-tenant/10 text-tenant',
  a: 'bg-agent/10 text-agent',
  neutral: 'bg-line-divider/50 text-body-2',
}

export default function NotificationsPage() {
  const { lang } = useT()
  const { role } = useAuth()
  const shellRole = (role || 'tenant') as 'tenant' | 'landlord' | 'agent'
  const tenantAi = useAIName('tenant')
  const landlordAi = useAIName('landlord')
  const agentAi = useAIName('agent')
  const aiNames = Array.from(new Set([tenantAi, landlordAi, agentAi])).join(' / ')
  return (
    <WorkspaceShell role={shellRole} hideAside>
      <div className="mx-auto max-w-[920px]">
          <div className="text-center">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-body-3">
              {lang === 'zh' ? '3 件需要你 · 14 已知会' : '3 need you · 14 FYI'}
            </div>
            <h1 className="mt-3 text-[28px] font-bold tracking-tight sm:text-[32px]">
              {lang === 'zh' ? '通知 · 按重要度排' : 'Notifications · ranked by importance'}
            </h1>
            <p className="mt-2 text-body-2 text-[14px]">
              {lang === 'zh'
                ? `${aiNames} 已经替你过滤掉营销通知 · 这里只剩需要你看到的`
                : `${aiNames} already filtered out the marketing noise · only what you need to see remains`}
            </p>
          </div>

          <div className="mt-9 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-[#B45309]">
            {lang === 'zh' ? '⚠ 需要你 1-CLICK' : '⚠ NEEDS YOU · 1-CLICK'}
          </div>
          <div className="mt-3.5 space-y-2.5">
            {ACTION_REQUIRED(tenantAi).map((n, i) => (
              <ActionRow key={i} item={n} lang={lang} />
            ))}
          </div>

          <div className="mt-7 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
            {lang === 'zh' ? '已知会 · 不需要你做什么' : 'FYI · nothing for you to do'}
          </div>
          <div className="mt-3.5 space-y-2.5">
            {ALREADY_KNOWN.map((n, i) => (
              <InfoRow key={i} item={n} lang={lang} />
            ))}
          </div>
        </div>
    </WorkspaceShell>
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

function ActionRow({ item, lang }: { item: ActionItem; lang: Lang }) {
  return (
    <div className="sl-card flex items-center gap-3.5 border-l-2 border-l-[#B45309] p-4">
      <NotifIcon icon={item.icon} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold leading-snug">{item.title[lang]}</div>
        <div className="mt-0.5 text-body-2 text-[12.5px] leading-snug">{item.body[lang]}</div>
      </div>
      <div className="hidden shrink-0 font-mono text-[11px] text-body-3 sm:block">
        {item.ts[lang]}
      </div>
      <button className="sl-btn-primary shrink-0 whitespace-nowrap px-3.5 py-2 text-[12.5px]">
        {item.action[lang]}
      </button>
    </div>
  )
}

function InfoRow({ item, lang }: { item: InfoItem; lang: Lang }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl bg-surface-chip px-4 py-3">
      <NotifIcon icon={item.icon} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold leading-snug">{item.title[lang]}</div>
        <div className="mt-0.5 text-body-3 text-[12px] leading-snug">{item.body[lang]}</div>
      </div>
      <div className="shrink-0 font-mono text-[11px] text-body-3">{item.ts[lang]}</div>
    </div>
  )
}
