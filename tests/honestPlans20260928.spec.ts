// 2026-09-28 · "那三类也一起改掉" — three kinds of claims that were not true.
//
// 1. "Six dimensions": the report scores four items (lib/screening/rubric.ts
//    DimKey — ability to pay, credit, rental and legal history,
//    verification). The six were V4-era dimensions that nothing writes any
//    more (0 applications carry a legacy score), yet the landlord applicant
//    page, the dashboard dialog, a landing card and the admin page said six.
//    The dashboard's application rows and the new-application email still led
//    to the V4 applicant page, which now redirects to /landlord/applicants/<id>.
// 2. "42% more listings": stamps gate no listing (trust_tier was cleared on
//    2026-09-25) and the number had no source; the stamp cards promised what
//    each stamp "unlocks", the ideas card promised more homes, and the
//    landlord preview demo screened applicants by stamp / credit ≥ 720 /
//    DTI ≤ 35% — cutoffs the product refuses to use (OHRC).
// 3. The dashboard upgrade dialog sold features that never existed and
//    disagreed with /pricing; /pricing and the /settings card each had their
//    own list too. All three now read lib/billing/landlordPlans.ts, whose Pro
//    list names only what the code actually gates behind the plan.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { LANDLORD_GO, LANDLORD_PRO } from '../lib/billing/landlordPlans'
import { STAMPS } from '../lib/passportStamps'

const read = (p: string) => readFileSync(p, 'utf8')
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
const FILES = ['app', 'components', 'lib'].flatMap((d) => sources(d))
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line)
function offending(re: RegExp) {
  const hits: string[] = []
  for (const f of FILES) read(f).split('\n').forEach((l, i) => { if (!isComment(l) && re.test(l)) hits.push(`${f}:${i + 1}`) })
  return hits
}

describe('1 · four scored items, not six', () => {
  it('nothing on the site claims six dimensions', () => {
    expect(offending(/六维|6 ?维|六个维度|[Ss]ix[- ]dimension|6-dim/)).toEqual([])
  })
  it('the sample report is built on the rubric’s four items and drops the income cutoff and "CanLII search"', () => {
    const report = read('components/landlord/ApplicantReport.tsx').split('\n').filter((l) => !isComment(l)).join('\n')
    for (const k of ['ability_to_pay', 'credit_health', 'rental_history', 'verification']) expect(report).toContain(`keys: ['${k}']`)
    expect(report).not.toMatch(/建议 ≥ 3×|3× recommended|CanLII/)
    const page = read('app/landlord/applicants/[id]/page.tsx')
    expect(page).not.toMatch(/DIM_META|Persona|Plaid|88% 续签|政策门槛|派 David/)
    // the not-yet-scored card: screening starts on the button, never "automatically after upload"
    expect(page).toMatch(/还没有筛查。点「一键筛查」/)
    expect(page).not.toMatch(/材料上传后会自动跑/)
  })
  it('the V4 applicant page is gone; old links and emails land on /landlord/applicants/<id>', () => {
    expect(existsSync('app/dashboard/applications/[id]/page.tsx')).toBe(false)
    expect(read('middleware.ts')).toMatch(/\\\/dashboard\\\/applications\(\\\/\[\^\/\]\+\)\?\\\/\?\$/)
    expect(read('app/api/notify-landlord/route.ts')).toContain('`${siteUrl}/landlord/applicants/${app.id}`')
    expect(read('app/dashboard/page.tsx')).toContain('window.location.href = `/landlord/applicants/${app.id}`')
  })
})

describe('2 · stamps unlock nothing', () => {
  it('no 42% figure and no promise that a stamp unlocks homes or speeds approvals', () => {
    expect(offending(/多 ?42%|42% more/)).toEqual([])
    expect(offending(/解锁更多房源|unlock more homes|快速通道|[Ff]ast lane|需 收入章"/)).toEqual([])
    for (const s of STAMPS) expect(`${s.gain_zh} ${s.gain_en}`).not.toMatch(/房源|更快|解锁|listings|faster|unlock/i)
    expect(read('app/tenant/passport/page.tsx')).toContain("{zh ? '房东看到' : 'LANDLORDS SEE'}")
    expect(read('app/tenant/passport/page.tsx')).not.toMatch(/申请房源时自动附上|现场出示二维码|every view lands in your audit log|每次访问都进审计日志/)
    // the share card showed a decorative, non-scannable QR captioned「看房现场出示」 — removed; there is no QR feature
    expect(read('app/tenant/passport/page.tsx')).not.toMatch(/QrPlaceholder|看房现场出示|Show at viewings/)
  })
  it('the assistant is told stamps gate nothing', () => {
    const prompts = read('lib/agent/prompts.ts')
    expect(prompts).toContain('章不限制任何房源，不要说盖章能解锁房源或加快审批')
    expect(prompts).not.toMatch(/42%/)
  })
  it('the landlord preview demo shows no cutoff screening', () => {
    expect(read('lib/agent/demo.ts')).not.toMatch(/≥ ?720|DTI ≤|需银行章|bank-stamp \//)
  })
})

describe('3 · one landlord plan list, naming only what Pro gates', () => {
  it('/pricing, the dashboard dialog and the /settings card all read lib/billing/landlordPlans.ts', () => {
    expect(read('app/pricing/page.tsx')).toMatch(/features: LANDLORD_GO\.features[\s\S]*features: LANDLORD_PRO\.features/)
    const dash = read('app/dashboard/page.tsx')
    expect(dash).toContain('LANDLORD_GO.features.map')
    expect(dash).toContain('LANDLORD_PRO.features.map')
    expect(read('components/settings/SubscriptionCard.tsx')).toContain('LANDLORD_PRO.features.slice(0, 4)')
  })
  it('none of them sells what does not exist', () => {
    const ban = /Openroom|Slack|品牌 ?apply|品牌申请页|[Bb]randed apply|优先 AI 评分|[Pp]riority AI scoring|CanLII LTB|报告导出与分享|Report export & sharing/
    const code = (f: string) => read(f).split('\n').filter((l) => !isComment(l)).join('\n')
    for (const f of ['app/dashboard/page.tsx', 'app/pricing/page.tsx', 'components/settings/SubscriptionCard.tsx', 'lib/billing/landlordPlans.ts'])
      expect(code(f), f).not.toMatch(ban)
    expect(read('lib/i18n.tsx')).not.toMatch(/'dash\.pricing\.|[Pp]riority AI scoring|优先 AI 评分/)
  })
  it('Pro lists only plan-gated features; listings, the AI Agent and leases are free for every landlord', () => {
    const pro = LANDLORD_PRO.features.map((f) => `${f.zh} ${f.en}`).join(' | ')
    expect(pro).not.toMatch(/无限发布房源|[Uu]nlimited listings|AI 助理|AI Agent|租约|[Ll]ease/)
    expect(pro).toMatch(/租客筛查不限次数/)
    expect(LANDLORD_GO.features.map((f) => f.zh).join(' ')).toMatch(/房源发布，不限套数/)
    expect(LANDLORD_GO.features.map((f) => f.zh).join(' ')).toMatch(/AI 助理、安省标准租约与电子签、续约提醒/)
  })
})
