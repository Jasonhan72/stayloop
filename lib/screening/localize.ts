// Chinese rendering of the parts of a screening report that were stored in
// English only (three-role test report 2026-09-24, SL-L-06, user: "筛查摘要也要
// 修好"). Three kinds of source, three strategies:
//
//  1. Deterministic English templates written by our own code — the rubric's
//     "observed" line per rule, and the court-source names / notes. Translated
//     HERE by template (numbers re-read from the English), so old and new
//     reports both render in Chinese without touching stored data.
//  2. Model free text (income evidence, corroboration notes, related-party
//     signals, suspicious transfers, the verification checklist). New runs
//     emit *_zh twins; older reports were back-filled once. localizeResult()
//     swaps them in when present.
//  3. Anything we cannot translate falls back to the stored English rather
//     than disappearing.
//
// Never mutate CourtQuery.source itself — renderers branch on its English
// value (isManualOnly, '──' separators, /web index/). Translate at display.
import { signalLabel } from './signalLabels'

const n = (s: string | undefined) => (s ?? '').trim()

const KIND_ZH: Record<string, string> = {
  application_form: '申请表', id_document: '证件', pay_stub: '工资单', bank_statement: '银行流水', employment_letter: '在职信',
  offer_letter: '录用信', credit_report: '征信报告', tax_document: '税单', lease: '租约', reference: '推荐信', other: '其他',
  government_id: '证件', drivers_licence: '驾照', drivers_license: '驾照', passport: '护照', pr_card: 'PR 卡', noa: '评税通知书', t4: 'T4',
  bank_letter: '银行信', rental_application: '申请表', landlord_reference: '房东推荐信',
}
const SEVERITY_ZH: Record<string, string> = { critical: '严重', high: '高', medium: '中', low: '低' }
const EXT_ZH: Record<string, string> = { identity: '身份', bank: '银行', references: '推荐人' }

