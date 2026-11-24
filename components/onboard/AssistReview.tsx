'use client'

// What a form shows after the AI Agent has filled part of it (2026-11-23): how many fields, which
// ones, what is still the person's to do, and one way back. The fields themselves carry an `AiTag`
// until the person changes them. Shared by the provider forms and the agent's registration form.
import type { AssistLink } from '@/lib/onboard/client'
import { SparkIcon } from './AssistComposer'

/** The mark beside a field the AI Agent filled and the person has not touched. */
export function AiTag({ zh }: { zh: boolean }) {
  return <span data-testid="ai-tag" className="ml-1.5 inline-flex items-center rounded-full bg-brand/10 px-1.5 py-[1px] align-middle text-[10.5px] font-semibold leading-[1.5] text-brand">{zh ? 'AI 填' : 'AI filled'}</span>
}

export default function AssistReview({ zh, filled, missing, links = [], onClear }: {
  zh: boolean
  /** names of the fields it filled, as the form labels them */
  filled: string[]
  /** what still needs the person, in the order the form asks for it */
  missing: string[]
  links?: AssistLink[]
  onClear: () => void
}) {
  if (!filled.length) return null
  const sep = zh ? '、' : ', '
  const unread = links.filter((l) => !l.ok)
  return (
    <div className="rounded-2xl border border-[#BFE6F5] bg-[#F4FBFE] p-4 sm:p-5" data-testid="assist-review">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand/10 text-brand"><SparkIcon /></span>
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="text-[15px] font-semibold text-ink" data-testid="assist-review-title">
            {zh ? `AI 助理填了 ${filled.length} 项，请逐项核对` : `The AI Agent filled in ${filled.length} ${filled.length === 1 ? 'field' : 'fields'} — please check each one`}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-body-2" data-testid="assist-review-filled">{filled.join(sep)}</p>
          {missing.length > 0 && (
            <p className="mt-2 text-[13px] leading-relaxed text-ink" data-testid="assist-review-missing">
              <b>{zh ? '还需要你来：' : 'Still yours to do: '}</b>{missing.join(sep)}
            </p>
          )}
          {unread.length > 0 && <p className="mt-2 text-[12.5px] text-amber-800" data-testid="assist-review-unread">{zh ? '有一个链接没读成，已按其余内容填写。' : 'One link could not be read; the rest was used.'}</p>}
          <p className="mt-2 text-[12px] leading-relaxed text-body-3">
            {zh ? '带「AI 填」标记的是它填的，你改过就会去掉标记。提交之前，这些内容只在你这台设备上。' : 'Fields marked “AI filled” are its work; the mark goes once you change one. Until you submit, all of this stays on your device.'}
          </p>
        </div>
        <button type="button" onClick={onClear} className="min-h-[44px] flex-none rounded-full border border-line-divider bg-white px-4 text-[13px] font-semibold text-body-2 transition hover:border-brand hover:text-brand" data-testid="assist-review-clear">
          {zh ? '清掉 AI 填的内容' : 'Clear what the AI filled'}
        </button>
      </div>
    </div>
  )
}
