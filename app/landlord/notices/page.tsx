'use client'

// /landlord/notices — N 表工具箱 / Notice toolbox (V1.0 阶段 3 · 甲 #5).
// Real functionality (not a DEMO_GATE page): the component reads the
// landlord's own leases and writes append-only service records. The
// boundary text and the arithmetic live in components/landlord/NoticeToolbox
// and lib/ontario/noticeForms.
import { Suspense } from 'react'
import WorkspaceShell from '@/components/WorkspaceShell'
import { PageHeader } from '@/components/workspace'
import NoticeToolbox from '@/components/landlord/NoticeToolbox'
import { useT } from '@/lib/i18n'

export default function LandlordNoticesPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <WorkspaceShell role="landlord">
      <PageHeader
        title={zh ? 'N 表工具箱' : 'Notice toolbox'}
        sub={zh ? '选租约 → 选表 → 日期算术 → 填写稿与官方表格 → 记录送达（N1 / N4 / N12 / L1）' : 'Pick a lease → pick a form → date arithmetic → fill-in sheet and the official form → record the service (N1 / N4 / N12 / L1)'}
      />
      <Suspense fallback={null}>
        <NoticeToolbox />
      </Suspense>
    </WorkspaceShell>
  )
}
