/** Eyebrows are written "EN · 中文". The English UI shows only the parts without Chinese characters. */
export function eyebrowFor(text: string, lang: string): string {
  if (lang === 'zh') return text
  const kept = text.split(' · ').filter((p) => !/[㐀-鿿]/.test(p))
  return (kept.length ? kept : [text]).join(' · ')
}
