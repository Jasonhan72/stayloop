// V1.0 · 阶段 1 · 甲 #1 — "next step" after a screening (pure function).
//
// Research (design/research/v1/landlord-retention-2026-10.md C1-3 / C1-5):
// seven external "approve" screenings were followed by zero leases — the report
// page and the applicant queue were two separate entrances and nothing pointed
// from one to the other. This module turns a finished screening into 1–3 links
// to the pages that already exist (lease draft, decision notice card, applicant
// thread, lease import, the queue).
//
// OHRC wording rule (design/v1-scope-and-roadmap-2026-10.md 3.1 甲 #1): every
// line here is only "the next thing you can do", never a recommendation to
// accept or decline, and it never repeats a score, a ratio or a percentage.
// The decision stays with the landlord.

export type NextStepKind =
  | 'lease'        // draft the Ontario standard lease
  | 'decision'     // send the decision notice (send_decision card on the applicant page)
  | 'follow_up'    // ask for more material / continue in the application thread
  | 'import'       // record an existing lease (/leases/import)
  | 'queue'        // back to the applicant queue
  | 'screen_again' // screen another applicant
  | 'rerun'        // re-score a failed screening with the same files

export interface NextStep {
  title: string
  desc: string
  href: string
  kind: NextStepKind
}

export interface NextStepInput {
  /** v3_tier of the screening: approve | conditional | decline | none / null */
  tier: string | null | undefined
  /** screenings.status — only scored / done rows get next steps; error rows get a re-run */
  status?: string | null
  /** screenings.application_id — present for the closed-loop (application → one-click screening) flow */
  applicationId?: string | null
  screeningId: string
  /** a lease_documents row already exists for this application (any status) */
  hasLease?: boolean
  lang: 'zh' | 'en'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Route the from-application flow already uses to re-score a row that carries its file manifest. */
export function rerunHref(screeningId: string): string {
  return `/screening/app?screening=${encodeURIComponent(screeningId)}&run=1`
}

export function nextStepsFor(input: NextStepInput): NextStep[] {
  const zh = input.lang === 'zh'
  const status = (input.status || '').toLowerCase()
  const tier = (input.tier || '').toLowerCase()
  const appId = input.applicationId && UUID_RE.test(input.applicationId) ? input.applicationId : null

  if (status === 'error') {
    return [{
      kind: 'rerun',
      title: zh ? '用原来的文件重新评分' : 'Re-score with the same files',
      desc: zh
        ? '这次筛查没有完成。文件已经在你的账号里，重跑不会再传一次。'
        : 'This screening did not finish. The files are already in your account; a re-run does not upload them again.',
      href: rerunHref(input.screeningId),
    }]
  }
  if (status && status !== 'scored' && status !== 'done') return []

  const applicantPage = appId ? `/landlord/applicants/${appId}` : null

  if (appId && applicantPage) {
    if (tier === 'approve') {
      return [
        {
          kind: 'lease',
          title: input.hasLease
            ? (zh ? '打开这份申请的租约' : 'Open the lease for this application')
            : (zh ? '起草安省标准租约' : 'Draft the Ontario standard lease'),
          desc: input.hasLease
            ? (zh ? '这份申请已经有一份租约；继续编辑或发送签署。' : 'A lease already exists for this application; keep editing or send it for signing.')
            : (zh ? '申请人与房源信息会自动填入，约 5 分钟；发送后双方在线签署。' : 'Applicant and listing details are prefilled, about 5 minutes; both sides sign online after you send it.'),
          href: `/landlord/leases/new?application_id=${appId}`,
        },
        {
          kind: 'decision',
          title: zh ? '发录取通知' : 'Send the acceptance notice',
          desc: zh
            ? '在申请人页写成待批卡，预览正文后批准即发；通知自带《消费者报告法》s.10(7) 说明。'
            : 'Drafted as an approval card on the applicant page — preview the text, then approve to send; the notice carries the Consumer Reporting Act s.10(7) statement.',
          href: applicantPage,
        },
      ]
    }
    if (tier === 'conditional') {
      return [{
        kind: 'follow_up',
        title: zh ? '请申请人补材料，或在申请对话里追问' : 'Ask for more material or follow up in the application thread',
        desc: zh
          ? '报告里标「待核实」的项可以直接问申请人；补来的文件会进同一份申请，之后可以重新筛查。'
          : 'Items the report marks as pending can be put to the applicant directly; what they add lands in the same application and can be screened again.',
        href: applicantPage,
      }]
    }
    if (tier === 'decline') {
      return [{
        kind: 'decision',
        title: zh ? '发婉拒通知（须写理由）' : 'Send a decline notice (reason required)',
        desc: zh
          ? '在申请人页写成待批卡；理由不得涉及《安省人权法典》受保护特征，通知自带 s.10(7) 说明。决定由你本人做出。'
          : 'Drafted as an approval card on the applicant page; the reason must not touch a protected ground under the Ontario Human Rights Code, and the notice carries the s.10(7) statement. The decision is yours.',
        href: applicantPage,
      }]
    }
    return [{
      kind: 'queue',
      title: zh ? '回到这份申请' : 'Back to this application',
      desc: zh ? '申请材料、对话与决定都在申请人页。' : 'Material, thread and decision all live on the applicant page.',
      href: applicantPage,
    }]
  }

  // Manually uploaded screening (no application row).
  if (tier === 'approve') {
    return [
      {
        kind: 'lease',
        title: zh ? '起草安省标准租约' : 'Draft the Ontario standard lease',
        desc: zh
          ? '约 5 分钟；发送后双方在线签署，签好自动生成在管租约。'
          : 'About 5 minutes; both sides sign online after you send it, and a signed lease becomes a managed tenancy automatically.',
        href: '/landlord/leases/new',
      },
      {
        kind: 'import',
        title: zh ? '把现有租约录进来' : 'Record an existing lease',
        desc: zh
          ? '租约、续约、报修都从这里开始：到期前 90 / 60 / 30 天自动提醒，租金记录与报修有一个共同的地方。'
          : 'Lease, renewal and repairs all start here: reminders at 90 / 60 / 30 days before the end, one place for rent records and repairs.',
        href: '/leases/import',
      },
    ]
  }
  return [
    {
      kind: 'screen_again',
      title: zh ? '再筛一位申请人' : 'Screen another applicant',
      desc: zh ? '上传下一位申请人的材料。' : 'Upload the next applicant’s material.',
      href: '/screening/app',
    },
    {
      kind: 'queue',
      title: zh ? '回到申请队列' : 'Back to the applicant queue',
      desc: zh ? '收到的申请按阶段排列，可以从那里一键筛查。' : 'Applications are grouped by stage; one-click screening starts from there.',
      href: '/landlord/applicants',
    },
  ]
}
