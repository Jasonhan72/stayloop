/** Mask a person's name for privacy display.
 *  Chinese: "陈家明" → "陈*明"   "陈家" → "陈*"
 *  English: "John Smith" → "J*** S***"   "Nick" → "N***"
 */
export function maskName(name: string | null | undefined): string {
  if (!name || !name.trim()) return '—'
  const s = name.trim()
  // Check if primarily CJK (Chinese/Japanese/Korean)
  const cjkCount = (s.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  if (cjkCount >= s.replace(/\s/g, '').length / 2) {
    // CJK name: keep first and last char, mask middle
    const chars = [...s.replace(/\s/g, '')]
    if (chars.length <= 1) return chars[0] + '*'
    if (chars.length === 2) return chars[0] + '*'
    return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1]
  }
  // Latin name: mask each word, keep first letter
  return s.split(/\s+/).map(w => w.length <= 1 ? w : w[0] + '*'.repeat(w.length - 1)).join(' ')
}
