// Enter sends, Shift+Enter is a newline — and the Enter that commits an IME
// composition (pinyin, kana, Hangul) never sends: Chrome and Firefox flag it
// isComposing, Safari reports keyCode 229 instead (sweep 2026-10-01: a Chinese
// IME user committing "King St" sent the half-typed sentence, which an
// append-only thread can never take back). Shared by every thread composer.
export type ComposerKey = {
  key: string
  shiftKey: boolean
  keyCode?: number
  nativeEvent?: { isComposing?: boolean; keyCode?: number }
}

export function isSendKey(e: ComposerKey): boolean {
  if (e.key !== 'Enter' || e.shiftKey) return false
  if (e.nativeEvent?.isComposing) return false
  if (e.keyCode === 229 || e.nativeEvent?.keyCode === 229) return false
  return true
}