/** The rubric's per-rule "observed" line, in Chinese. `observed` is the stored English. */
export function rubricObservedZh(code: string, observed: string): string {
  const o = n(observed)
  let m: RegExpMatchArray | null
  const noRent = /no target rent/.test(o) ? ' · 未填目标租金，未计算收入租金比' : ''
  switch (code) {
    case 'income_rent_ratio':
      if ((m = o.match(/^([\d.]+)x/))) return `已核实收入为租金的 ${m[1]} 倍（仅供参考，不是拒绝理由）`
      break
    case 'income_verified_no_rent':
      if ((m = o.match(/verified \$([\d,]+)\/mo/))) return `已核实月收入 $${m[1]} · 未填目标租金，未计算收入租金比`
      break
    case 'income_documented_no_bank_trail':
      if ((m = o.match(/^\$([\d,]+)\/mo on (\d+) reconciling/))) return `工资单显示月收入 $${m[1]}（${m[2]} 张可对账的工资系统工资单）· 尚无个人账户入账佐证${noRent}`
      break
    case 'income_unverified':
      if ((m = o.match(/claimed \$([\d,]+)\/mo/))) return `申报月收入 $${m[1]}，无个人账户入账佐证${noRent}`
      break
    case 'income_unknown': return '未能确定收入金额'
    case 'total_debt_service':
      if ((m = o.match(/= (\d+)% of verified income/))) return `租金 + 现有债务 = 已核实收入的 ${m[1]}%（仅供参考）`
      break
    case 'liquid_reserves':
      if ((m = o.match(/lowest balance \$([\d,]+) = ([\d.]+) months/))) return `最低余额 $${m[1]}，相当于 ${m[2]} 个月租金`
      break
    case 'nsf_events':
      if ((m = o.match(/^(\d+)/))) return `${m[1]} 笔退票 / 退回 / 透支记录`
      break
    case 'current_rent_at_or_above_target':
      if ((m = o.match(/^\$([\d,]+) recurring vs \$([\d,]+)/))) return `现在每月付房租 $${m[1]}，申请的租金 $${m[2]}`
      break
    case 'employment_probation':
    case 'employment_tenure':
      if ((m = o.match(/^(\d+) month/))) return `在职 ${m[1]} 个月`
      break
    case 'income_documents_stale':
      if ((m = o.match(/(\d+) months old/))) return `收入材料是 ${m[1]} 个月前的`
      break
    case 'credit_report_other_subject': return '转录的征信报告属于档案里的另一个人，申请人本人的报告不可用；请复核上传'
    case 'credit_report_unreliable': return '征信报告与申请人的出生日期矛盾，不能当作其信用记录'
    case 'credit_report_stale':
      if ((m = o.match(/(\d+) months before/))) return `报告早于本次筛查 ${m[1]} 个月，视为没有当前报告`
      break
    case 'no_credit_report': return '未提供征信报告'
    case 'bureau_score':
      if ((m = o.match(/^(\d+)\s*\((.*)\)$/))) return `信用分 ${m[1]}（${m[2] === 'bureau' ? '征信机构' : m[2]}）`
      break
    case 'credit_report_aging':
      if ((m = o.match(/(\d+) months old/))) return `报告已有 ${m[1]} 个月${/request a current pull/.test(o) ? '，建议重新拉取' : '，可以接受，重新拉取可选'}`
      break
    case 'revolving_utilisation':
      if ((m = o.match(/^(\d+)% of \$([\d,]+)/))) return `循环信用额度 $${m[2]}，已用 ${m[1]}%`
      break
    case 'account_over_limit':
      if ((m = o.match(/^(\d+)/))) return `${m[1]} 个账户超出额度`
      break
    case 'open_collections':
      if ((m = o.match(/^(\d+)/))) return `${m[1]} 笔催收未结清`
      break
    case 'bankruptcy':
      if ((m = o.match(/^(\d+)/))) return `破产 / 债务重组记录 ${m[1]} 条`
      break
    case 'past_due_balance':
      if ((m = o.match(/^\$([\d,]+)/))) return `当前逾期 $${m[1]}`
      break
    case 'late_payment_history':
      if ((m = o.match(/^(\d+)/))) return `${m[1]} 个账户有迟付记录`
      break
    case 'hard_inquiries':
      if ((m = o.match(/^(\d+)/))) return `12 个月内 ${m[1]} 次硬查询`
      break
    case 'thin_file':
      if ((m = o.match(/^(\S+) tradeline\(s\), (\S+) months/))) return `${m[1]} 个信贷账户、${m[2]} 个月记录——记录短只是信息，不算负面`
      break
    case 'landlord_references':
      if ((m = o.match(/^(\d+)/))) return `${m[1]} 位可联系的房东推荐人`
      break
    case 'no_landlord_reference':
      if ((m = o.match(/^(\d+) prior address/))) return `申报了 ${m[1]} 个过往地址，但没有可联系的房东`
      if (/no prior address/.test(o)) return '未提供过往地址或房东'
      break
    case 'rent_payments_observed':
      if ((m = o.match(/^\$([\d,]+) recurring in (\d+)/))) return `流水里连续 ${m[2]} 个月有 $${m[1]} 的固定付款`
      break
    case 'declared_tenure':
      if ((m = o.match(/^(\d+)/))) return `申报租住 ${m[1]} 个月`
      break
    case 'ltb_order_corroborated':
      if ((m = o.match(/^(\d+)/))) return `申报过的地址上有 ${m[1]} 份房东申请的 LTB 判令`
      break
    case 'court_defendant':
      if ((m = o.match(/^(\d+)/))) return `${m[1]} 件案件作为被告 / 债务人`
      break
    case 'documents_present':
      if ((m = o.match(/^(\d+)\/(\d+) required kinds \((.*)\)$/))) {
        const kinds = m[3] === 'none detected' ? '未识别' : m[3].split(/,\s*/).map((k) => KIND_ZH[k] ?? k).join('、')
        return `必需的 ${m[2]} 类材料有 ${m[1]} 类（${kinds}）`
      }
      break
    case 'corroborations':
      return `文件互证：${o.split(/,\s*/).map((c) => signalLabel(c, true)).join('、')}`
    case 'identity_consistent': return '证件上的姓名与申请人一致'
    case 'identity_inconsistent': return '证件上的姓名与申请人不一致'
    case 'external_verification':
      return `第三方核验：${o.split(/,\s*/).map((x) => EXT_ZH[x] ?? x).join('、')}`
    case 'cross_doc_contradiction':
      return `文件矛盾：${o.split(/,\s*/).map((part) => {
        const mm = part.match(/^(\S+) \((\w+)\)$/)
        return mm ? `${signalLabel(mm[1], true)}（${SEVERITY_ZH[mm[2]] ?? mm[2]}）` : signalLabel(part, true)
      }).join('；')}`
    case 'document_forged':
      if ((m = o.match(/^(\d+)/))) return `${m[1]} 份文件判定为伪造`
      break
    case 'application_unsigned': return '申请表没有签名'
    case 'application_mostly_blank':
    case 'application_incomplete':
      if ((m = o.match(/^(\d+)/))) return `申请表 ${m[1]} 个栏目空白`
      break
    case 'related_party_income_source': return '收入来源疑似不是独立第三方（详见下方「关联方」）'
    case 'no_external_verification': return '各文件互相一致，但还没有任何第三方核验'
    case 'references_uncalled':
      if ((m = o.match(/^(\d+)/))) return `提供了 ${m[1]} 位推荐人，尚未确认`
      break
  }
  return o
}

