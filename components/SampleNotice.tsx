'use client'

// Site-wide "this is sample data" marker (2026-09-06). Any surface whose body
// is design-canon fixture content — or whose buttons cannot actually perform
// the action they name — carries one of these so a real user never reads
// canned numbers as their own records. /disputes has its own louder variant;
// workspace routes get this one via WorkspaceShell (DEMO_GATE / SAMPLE_NOTE).

export function SampleBanner({
  zh,
  note,
  onExit,
}: {
  zh: boolean
  /** Extra per-page sentence (what exactly is not live yet). */
  note?: { zh: string; en: string }
  /** Present on gated routes — leaves demo mode. */
  onExit?: () => void
}) {
  return (
    <div
      role="note"
      className="mb-5 flex flex-col gap-2 rounded-xl px-4 py-3 sm:flex-row sm:items-start sm:gap-3"
      style={{ background: '#FEF3C7', border: '1px solid rgba(180,83,9,0.35)' }}
    >
      <span
        className="w-fit flex-shrink-0 rounded-md px-2 py-[3px] font-mono text-[10px] font-bold uppercase tracking-wider text-white"
        style={{ background: '#B45309' }}
      >
        {zh ? '示范数据' : 'Sample data'}
      </span>
      <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-relaxed" style={{ color: '#78350F' }}>
        {zh
          ? '本页显示的是产品示范，不是你的真实记录。页面上的按钮不会执行真实操作——付款、提交、发送这类动作只会交给 AI 助手生成一张待你确认的卡片。'
          : 'This page is a product demonstration, not your live records. Its buttons do not perform real actions — paying, submitting or sending only hands the request to the AI assistant as a card for you to confirm.'}
        {note && <> {zh ? note.zh : note.en}</>}
        {onExit && (
          <>
            {' '}
            <button type="button" className="underline underline-offset-2" onClick={onExit}>
              {zh ? '退出示范' : 'Exit demo'}
            </button>
          </>
        )}
      </p>
    </div>
  )
}

export function SampleTag({ zh }: { zh: boolean }) {
  return (
    <span
      className="w-fit flex-shrink-0 rounded-full px-2 py-[2px] font-mono text-[9.5px] font-bold uppercase tracking-wider"
      style={{ background: 'rgba(180,83,9,0.12)', color: '#92400E' }}
    >
      {zh ? '示范数据' : 'Sample'}
    </span>
  )
}
