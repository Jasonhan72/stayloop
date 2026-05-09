'use client'

import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'

export default function FieldAgentHome() {
  return (
    <WorkspaceShell role="agent" aside={<AgentAside />}>
      <div className="mb-9 flex items-center gap-4">
        <span className="orb agent pulse h-14 w-14" style={{ color: '#2563EB' }} />
        <div>
          <div className="text-[28px] font-bold leading-tight tracking-tight">Brief</div>
          <div className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand-bright" />
            ACTIVE · 你今天有 3 个安排
          </div>
        </div>
      </div>

      <h1 className="text-[36px] font-bold leading-tight tracking-tight">
        Sarah, <br />
        今天有 <span className="text-info">3 场看房</span> · <span className="text-info">$340</span> 已结算 · <span className="text-info">2 个</span> 客户在等回复。
      </h1>

      {/* Tasks */}
      <SectionH>今日任务</SectionH>
      <div className="space-y-2">
        <Task
          time="11:00"
          title="带 Mia Wang 看 88 Harbour St #4502"
          tags={['VIRTUAL · ZOOM', 'TIER 3', '$120']}
          authNo={['修改租约条款', '替客户签字']}
          authYes={['介绍房源', '回答常规问题', '事后整理反馈']}
        />
        <Task
          time="14:30"
          title="Liberty Village Loft · 现场看房"
          tags={['IN-PERSON', 'TIER 2', '$80']}
          authNo={['代收押金']}
          authYes={['解锁公寓门', '介绍邻居 + 配套']}
        />
        <Task
          time="17:00"
          title="为 432 Brunswick 拍照 + 整理 Listing"
          tags={['LISTING PREP', 'TIER 3', '$140']}
          authNo={['擅自定价 / 改 Tier 设定']}
          authYes={['整理户型图、上传照片、起草描述']}
        />
      </div>

      <SectionH>等你回复</SectionH>
      <div className="space-y-3">
        <ClientCard name="David Park" status="已看房 · 等待你的反馈" lastMsg="我觉得 Liberty Village 的厨房太小" />
        <ClientCard name="Karen Liu"  status="新客户 · 来自 Stayloop 推荐" lastMsg="想看 Distillery 区，下周末有空吗？" />
      </div>
    </WorkspaceShell>
  )
}

function Task({
  time,
  title,
  tags,
  authYes,
  authNo,
}: {
  time: string
  title: string
  tags: string[]
  authYes: string[]
  authNo: string[]
}) {
  return (
    <div className="sl-card p-5">
      <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-info">
        {time}
      </div>
      <h4 className="mt-1 text-[16px] font-bold tracking-tight">{title}</h4>
      <div className="mt-2 flex flex-wrap gap-2">
        {tags.map((t) => (
          <span key={t} className="sl-chip">{t}</span>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-surface-chip p-3">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">
            ✓ AUTHORIZED
          </div>
          <ul className="mt-1 list-disc pl-5 text-[12px] leading-relaxed text-body-2">
            {authYes.map((y) => <li key={y}>{y}</li>)}
          </ul>
        </div>
        <div className="rounded-lg bg-danger/5 p-3">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-danger">
            ✗ NOT AUTHORIZED
          </div>
          <ul className="mt-1 list-disc pl-5 text-[12px] leading-relaxed text-body-2">
            {authNo.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}

function ClientCard({ name, status, lastMsg }: { name: string; status: string; lastMsg: string }) {
  return (
    <div className="sl-card flex items-start gap-4 p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-info/30 to-info text-[15px] font-bold text-white">
        {name[0]}
      </span>
      <div className="flex-1">
        <div className="text-[15px] font-bold">{name}</div>
        <div className="font-mono text-[11px] text-body-3">{status}</div>
        <p className="mt-1 text-[13px] text-body-2">"{lastMsg}"</p>
      </div>
      <button className="sl-btn-secondary !py-[8px] !px-3 !text-[12.5px]">回复</button>
    </div>
  )
}

function SectionH({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-8 flex items-center gap-3">
      <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {children}
      </span>
      <span className="h-px flex-1 bg-line-divider" />
    </div>
  )
}

function AgentAside() {
  return (
    <>
      <h4 className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        本周收益
      </h4>
      <div className="mt-3 sl-card p-4">
        <div className="text-[28px] font-bold tracking-tight text-info">$1,840</div>
        <div className="font-mono text-[11.5px] text-body-3">+$340 vs 上周</div>
        <div className="mt-3 grid grid-cols-7 items-end gap-1.5">
          {[28, 45, 30, 70, 25, 85, 60].map((h, i) => (
            <span
              key={i}
              className="rounded-sm bg-info/30"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      <h4 className="mt-6 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        BRIEF 记得 · 关于你
      </h4>
      <div className="mt-3 divide-y divide-dashed divide-line-divider">
        {[
          { k: 'AREA',  v: 'Liberty · King West · Annex' },
          { k: 'STYLE', v: '更擅长讲故事 · 喜欢拍照' },
          { k: 'GOAL',  v: '本月目标 $7,200 · 已 $1,840' },
        ].map((m) => (
          <div key={m.k} className="grid grid-cols-[60px_1fr] items-baseline gap-3 py-2">
            <span className="font-mono text-[10px] font-bold text-info">{m.k}</span>
            <span className="text-[12.5px] leading-snug text-body">{m.v}</span>
          </div>
        ))}
      </div>
    </>
  )
}