const SOURCE_ZH: Array<[RegExp, string]> = [
  [/^CanLII — all Ontario databases/, 'CanLII（安省全部数据库）'],
  [/^CanLII \(via public web index\)/, 'CanLII（经公开网页索引）'],
  [/^Ontario Courts Portal — Civil & Small Claims/, '安省法院门户 · 民事与小额法庭'],
  [/^LTB Order Catalogue — Ontario Open Data/, 'LTB 判令目录（安省开放数据）'],
  [/^Stayloop Verified Network/, 'Stayloop 核验网络'],
]

/** Court-source display name in Chinese; the trailing "(Name)" of a supplementary search is kept. */
export function courtSourceZh(source: string): string {
  const s = n(source)
  for (const [re, zh] of SOURCE_ZH) {
    const m = s.match(re)
    if (m) return zh + s.slice(m[0].length).replace(/^\s*\((.+)\)$/, '（$1）')
  }
  return s
}

/** Court-source note in Chinese (templates in app/api/screen-score runCourtRecordCheck + lib/ltb summarizeLtb). */
export function courtNoteZh(note: string | null | undefined): string {
  const o = n(note ?? '')
  if (!o) return ''
  let m: RegExpMatchArray | null
  if (o === 'No applicant name provided') return '没有申请人姓名'
  if (/^Full name required/.test(o)) return '需要完整姓名（名 + 姓）；只有一个名字无法可靠检索法庭记录。'
  if (/^Full-text search of canlii\.org via its public web index: no page mentions/.test(o)) return '经公开网页索引全文检索 canlii.org：没有任何页面提到这个完整姓名。'
  if ((m = o.match(/^(\d+) decision page\(s\) on canlii\.org mention this exact name/))) return `canlii.org 上有 ${m[1]} 个判决页面提到这个完整姓名。提到不等于当事人——律师、裁决员和无关案件都可能同名；请逐个阅读，这些结果不计入评分。`
  if (/^CanLII's API has no name search/.test(o)) return 'CanLII 的接口不支持按姓名检索，无法自动查询；请用链接在其网站上运行预填好的全文检索，自行阅读结果。'
  if ((m = o.match(/^Portal query failed: (.*)$/))) return `法院门户查询失败：${m[1]}`
  if ((m = o.match(/^No matches in Ontario Courts Portal(?: \((\d+) name-search results returned)?/))) return m[1] ? `安省法院门户无匹配（姓名检索返回 ${m[1]} 条结果，核对后都不是申请人本人）` : '安省法院门户无匹配'
  if ((m = o.match(/^(\d+) case\(s\) found \(of (\d+) total results; (\d+) on the defendant side\)/))) return `找到 ${m[1]} 件案件（共 ${m[2]} 条结果，其中 ${m[3]} 件为被告方）。仅姓名匹配——门户不含出生日期与地址，下结论前须核实身份。`
  if (o === 'Pro feature — coming soon') return 'Pro 功能 · 即将推出'
  if (/^Catalogue query failed for this name/.test(o)) return '这个姓名的判令目录查询失败——未检索。'
  if (/^The LTB order catalogue could not be queried/.test(o)) return 'LTB 判令目录暂时无法查询。'
  if (/^No LTB order in the published catalogue names this person as a responding tenant/.test(o)) {
    const cov = o.match(/\(catalogue currently covers (\S+) to (\S+?)(?:, ([\d,]+) orders)?\)/)
    return `在已收录的 LTB 判令中，未发现以该姓名作为被申请租客的记录${cov ? `（目录当前收录 ${cov[1]} 至 ${cov[2]}${cov[3] ? ` 共 ${cov[3]} 份判令` : ''}）` : ''}。`
  }
  if ((m = o.match(/^(\d+) (?:published )?order\(s\) name this person as a responding tenant/))) {
    const c = o.match(/(\d+) (?:of them is at an address the applicant declared|corroborated by a declared address)/)
    const namesake = /namesake/.test(o) ? '，可能是同名他人' : ''
    return `已收录判令中有 ${m[1]} 份以该姓名列为被申请租客${c && c[1] !== '0' ? `；其中 ${c[1]} 份的房屋地址与申请人申报的地址吻合` : namesake}。判令目录不含判决结果，需查看判令原件。`
  }
  return o
}

type Loc = {
  income_evidence?: string | null
  income_evidence_zh?: string | null
  rubric?: { hits?: Array<{ code: string; observed: string }> } | null
  cross_doc_verification?: {
    income_corroboration?: { observed_pattern: string; detail: string; observed_pattern_zh?: string; detail_zh?: string } | null
    related_party?: { signals: string[]; signals_zh?: string[] } | null
    suspicious_transfers?: string[]
    suspicious_transfers_zh?: string[]
    verification_checklist?: string[]
    verification_checklist_zh?: string[]
  } | null
}

/** A copy of a reconstructed screening result with the Chinese text swapped in. English UI: unchanged. */
export function localizeResult<T>(r: T, zh: boolean): T {
  if (!zh || !r || typeof r !== 'object') return r
  const src = r as unknown as Loc
  const out = { ...(r as object) } as unknown as Loc
  if (src.income_evidence_zh) out.income_evidence = src.income_evidence_zh
  if (src.rubric?.hits) out.rubric = { ...src.rubric, hits: src.rubric.hits.map((h) => ({ ...h, observed: rubricObservedZh(h.code, h.observed) })) }
  const cdv = src.cross_doc_verification
  if (cdv) {
    const c = { ...cdv }
    if (cdv.income_corroboration) c.income_corroboration = { ...cdv.income_corroboration, observed_pattern: cdv.income_corroboration.observed_pattern_zh || cdv.income_corroboration.observed_pattern, detail: cdv.income_corroboration.detail_zh || cdv.income_corroboration.detail }
    if (cdv.related_party && cdv.related_party.signals_zh?.length === cdv.related_party.signals.length && cdv.related_party.signals.length) c.related_party = { ...cdv.related_party, signals: cdv.related_party.signals_zh }
    if (cdv.suspicious_transfers_zh?.length && cdv.suspicious_transfers_zh.length === (cdv.suspicious_transfers?.length ?? 0)) c.suspicious_transfers = cdv.suspicious_transfers_zh
    if (cdv.verification_checklist_zh?.length && cdv.verification_checklist_zh.length === (cdv.verification_checklist?.length ?? 0)) c.verification_checklist = cdv.verification_checklist_zh
    out.cross_doc_verification = c
  }
  return out as unknown as T
}
