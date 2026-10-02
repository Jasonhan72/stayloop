// The rules note under the listing's Policies grid. Ontario listings get the
// RTA s.14 / s.105–106 / s.134 note; a listing in another province gets that
// province's own verified note (lib/provinces listingRulesNote) or nothing —
// never Ontario law and never a "these rules do not apply" line (2026-10-02 ·
// user: 「外省的要查外省的法规，不要用安省的法规和说法」). Kept in its own component
// so the province / law wording is edited in one place.
import { listingRulesNote, type ProvinceCode } from '@/lib/provinces'

export function ListingRulesNote({ zh, province }: { zh: boolean; province: ProvinceCode }) {
  const text = province === 'ON'
    ? (zh
        ? '安省 RTA s.14：租约里的「禁止养宠」条款无效（共管大楼自身的规定除外）；押金只能是最后一月租金 + 钥匙押金（s.105–106、s.134）。'
        : 'Ontario RTA s.14: a “no pets” clause in a lease is void (condominium rules aside); the only deposits allowed are last month’s rent and a key deposit (s.105–106, s.134).')
    : listingRulesNote(province, zh ? 'zh' : 'en')
  if (!text) return null
  return (
    <p className="mt-3 text-[12px] leading-relaxed text-body-3" data-testid="listing-rules-note">
      {text}
    </p>
  )
}
