// Text that the server writes before it knows the reader's language — approval cards from the daily
// scan, reminders, dispatch prompts — is stored as "中文 / English" (the same convention as push
// titles and emails). On screen only the half for the UI language belongs (2026-11-17: a landlord's
// to-do page read 「租金逾期 8 天 · … / Rent 8 days overdue · …」 with both halves side by side).
// Pure and strict: anything that is not a clean pair comes back unchanged.
const CJK = /[㐀-鿿豈-﫿]/
const SEP = ' / '

/** The half of a stored "中文 / English" text for `lang`; the text itself when it is not such a pair.
 *  The boundary is the first " / " with Chinese before it and none after it, so a slash inside the
 *  Chinese half (「N1 / N2 期限」) or inside the English half does not split in the wrong place. */
export function pickCardLang(text: string | null | undefined, lang: 'zh' | 'en'): string {
  const t = text ?? ''
  let i = t.indexOf(SEP)
  while (i > 0) {
    const left = t.slice(0, i)
    const right = t.slice(i + SEP.length)
    if (!CJK.test(right)) {
      if (!CJK.test(left) || !/[A-Za-z]/.test(right)) return t
      return (lang === 'zh' ? left : right).trim()
    }
    i = t.indexOf(SEP, i + SEP.length)
  }
  return t
}
