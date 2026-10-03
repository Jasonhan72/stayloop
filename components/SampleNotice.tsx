'use client'

// Site-wide "this is sample data" marker (2026-09-06; a slim chip since 2026-10-03). Any surface whose
// body is design-canon fixture content — or whose buttons cannot actually perform the action they name —
// carries one so a real user never reads canned numbers as their own records. Workspace routes get it via
// WorkspaceShell (DEMO_GATE / SAMPLE_NOTE); /disputes tags each sample block with its own SampleTag.

export function SampleBanner({
  zh,
  note,
  onExit,
  text,
}: {
  zh: boolean
  /** Replaces the default sentence (for pages whose data is real but partial). */
  text?: { zh: string; en: string }
  /** Extra per-page sentence (what exactly is not live yet). */
  note?: { zh: string; en: string }
  /** Present on gated routes — leaves demo mode. */
  onExit?: () => void
}) {
  // 2026-10-03 user: 「把系统里的这些示范数据的警告条都去掉吧，这样就能多出来空间了」. The amber bar is gone;
  // what stays is one small chip (plus the exit link in demo mode) so sample content is still never read
  // as the visitor's own records. The full sentence is the chip's tooltip and is read by screen readers.
  const sentence = `${text
    ? (zh ? text.zh : text.en)
    : zh
      ? '本页显示的是产品示范，不是你的真实记录。页面上的按钮不会执行真实操作——付款、提交、发送这类动作只会交给 AI 助理生成一张待你确认的卡片。'
      : 'This page is a product demonstration, not your live records. Its buttons do not perform real actions — paying, submitting or sending only hands the request to the AI Agent as a card for you to confirm.'}${note ? ` ${zh ? note.zh : note.en}` : ''}`
  return (
    <div role="note" className="mb-3 flex items-center gap-2" data-testid="sample-chip">
      <span
        title={sentence}
        className="w-fit flex-shrink-0 cursor-help rounded-full px-2 py-[2px] font-mono text-[9.5px] font-bold uppercase tracking-wider"
        style={{ background: 'rgba(180,83,9,0.12)', color: '#92400E' }}
      >
        {zh ? '示例数据' : 'Sample data'}
      </span>
      <span className="sr-only">{sentence}</span>
      {onExit && (
        <button type="button" className="text-[11.5px] font-semibold text-body-3 underline underline-offset-2 hover:text-body" onClick={onExit}>
          {zh ? '退出演示' : 'Exit demo'}
        </button>
      )}
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
