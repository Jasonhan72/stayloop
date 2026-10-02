// Rental rules for the 12 jurisdictions outside Ontario (2026-10-02 · user:
// 「外省的要查外省的法规，不要用安省的法规和说法」).
//
// Ontario stays on lib/ontario/rules.ts — every helper here returns null / []
// for 'ON' so callers keep their Ontario code path byte-for-byte. Everything
// below comes from a fact sheet checked against each official source (the
// statute, its regulation, or the government page named in `url`), one entry
// per topic with its citation. Rules for this file:
//   · a statement here must match a verified fact (same meaning, same numbers,
//     same citation) — nothing filled in from memory, nothing generalised from
//     Ontario;
//   · a topic with no verified fact for a province is left out (null), and the
//     UI / agent says nothing about it for that province;
//   · no Ontario statute, body or term anywhere in these strings (守卫
//     tests/provinces20261002.spec.ts).
// Pure data + deterministic helpers, no 'use client'.

import { checkListingCompliance, decisionNoticeFooter, type Finding, type ListingInput } from '@/lib/ontario/rules'
import { normalizeProvince, provinceName, type NonOntarioCode, type ProvinceCode } from '@/lib/provinces/detect'

export type Lang = 'zh' | 'en'
export type Bi = { zh: string; en: string }
type Src = { cite: string; url: string }

/** Key / fob and other extra deposits: banned outright, folded into the one capped deposit,
 *  or (British Columbia) a refundable key fee no greater than the replacement cost. */
export type ExtraDepositMode = 'prohibited' | 'counts_toward_deposit' | 'replacement_cost'

export type QuebecExtras = {
  lowestRentNotice: Bi & Src & { lookbackMonths: number; tenantDays: number }
  childrenPregnancy: Bi & Src
  leaseLanguage: Bi & Src
  screeningLimits: Bi & Src
  rent2026: Bi & Src & { basePct: number }
  keyDeposit: Bi & Src & { allowed: false }
}

export type ProvinceRules = {
  code: NonOntarioCode
  statute: Bi & Src
  tribunal: Bi & Src
  leaseForm: { mandatory: boolean; name: Bi; url: string; copyDays: number | null; lines: Bi[]; cite: string }
  deposit: Bi & Src & { allowed: boolean; maxMonths: number; covers: Bi; interest: Bi | null; returnDays: number | null }
  petDeposit: Bi & Src & { allowed: boolean; maxMonths: number; combinedWithDeposit: boolean }
  keyOrOtherDeposits: Bi & Src & { allowed: boolean; key: ExtraDepositMode }
  advanceRent: Bi & Src & { maxMonths: number | null; lastMonth: 'prohibited' | 'counts_toward_deposit' | null }
  /** `inferred`: the fact reads the ban out of a general rule ("appears to be prohibited") — said that way. */
  applicationFee: (Bi & Src & { allowed: boolean | null; inferred?: boolean }) | null
  petFee: { allowed: boolean; cite: string } | null
  petBanAllowed: (Bi & Src & { value: boolean }) | null
  rentIncrease: Bi & Src & { pct2026: number | null }
  humanRights: { law: Bi; body: Bi; examples: Bi; url: string; cite: string }
  privacyLaw: Bi & Src & { access: Bi }
  leaseEnd: Bi & Src
  adverseDecision: (Bi & Src) | null
  /** The 1–3 sentences under the listing page's 租赁条件 grid. */
  listingNote: Bi
  /** Move-in money the facts say a landlord may not collect (the move-in cost card strikes these). */
  notPermitted: Bi[]
  /** Deposit interest / return rules where verified. */
  depositFootnote: Bi | null
  quebec?: QuebecExtras
}

const b = (zh: string, en: string): Bi => ({ zh, en })

const PIPEDA_URL = 'https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/r_o_p/prov-pipeda/'
const PIPEDA_BRIEF_URL = 'https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/'
// The PIPEDA access right (Sch. 1, cl. 4.9) — the same federal law in every province below that
// has no private-sector privacy statute of its own.
const PIPEDA_ACCESS = b(
  '依据联邦《个人信息保护与电子文件法》（PIPEDA），你可以要求查阅房东或平台持有的你的个人信息、了解其用途与披露对象，并对其准确性提出异议。',
  'Under the federal Personal Information Protection and Electronic Documents Act (PIPEDA) you may ask to see the personal information a landlord or platform holds about you, how it was used and to whom it was disclosed, and challenge its accuracy.',
)
const pipeda = (url: string) => ({
  zh: '联邦《个人信息保护与电子文件法》（PIPEDA）',
  en: 'the federal Personal Information Protection and Electronic Documents Act (PIPEDA)',
  cite: 'Personal Information Protection and Electronic Documents Act, S.C. 2000, c. 5 (Sch. 1, cl. 4.9)',
  url,
  access: PIPEDA_ACCESS,
})

// ───────────────────────────────────────────────────────────────────────────
// Quebec
// ───────────────────────────────────────────────────────────────────────────

const CCQ_URL = 'https://www.legisquebec.gouv.qc.ca/en/document/cs/CCQ-1991'

const QC: ProvinceRules = {
  code: 'QC',
  statute: {
    zh: '《魁北克民法典》（租赁一章）', en: 'Civil Code of Québec (chapter on lease)',
    cite: 'Civil Code of Québec, CQLR c CCQ-1991, arts. 1851–2000 (Division IV: arts. 1892–2000); Act respecting the Administrative Housing Tribunal, CQLR c T-15.01',
    url: CCQ_URL,
  },
  tribunal: {
    zh: '魁北克住房行政法庭（TAL）', en: 'Administrative Housing Tribunal (Tribunal administratif du logement, TAL)',
    cite: 'Act respecting the Administrative Housing Tribunal, CQLR c T-15.01, ss. 4, 28',
    url: 'https://www.tal.gouv.qc.ca/en',
  },
  leaseForm: {
    mandatory: true,
    name: b('TAL 强制租约表格（附表 5「住宅租约」，2026 年版）', 'TAL mandatory lease form (Schedule 5, “Lease of a Dwelling”, 2026 edition)'),
    url: 'https://www.tal.gouv.qc.ca/en/electronic-lease',
    copyDays: 10,
    cite: 'Regulation respecting mandatory lease forms and the particulars of a notice to a new lessee, CQLR c T-15.01, r. 3, ss. 1, 3, 5 (O.C. 1453-2025); Civil Code of Québec, art. 1895',
    lines: [
      b('自 1996 年 9 月 1 日起，每份新的住宅租约都必须使用 TAL 的强制表格；新版表格 2026 年 1 月 1 日生效，旧版表格可用到 2026 年 12 月 31 日（《强制租约表格条例》）。',
        'Since 1 September 1996 every new residential lease must be made on the TAL’s mandatory form; the new forms took effect on 1 January 2026 and earlier forms may be used until 31 December 2026 (Regulation respecting mandatory lease forms).'),
      b('签约后 10 天内把租约副本交给租客；口头租约则在 10 天内交付 TAL 的「强制书面文件」（《魁北克民法典》第 1895 条）。',
        'Give the tenant a copy of the lease within 10 days after entering into it; for an oral lease, give the TAL “Mandatory writing” form within 10 days (Civil Code of Québec, art. 1895).'),
      b('签约时须在租约 G 部分书面告知新租客：租约开始前 12 个月内支付过的最低租金（或 TAL 在此期间定的租金）；新租客付得更高时，可在签约后 10 天内向 TAL 申请定租。合作住房、5 年内新建或改建并在 F 部分注明的楼宇、低租金住房除外（第 1896、1950、1955 条）。',
        'At signing, Section G must tell the new tenant the lowest rent paid in the 12 months before the lease begins (or the rent the TAL fixed in that period); a new tenant paying more may apply to the TAL to fix the rent within 10 days. Housing cooperatives, buildings erected or converted 5 years ago or less (if stated in Section F) and low-rental housing are exempt (arts. 1896, 1950, 1955).'),
      b('租约和楼宇规定须以法文订立；先交付法文版本后，双方明确希望时才可以使用其他语言（如英文）（《法语宪章》第 55 条；《魁北克民法典》第 1897 条）。',
        'The lease and the building by-laws must be drawn up in French; another language (such as English) may be used only at the parties’ express wish after the French version has been given (Charter of the French Language, s. 55; Civil Code of Québec, art. 1897).'),
    ],
  },
  deposit: {
    allowed: false, maxMonths: 0,
    zh: '房东不能收取任何押金：除租金（最多预收第一个月）外，不能以押金或其他名目收取任何款项；要求押金的租约条款无效（《魁北克民法典》第 1904、1893 条）。',
    en: 'A landlord may not require any deposit: apart from rent (at most the first month in advance) no amount may be exacted, as a deposit or otherwise; a lease clause requiring a deposit is without effect (Civil Code of Québec, arts. 1904, 1893).',
    covers: b('不适用：魁北克不允许任何押金。', 'Not applicable: Quebec allows no deposit of any kind.'),
    interest: null, returnDays: null,
    cite: 'Civil Code of Québec, art. 1904 (2nd para.) and art. 1893', url: CCQ_URL,
  },
  petDeposit: {
    allowed: false, maxMonths: 0, combinedWithDeposit: false,
    zh: '不能另收宠物押金，同样受第 1904 条禁止；TAL 曾认定房东收取的 $300 宠物押金违法（《魁北克民法典》第 1904 条）。',
    en: 'A pet deposit is prohibited by the same rule; the TAL has described a $300 pet deposit taken by a landlord as illegal (Civil Code of Québec, art. 1904).',
    cite: 'Civil Code of Québec, art. 1904; TAL decision summary Leclerc c. Cantin Lévesque immobilier inc. (4 July 2024)',
    url: 'https://www.tal.gouv.qc.ca/fr/resumes-decisions-animaux-compagnie',
  },
  keyOrOtherDeposits: {
    allowed: false, key: 'prohibited',
    zh: '不能收取钥匙或门禁卡押金、入住费或租金以外的任何款项；2026 年强制租约明确写明（《魁北克民法典》第 1904 条；强制租约 D 部分）。',
    en: 'Key or fob deposits, move-in fees or any other sum besides rent may not be required; the 2026 mandatory lease says so expressly (Civil Code of Québec, art. 1904; mandatory lease, Section D).',
    cite: 'Civil Code of Québec, art. 1904 (2nd para.); mandatory lease form, Schedule 5, Section D (Regulation T-15.01, r. 3, as replaced by O.C. 1453-2025)',
    url: 'https://www.publicationsduquebec.gouv.qc.ca/fileadmin/gazette/pdf_encrypte/lois_reglements/2025A/107817.pdf',
  },
  advanceRent: {
    maxMonths: 1, lastMonth: 'prohibited',
    zh: '只能预收第一个付款期的租金，且不超过一个月，可要求在签约时支付；房东不能要求预开支票，但双方可以自愿约定（《魁北克民法典》第 1904 条）。',
    en: 'Rent may be required in advance only for the first payment period, never more than one month, and may be asked for at signing; a landlord may not require post-dated cheques, though the parties may agree to them (Civil Code of Québec, art. 1904).',
    cite: 'Civil Code of Québec, art. 1904', url: CCQ_URL,
  },
  applicationFee: {
    allowed: null,
    zh: '法律没有直接规定申请人在签约前的费用；魁北克政府指引称，信用查询可由房东支付，也可请申请人支付合理费用，且须申请人同意；没有官方来源允许收取一般申请费（《魁北克民法典》第 1904 条；魁北克政府指引）。',
    en: 'The Civil Code does not expressly deal with fees charged to an applicant before a lease exists; official Quebec guidance says the landlord may pay for a credit check or ask the applicant to pay reasonable fees for it, with the applicant’s consent; no official source authorizes a general application fee (Civil Code of Québec, art. 1904; Quebec government guidance).',
    cite: 'Civil Code of Québec, art. 1904 (silent on pre-lease applicant fees); Juridiqc (Gouvernement du Québec) guidance on credit checks',
    url: 'https://juridiqc.gouv.qc.ca/etre-locataire/trouver-un-logement/recherche-et-visite/renseignements-personnels-documents-financiers-enquete-de-credit-que-peut-vous-demander-votre-futur-proprietaire',
  },
  petFee: { allowed: false, cite: 'Civil Code of Québec, art. 1904 (2nd para.)' },
  petBanAllowed: {
    value: true,
    zh: '房东一般可以通过租约或楼宇规定禁止养宠物；补偿残障的动物（如服务犬）受宪章保护，有医疗证明的治疗需要时禁令也可能不合理。2026 年 3 月 12 日 TAL 一项裁决曾宣告某一禁宠条款无效，据报已获准上诉，法律尚未定论（《魁北克民法典》第 1894、1901 条；《魁北克人权与自由宪章》）。',
    en: 'A landlord may generally prohibit pets through the lease or the building by-laws; an animal that compensates for a disability (such as a service dog) is protected under the Charter, and a ban may be unreasonable against a tenant with medical evidence of therapeutic need. On 12 March 2026 a TAL decision annulled a no-pet clause; leave to appeal was reportedly granted, so the law is unsettled (Civil Code of Québec, arts. 1894, 1901; Charter of human rights and freedoms).',
    cite: 'Civil Code of Québec, arts. 1894, 1901; Charter of human rights and freedoms, CQLR c C-12, ss. 1, 5, 10; mandatory lease form Schedule 5, Section E; Desjardins c. Amilis inc., 2026 QCTAL 8220 (12 March 2026)',
    url: 'https://juridiqc.gouv.qc.ca/etre-locataire/trouver-un-logement/recherche-et-visite/animaux-de-compagnie-dans-le-logement-quels-sont-vos-droits-en-tant-que-locataire',
  },
  rentIncrease: {
    pct2026: null,
    zh: '魁北克没有年度涨租上限。只能在续约时以书面修改通知涨租（12 个月或以上的租约须在到期前 3–6 个月发出）；租客有一个月可以拒绝，不回复视为接受；租客拒绝后，房东须在一个月内向 TAL 申请定租，否则按原租金续约（《魁北克民法典》第 1942、1945、1947 条）。',
    en: 'Quebec has no annual rent-increase cap. Rent may be changed only at renewal, by a written notice of modification (3–6 months before the end of a lease of 12 months or more); the tenant has one month to refuse, and silence means acceptance; if the tenant refuses, the landlord has one month to ask the TAL to fix the rent, failing which the lease renews at the same rent (Civil Code of Québec, arts. 1942, 1945, 1947).',
    cite: 'Civil Code of Québec, arts. 1906, 1942, 1943, 1945, 1947, 1953, 1955, 1956; Regulation respecting the criteria for the fixing of rent, CQLR c T-15.01, r. 2',
    url: 'https://www.tal.gouv.qc.ca/en/renewal-of-the-lease-and-fixing-of-rent/rent-increase',
  },
  humanRights: {
    law: b('《魁北克人权与自由宪章》', 'the Charter of human rights and freedoms'),
    body: b('魁北克人权与青少年权利委员会（CDPDJ）', 'the Commission des droits de la personne et des droits de la jeunesse (CDPDJ)'),
    examples: b('怀孕、有子女（民事状态）、领取社会救助（社会状况）', 'pregnancy, having children (civil status), receiving social assistance (social condition)'),
    url: 'https://www.cdpdj.qc.ca/en/our-services/toolbox/rent-without-discrimination',
    cite: 'Charter of human rights and freedoms, CQLR c C-12, ss. 10, 10.1, 12, 13; Civil Code of Québec, art. 1899',
  },
  privacyLaw: {
    zh: '《私营部门个人信息保护法》', en: 'the Act respecting the protection of personal information in the private sector',
    cite: 'Act respecting the protection of personal information in the private sector, CQLR c P-39.1, ss. 4, 5, 8, 12.1, 17, 27',
    url: 'https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1',
    access: b('依据《私营部门个人信息保护法》第 27 条，你有权查阅房东持有的你的个人信息。',
      'Under section 27 of the Act respecting the protection of personal information in the private sector you may access the personal information the landlord holds about you.'),
  },
  leaseEnd: {
    zh: '固定期限租约到期时依法按相同条件、相同期限自动续约（原租期超过 12 个月的续 12 个月），不会转为按月租约；租客不想续约，须在与房东修改通知相同的期限内通知（12 个月或以上的租约为到期前 3–6 个月）；房东不能单纯拒绝续约，只能依法收回或驱逐（《魁北克民法典》第 1941、1942、1946、1957–1960 条）。',
    en: 'A fixed-term lease renews automatically at term on the same conditions and for the same term (12 months if the original term exceeded 12 months) and does not turn into a month-to-month lease; a tenant who wants to leave gives notice of non-renewal within the same periods as a landlord’s modification notice (3–6 months before the end of a lease of 12 months or more); the landlord cannot simply refuse to renew and may only repossess or evict on legal grounds (Civil Code of Québec, arts. 1941, 1942, 1946, 1957–1960).',
    cite: 'Civil Code of Québec, arts. 1936, 1941, 1942, 1945, 1946, 1957–1960', url: CCQ_URL,
  },
  // No adverse-action notice duty for credit reports was found in Quebec law (verified absence).
  adverseDecision: null,
  listingNote: b(
    '房东不能收取任何押金（包括钥匙押金和宠物押金），最多只能预收第一个月租金，也不能要求预开支票（《魁北克民法典》第 1904 条）。房东一般可以在租约中约定不允许养宠物，但补偿残障的动物（如服务犬）除外；2026 年 3 月魁北克住房行政法庭（TAL）一项裁决曾宣告某一禁宠条款无效，据报已获准上诉（第 1901 条；《魁北克人权与自由宪章》）。住宅租约必须使用 TAL 的强制表格，签约后 10 天内交给租客一份（第 1895 条）。',
    'A landlord may not collect any deposit (key and pet deposits included), may collect at most the first month’s rent in advance, and may not require post-dated cheques (Civil Code of Québec, art. 1904). A landlord may generally prohibit pets in the lease, except an animal that compensates for a disability (such as a service dog); in March 2026 a decision of the Administrative Housing Tribunal (TAL) annulled a no-pet clause, and leave to appeal was reportedly granted (art. 1901; Charter of human rights and freedoms). Residential leases must use the TAL’s mandatory form, with a copy to the tenant within 10 days of signing (art. 1895).',
  ),
  notPermitted: [
    b('任何押金（含钥匙押金、宠物押金）', 'any deposit (key and pet deposits included)'),
    b('超过第一个月的预付租金', 'rent in advance beyond the first month'),
    b('要求预开支票', 'requiring post-dated cheques'),
  ],
  depositFootnote: b(
    '魁北克不允许任何押金，所以没有押金利息或退还期限的规定；房东可以在签约时收取第一个月租金（《魁北克民法典》第 1904 条）。',
    'Quebec allows no deposit, so there are no deposit interest or return rules; the landlord may collect the first month’s rent at signing (Civil Code of Québec, art. 1904).',
  ),
  quebec: {
    lowestRentNotice: {
      lookbackMonths: 12, tenantDays: 10,
      zh: '签约时房东须在租约 G 部分书面告知新租客：租约开始前 12 个月内支付过的最低租金，或 TAL 在此期间定的租金；12 个月内没有租金时写明最后一次租金及日期。新租客付得更高时，可在签约后 10 天内向 TAL 申请定租；没有收到通知的为租约开始后 2 个月内。通知虚假或房东故意不发，租客可要求惩罚性赔偿（2024 年 2 月 21 日起订立的租约）（《魁北克民法典》第 1896、1950 条）。',
      en: 'At signing the landlord must tell the new tenant in Section G of the lease the lowest rent paid in the 12 months before the lease begins, or the rent the TAL fixed in that period; if no rent was paid in those 12 months, the last rent paid and its date. A new tenant paying more may apply to the TAL to fix the rent within 10 days after entering into the lease, or within 2 months after it begins if no notice was given. A false notice, or a landlord who knowingly gives none, can lead to punitive damages (leases entered into from 21 February 2024) (Civil Code of Québec, arts. 1896, 1950).',
      cite: 'Civil Code of Québec, arts. 1896, 1950, 1955 (as amended by S.Q. 2019, c. 28, s. 148 and S.Q. 2024, c. 2, ss. 3, 9); Regulation T-15.01, r. 3, s. 4 and Schedule 5 Section G (O.C. 1453-2025)',
      url: 'https://www.tal.gouv.qc.ca/en/signing-a-lease/notice-to-a-new-lessee',
    },
    childrenPregnancy: {
      zh: '房东不能仅因申请人怀孕或有子女而拒绝出租、拒绝维持其权利或附加更苛刻的条件，除非住房面积确有理由；可判惩罚性赔偿（《魁北克民法典》第 1899 条）。',
      en: 'A landlord may not refuse to lease, refuse to maintain a tenant in their rights, or impose more onerous conditions solely because the person is pregnant or has children, unless the size of the dwelling warrants it; punitive damages may be awarded (Civil Code of Québec, art. 1899).',
      cite: 'Civil Code of Québec, art. 1899', url: CCQ_URL,
    },
    leaseLanguage: {
      zh: '租约和楼宇规定须以法文订立，所有通知须与租约使用同一语言；由房东拟定条款的租约，只有先交付法文版本、租客随后明确选择英文时，英文版本才对其有约束力，房东不能为法文版本收费（《法语宪章》第 55 条；《魁北克民法典》第 1897、1898 条）。',
      en: 'The lease and building by-laws must be drawn up in French, and all notices must be in the language of the lease; for a lease whose terms the landlord imposes, the tenant is bound by an English version only if the French version was first given and the tenant then expressly chose English, and the landlord may not charge for the French version (Charter of the French Language, s. 55; Civil Code of Québec, arts. 1897, 1898).',
      cite: 'Charter of the French Language, CQLR c C-11, s. 55 (as amended by S.Q. 2022, c. 14, s. 45, in force 1 June 2023); Civil Code of Québec, arts. 1897, 1898',
      url: 'https://www.legisquebec.gouv.qc.ca/en/document/cs/C-11',
    },
    screeningLimits: {
      zh: '房东只能收集评估租房申请所必需的信息：姓名和现住址；可以查看但不能复印、拍照或记录身份证件；现任或前任房东的姓名和联系方式；经申请人同意，可仅凭姓名、地址和出生日期做信用查询。不需要也不能要求：社会保险号、驾照号或驾照、健康卡号、护照资料、任何证件的复印件或照片；申请人拒绝提供证件号码时不能因此拒绝其申请。职业、薪资、雇主、银行资料和作废支票也不是必需的，只能由申请人自愿提供（《私营部门个人信息保护法》第 4、5、9 条；魁北克信息查阅委员会（CAI）指引）。',
      en: 'A landlord may collect only the information needed to assess a rental application: full name and current address; seeing — not copying, photographing or recording the details of — an ID document; names and contact details of current or previous landlords; and, with the applicant’s consent, a credit check using only name, address and date of birth. Not needed and may not be required: the social insurance number, a driver’s licence or its number, the health-card number, passport details, or copies or photos of any ID; an applicant who declines to give ID numbers may not be refused for that. Job, salary, employer, bank details and a void cheque are not required either and may only be volunteered (Act respecting the protection of personal information in the private sector, ss. 4, 5, 9; Commission d’accès à l’information (CAI) guidance).',
      cite: 'Act respecting the protection of personal information in the private sector, CQLR c P-39.1, ss. 4, 5, 9; Commission d’accès à l’information du Québec guidance “Signature d’un bail”',
      url: 'https://www.cai.gouv.qc.ca/protection-renseignements-personnels/sujets-et-domaines-dinteret/signature-bail',
    },
    rent2026: {
      basePct: 3.1,
      zh: '续约修改通知在 2026 年 1 月 1 日或之后发出时，TAL 定租使用的基本比例为 3.1%（适用于 2026 年 4 月 2 日至 2027 年 4 月 1 日开始的续约租期）；这是计算参考，不是上限，双方仍可自由约定涨幅（《租金确定标准条例》）。',
      en: 'Where the notice of modification was given on or after 1 January 2026, the base percentage the TAL applies when fixing rent is 3.1% (for renewed leases beginning 2 April 2026 – 1 April 2027); it is a reference for the calculation, not a cap, and the parties remain free to agree on any increase (Regulation respecting the criteria for the fixing of rent).',
      cite: 'Regulation respecting the criteria for the fixing of rent, CQLR c T-15.01, r. 2, ss. 3, 3.1, 4, 4.1 (O.C. 1455-2025, in force 1 January 2026)',
      url: 'https://www.tal.gouv.qc.ca/en/renewal-of-the-lease-and-fixing-of-rent/applicable-percentages-to-the-criteria-for-the-fixing-of-rent',
    },
    keyDeposit: {
      allowed: false,
      zh: 'TAL 明确：房东不能收取任何超出租金的款项，包括钥匙押金；规定此类款项的租约条款无效，租客无须遵守（《魁北克民法典》第 1904 条；TAL「支付租金」指引）。',
      en: 'The TAL states that a landlord cannot charge any amount beyond rent, including a key deposit; a lease clause providing for one is invalid and the tenant need not comply (Civil Code of Québec, art. 1904; TAL guidance “Paying the rent”).',
      cite: 'Civil Code of Québec, art. 1904 (2nd para.); TAL guidance “Paying the rent”; mandatory lease form Schedule 5, Section D',
      url: 'https://www.tal.gouv.qc.ca/en/being-a-lessee/paying-the-rent',
    },
  },
}

// ───────────────────────────────────────────────────────────────────────────
// British Columbia
// ───────────────────────────────────────────────────────────────────────────

const BC_RTA_URL = 'https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/02078_01'

const BC: ProvinceRules = {
  code: 'BC',
  statute: {
    zh: '《住宅租赁法》及《住宅租赁条例》', en: 'Residential Tenancy Act and Residential Tenancy Regulation',
    cite: 'Residential Tenancy Act, SBC 2002, c. 78; Residential Tenancy Regulation, B.C. Reg. 477/2003', url: BC_RTA_URL,
  },
  tribunal: {
    zh: '住宅租赁处（RTB）', en: 'Residential Tenancy Branch (RTB)',
    cite: 'Residential Tenancy Act, SBC 2002, c. 78, s. 58; Residential Tenancy Regulation s. 8',
    url: 'https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies',
  },
  leaseForm: {
    mandatory: false,
    name: b('RTB-1 住宅租赁协议（政府范本，可选用）', 'Form RTB-1, Residential Tenancy Agreement (optional)'),
    url: 'https://www2.gov.bc.ca/assets/gov/housing-and-tenancy/residential-tenancies/forms/rtb1.pdf',
    copyDays: 21,
    cite: 'Residential Tenancy Act, SBC 2002, c. 78, ss. 12, 13(1)–(3); Residential Tenancy Regulation ss. 12–13 and Schedule; Form RTB-1',
    lines: [
      b('不强制使用政府表格，但每份租约都必须由房东书面准备，包含法定标准条款，并由双方签名、注明日期（《住宅租赁法》第 13(1) 条；《住宅租赁条例》第 12–13 条）。',
        'No single government form is mandatory, but the landlord must prepare every tenancy agreement in writing, with the prescribed standard terms, signed and dated by both parties (Residential Tenancy Act, s. 13(1); Residential Tenancy Regulation, ss. 12–13).'),
      b('住宅租赁处的 RTB-1 表格已经包含标准条款；即使租约没有书面订立，标准条款也同样适用（第 12 条）。',
        'The Branch’s Form RTB-1 already contains the standard terms; the standard terms apply even when the agreement is not in writing (s. 12).'),
      b('双方订立租约后 21 天内，房东须把租约副本交给租客（第 13(3) 条）。',
        'The landlord must give the tenant a copy within 21 days after they enter into the agreement (s. 13(3)).'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 0.5,
    zh: '押金最多半个月租金，只能在订立租约时收取，每份租约只能收一份；房东只能在租客书面同意或住宅租赁处命令下保留其中任何部分（《住宅租赁法》第 19(1)、20、38(4) 条）。',
    en: 'The security deposit is capped at half a month’s rent, may be required only when the agreement is entered into, and only one is allowed per tenancy; the landlord may keep any part only with the tenant’s written agreement or a Branch order (Residential Tenancy Act, ss. 19(1), 20, 38(4)).',
    covers: b('担保租客的责任或义务，如欠租或损坏。', 'Secures the tenant’s liabilities or obligations, such as unpaid rent or damage.'),
    interest: b('利率为最优惠利率减 4.5%，按年复利；2026 年为 0%（《住宅租赁条例》第 4 条）。', 'Interest is prime minus 4.5%, compounded annually; the 2026 rate is 0% (Residential Tenancy Regulation, s. 4).'),
    returnDays: 15,
    cite: 'Residential Tenancy Act, SBC 2002, c. 78, ss. 1, 17, 19(1), 20, 38; Residential Tenancy Regulation s. 4', url: BC_RTA_URL,
  },
  petDeposit: {
    allowed: true, maxMonths: 0.5, combinedWithDeposit: false,
    zh: '只有房东允许养宠物时才可收取宠物损坏押金，最多半个月租金，与押金分开另计，每份租约只能收一份；不得收取每月或其他宠物费，也不得为经认证的导盲犬或服务犬收取（《住宅租赁法》第 18(2)、19(1)、20 条）。',
    en: 'Only if the landlord permits a pet: a pet damage deposit of up to half a month’s rent, in addition to the security deposit, and only one per tenancy; monthly or other pet fees are not allowed, and no deposit may be charged for a certified guide or service dog (Residential Tenancy Act, ss. 18(2), 19(1), 20).',
    cite: 'Residential Tenancy Act, SBC 2002, c. 78, ss. 18(2), 19(1), 20(c)–(d), 38(7)',
    url: 'https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies/starting-a-tenancy/deposits-fees',
  },
  keyOrOtherDeposits: {
    allowed: true, key: 'replacement_cost',
    zh: '除押金和宠物损坏押金外，唯一可退的收费是钥匙或门禁卡费用：退还钥匙时须退回，金额不得超过直接更换成本，钥匙是租客唯一进出方式时不得收取；不得收取访客费（《住宅租赁条例》第 5–7 条）。',
    en: 'Besides the security deposit and the pet damage deposit, the only refundable charge is a fee for a key or access device: refundable when it is returned, no greater than the direct replacement cost, and not chargeable if it is the tenant’s sole means of access; guest fees are prohibited (Residential Tenancy Regulation, ss. 5–7).',
    cite: 'Residential Tenancy Act, SBC 2002, c. 78, s. 20(b), (d); Residential Tenancy Regulation, B.C. Reg. 477/2003, ss. 5, 6, 7',
    url: 'https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/477_2003',
  },
  advanceRent: {
    maxMonths: null, lastMonth: null,
    zh: '法律没有明确限制预付租金；租约写明时房东可要求预开支票，未用的须在租约最后一天前退还；以任何名义作为担保的款项都算押金，受半个月上限约束（《住宅租赁法》第 1、19、20 条）。',
    en: 'Neither the Act nor the Regulation caps rent paid in advance; a landlord may require post-dated cheques if the agreement says so, and unused ones must be returned by the last day of the tenancy; any money held as security, whatever it is called, is a security deposit under the half-month cap (Residential Tenancy Act, ss. 1, 19, 20).',
    cite: 'Residential Tenancy Act, SBC 2002, c. 78, ss. 1 (“security deposit”), 19, 20, 22; Residential Tenancy Regulation Schedule s. 5(4)',
    url: 'https://www2.gov.bc.ca/assets/gov/housing-and-tenancy/residential-tenancies/information-sheets/rent.pdf',
  },
  applicationFee: {
    allowed: false,
    zh: '房东不得为接受、处理租房申请、调查申请人是否合适（如筛查或信用查询）或接受其为租客收取任何费用（《住宅租赁法》第 15 条）。',
    en: 'A landlord may not charge anything for accepting or processing a rental application, investigating the applicant’s suitability (such as screening or credit checks) or accepting the person as a tenant (Residential Tenancy Act, s. 15).',
    cite: 'Residential Tenancy Act, SBC 2002, c. 78, s. 15', url: BC_RTA_URL,
  },
  petFee: { allowed: false, cite: 'Residential Tenancy Act, SBC 2002, c. 78, ss. 18(2), 19(1), 20(c)–(d)' },
  petBanAllowed: {
    value: true,
    zh: '租约可以禁止养宠物，或限制宠物的大小、种类和数量；但经认证的导盲犬和服务犬不是宠物，不能拒绝，《人权法典》下的残障便利义务也可能适用（《住宅租赁法》第 18(1)、(3) 条）。',
    en: 'A tenancy agreement may prohibit pets or restrict their size, kind or number; certified guide and service dogs are not pets and cannot be refused, and disability accommodation under the Human Rights Code may also apply (Residential Tenancy Act, s. 18(1), (3)).',
    cite: 'Residential Tenancy Act, SBC 2002, c. 78, s. 18(1), (3); Residential Tenancy Regulation Schedule s. 3', url: BC_RTA_URL,
  },
  rentIncrease: {
    pct2026: 2.3,
    zh: '对现有租客每 12 个月最多涨一次，须用 RTB-7 表格提前至少 3 个整月书面通知；2026 年涨幅上限为 2.3%，超出须租客书面同意或住宅租赁处批准；上限只适用于现有租客，新租约的租金由双方约定（《住宅租赁法》第 41–43 条；《住宅租赁条例》第 22 条）。',
    en: 'Rent for an existing tenant may rise only once every 12 months, with at least 3 full months’ written notice on Form RTB-7; the 2026 limit is 2.3%, and more needs the tenant’s written agreement or the Branch’s approval; the limit applies to existing tenants, and rent for a new tenancy is set by agreement (Residential Tenancy Act, ss. 41–43; Residential Tenancy Regulation, s. 22).',
    cite: 'Residential Tenancy Act, SBC 2002, c. 78, ss. 41–43; Residential Tenancy Regulation ss. 2(1), 22, 23–23.4',
    url: 'https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies/rent-rtb/rent-increases',
  },
  humanRights: {
    law: b('不列颠哥伦比亚省《人权法典》', 'British Columbia’s Human Rights Code'),
    body: b('不列颠哥伦比亚省人权审裁处', 'the BC Human Rights Tribunal'),
    examples: b('家庭状况（如有子女）、合法收入来源（含社会救助）', 'family status (such as having children), lawful source of income (including income assistance)'),
    url: 'https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/00_96210_01',
    cite: 'Human Rights Code, RSBC 1996, c. 210, s. 10',
  },
  privacyLaw: {
    zh: '不列颠哥伦比亚省《个人信息保护法》（PIPA）', en: 'British Columbia’s Personal Information Protection Act (PIPA)',
    cite: 'Personal Information Protection Act, SBC 2003, c. 63, s. 3',
    url: 'https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/03063_01',
    access: b('你的个人信息受不列颠哥伦比亚省《个人信息保护法》（PIPA）保护。', 'Your personal information is protected under British Columbia’s Personal Information Protection Act (PIPA).'),
  },
  leaseEnd: {
    zh: '固定期限租约到期后视为按月续租、条件不变，除非双方另订新约，或租约依法要求租客搬出（仅限房东本人或近亲将入住等情形）；租客结束按月租约须书面通知，最早在房东收到通知一个月后、租金到期日前一天生效（《住宅租赁法》第 44、45 条；《住宅租赁条例》第 13.1 条）。',
    en: 'At the end of a fixed term the tenancy is deemed renewed month to month on the same terms, unless the parties make a new agreement or the agreement lawfully requires the tenant to move out (only where the landlord or a close family member will occupy the unit); a tenant ends a periodic tenancy with written notice effective no earlier than one month after the landlord receives it, on the day before rent is due (Residential Tenancy Act, ss. 44, 45; Residential Tenancy Regulation, s. 13.1).',
    cite: 'Residential Tenancy Act, SBC 2002, c. 78, ss. 44(1)(b), 44(3), 45(1)–(2); Residential Tenancy Regulation s. 13.1', url: BC_RTA_URL,
  },
  adverseDecision: {
    zh: '如本决定全部或部分基于信用报告，你可在收到本通知后 60 天内要求房东告知出具报告的机构名称和地址（《商业行为与消费者保护法》第 110 条）。',
    en: 'If this decision relied wholly or partly on a credit report, you may, within 60 days of receiving this notice, ask the landlord for the name and address of the reporting agency (Business Practices and Consumer Protection Act, s. 110).',
    cite: 'Business Practices and Consumer Protection Act, SBC 2004, c. 2, ss. 108(1)(a)(ii), 110',
    url: 'https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_07',
  },
  listingNote: b(
    '押金最多半个月租金；只有允许养宠物时，才可另收最多半个月租金的宠物损坏押金；不得收取申请费或筛查费（《住宅租赁法》第 15、19 条）。租约可以禁止养宠物，但经认证的导盲犬和服务犬不是宠物，不能拒绝（第 18 条）。租约须书面订立并包含法定标准条款，订立后 21 天内交给租客一份；纠纷由住宅租赁处（RTB）处理（第 13、58 条）。',
    'The security deposit is capped at half a month’s rent, plus — only if a pet is permitted — a pet damage deposit of up to half a month’s rent; application and screening fees are prohibited (Residential Tenancy Act, ss. 15, 19). A lease may prohibit pets, but certified guide and service dogs are not pets and cannot be refused (s. 18). The agreement must be in writing with the standard terms, with a copy to the tenant within 21 days; disputes go to the Residential Tenancy Branch (RTB) (ss. 13, 58).',
  ),
  notPermitted: [
    b('申请费、筛查费或信用查询费', 'application, screening or credit-check fees'),
    b('每月或其他宠物费', 'monthly or other pet fees'),
    b('访客费', 'guest fees'),
  ],
  depositFootnote: b(
    '押金和宠物损坏押金的利率为最优惠利率减 4.5%（2026 年为 0%）；租约结束与收到租客书面转寄地址两者中较晚一日起 15 天内，房东须退还押金和利息或申请纠纷解决，否则须付给租客双倍（《住宅租赁法》第 38 条；《住宅租赁条例》第 4 条）。',
    'Deposits earn prime minus 4.5% (0% in 2026). Within 15 days after the later of the end of the tenancy and receipt of the tenant’s forwarding address in writing, the landlord must repay the deposit with interest or apply for dispute resolution, or else pay the tenant double (Residential Tenancy Act, s. 38; Residential Tenancy Regulation, s. 4).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// Alberta
// ───────────────────────────────────────────────────────────────────────────

const AB_RTA_URL = 'https://kings-printer.alberta.ca/documents/Acts/R17P1.pdf'
const AB_HANDBOOK_URL = 'https://open.alberta.ca/dataset/b20cb59c-1727-42e5-a1e6-bc253f2c904f/resource/3a353c8b-d656-49e7-aa11-4a3d9595002d/download/sartr-rta-handbook-2025-06.pdf'

const AB: ProvinceRules = {
  code: 'AB',
  statute: { zh: '《住宅租赁法》', en: 'Residential Tenancies Act', cite: 'Residential Tenancies Act, SA 2004, c. R-17.1', url: AB_RTA_URL },
  tribunal: {
    zh: '住宅租赁纠纷解决服务处（RTDRS）', en: 'Residential Tenancy Dispute Resolution Service (RTDRS)',
    cite: 'Residential Tenancies Act, SA 2004, c. R-17.1, ss. 1(1)(c), 54.1–54.2; Residential Tenancy Dispute Resolution Service Regulation, Alta. Reg. 98/2006',
    url: 'https://www.alberta.ca/residential-tenancy-dispute-resolution-service',
  },
  leaseForm: {
    mandatory: false,
    name: b('没有政府规定的租约格式', 'No government-prescribed lease form'),
    url: AB_HANDBOOK_URL,
    copyDays: 21,
    cite: 'Residential Tenancies Act, SA 2004, c. R-17.1, ss. 1(1)(m), 17, 18, 19',
    lines: [
      b('租约可以书面、口头或默示订立，任何格式都可以，但不能放弃法定权利（《住宅租赁法》第 1(1)(m) 条）。',
        'The agreement may be written, oral or implied and any form may be used, but it cannot waive rights under the Act (Residential Tenancies Act, s. 1(1)(m)).'),
      b('书面租约由租客签字交回后 21 天内，房东须送达一份房东签字的副本；送达前租客可以暂缓付租（第 17 条）。',
        'For a written agreement, the landlord must serve a copy signed by the landlord within 21 days after the tenant signs and returns it; the tenant may withhold rent until served (s. 17).'),
      b('租客入住后 7 天内，房东须送达「房东通知」或张贴在公共区域；入住和搬出时都须完成检查报告（第 18、19 条）。',
        'The landlord must serve a “notice of landlord” within 7 days after the tenant takes possession, or post it in a common area, and must complete move-in and move-out inspection reports (ss. 18, 19).'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 1,
    zh: '押金与所有可退的宠物、钥匙等押金合计不得超过一个月租金，之后不能提高；须在 2 个银行工作日内存入阿尔伯塔金融机构的计息信托账户（《住宅租赁法》第 43、44 条）。',
    en: 'The security deposit plus every refundable pet, key or other deposit may not exceed one month’s rent and cannot be increased later; it must go into an interest-bearing trust account at an Alberta institution within 2 banking days (Residential Tenancies Act, ss. 43, 44).',
    covers: b('担保租客按租约应承担的费用；正常损耗不能扣除，损坏扣款须有合规的检查报告。', 'Secures what the tenant owes under the agreement; normal wear and tear cannot be deducted, and damage deductions require compliant inspection reports.'),
    interest: b('每年付息，2026 年利率为 0.0%（《押金利率条例》）。', 'Interest is payable annually; the 2026 rate is 0.0% (Security Deposit Interest Rate Regulation).'),
    returnDays: 10,
    cite: 'Residential Tenancies Act, SA 2004, c. R-17.1, ss. 1(1)(n), 43–46; Security Deposit Interest Rate Regulation, Alta. Reg. 190/2004', url: AB_RTA_URL,
  },
  petDeposit: {
    allowed: true, maxMonths: 1, combinedWithDeposit: true,
    zh: '阿尔伯塔没有单独的宠物押金：可退的宠物押金算作押金的一部分，与押金合计不超过一个月租金；租约中约定的不可退宠物费视为租金，不受押金上限限制（《住宅租赁法》第 1(1)(n)、43 条；政府租赁手册）。',
    en: 'Alberta has no separate pet deposit: a refundable pet deposit is part of the security deposit and the two together may not exceed one month’s rent; a non-refundable pet fee agreed in the lease is treated as rent and is not subject to the deposit cap (Residential Tenancies Act, ss. 1(1)(n), 43; Residential Tenancies Act Handbook).',
    cite: 'Residential Tenancies Act, SA 2004, c. R-17.1, ss. 1(1)(n), 43; Residential Tenancies Act Handbook (Service Alberta, June 2025), “Key or pet fees”', url: AB_HANDBOOK_URL,
  },
  keyOrOtherDeposits: {
    allowed: true, key: 'counts_toward_deposit',
    zh: '钥匙、门禁卡、车位、宠物等可退押金都算作押金，合计不超过一个月租金；租约约定的不可退费用视为租金，应反映房东的实际成本；房东不能为同意转租收费（《住宅租赁法》第 1(1)(n)、43 条；政府租赁手册）。',
    en: 'Every refundable fee or deposit — keys, fobs, parking, pets — counts as part of the security deposit, so the total may not exceed one month’s rent; non-refundable fees agreed in the lease count as rent and should reflect the landlord’s actual costs; no fee may be charged for consenting to a sublet (Residential Tenancies Act, ss. 1(1)(n), 43; Residential Tenancies Act Handbook).',
    cite: 'Residential Tenancies Act, SA 2004, c. R-17.1, ss. 1(1)(n), 43; Residential Tenancies Act Handbook (Service Alberta, June 2025)', url: AB_HANDBOOK_URL,
  },
  advanceRent: {
    maxMonths: null, lastMonth: 'counts_toward_deposit',
    zh: '法律没有限制预付租金，也没有规定预开支票；任何作为担保或附条件退还的款项（如可退的「最后一个月」押金）都算押金，计入一个月上限（《住宅租赁法》第 1(1)(n)、43 条）。',
    en: 'The Act has no rule limiting prepaid rent or on post-dated cheques; money held as security or returnable on a condition (such as a refundable “last month” deposit) is a security deposit and counts toward the one-month cap (Residential Tenancies Act, ss. 1(1)(n), 43).',
    cite: 'Residential Tenancies Act, SA 2004, c. R-17.1, ss. 1(1)(n), 43, 60(4)', url: AB_RTA_URL,
  },
  applicationFee: {
    allowed: null,
    zh: '法律没有规定申请费；政府租赁手册认为房东收取申请费并不被禁止，不愿付费的申请人可以不申请；其中可退的部分算作押金（政府租赁手册）。',
    en: 'The Act is silent on application fees; the government handbook treats them as not prohibited (an applicant who does not want to pay need not apply), and any refundable portion counts as a deposit (Residential Tenancies Act Handbook).',
    cite: 'Residential Tenancies Act, SA 2004, c. R-17.1 (no provision); Residential Tenancies Act Handbook (Service Alberta, June 2025), “Application fees”', url: AB_HANDBOOK_URL,
  },
  petFee: { allowed: true, cite: 'Residential Tenancies Act Handbook (Service Alberta, June 2025), “Key or pet fees”' },
  petBanAllowed: {
    value: true,
    zh: '房东可以拒绝养宠物或在租约中约定禁养；但依据《服务犬法》和《盲人权利法》，不能拒绝持有经训练的服务犬或导盲犬的残障人士（政府租赁手册）。',
    en: 'A landlord may refuse pets or include a “no pets” clause, but under the Service Dogs Act and the Blind Persons’ Rights Act may not deny tenancy to a disabled person with a trained service or guide dog (Residential Tenancies Act Handbook).',
    cite: 'Residential Tenancies Act Handbook (Service Alberta, June 2025), “Pets”; Service Dogs Act, SA 2007, c. S-7.5; Blind Persons’ Rights Act, RSA 2000, c. B-3', url: AB_HANDBOOK_URL,
  },
  rentIncrease: {
    pct2026: null,
    zh: '阿尔伯塔没有涨租上限；每 365 天最多涨一次，一年或以上的固定租期内不能涨租；按月租约须提前至少 3 个租赁月书面通知，不合规的通知无效（《住宅租赁法》第 14 条；《住宅租赁部长条例》第 3 条）。',
    en: 'Alberta has no rent cap; rent may rise only once every 365 days and not during a fixed term of one year or more; a monthly tenancy needs at least 3 tenancy months’ written notice, and a non-compliant notice is void (Residential Tenancies Act, s. 14; Residential Tenancies Ministerial Regulation, s. 3).',
    cite: 'Residential Tenancies Act, SA 2004, c. R-17.1, s. 14; Residential Tenancies Ministerial Regulation, Alta. Reg. 211/2004, s. 3', url: AB_HANDBOOK_URL,
  },
  humanRights: {
    law: b('《阿尔伯塔人权法》', 'the Alberta Human Rights Act'),
    body: b('阿尔伯塔人权委员会', 'the Alberta Human Rights Commission'),
    examples: b('收入来源（含公共援助）、家庭状况', 'source of income (including public assistance), family status'),
    url: 'https://kings-printer.alberta.ca/documents/Acts/A25P5.pdf',
    cite: 'Alberta Human Rights Act, RSA 2000, c. A-25.5, ss. 5, 44(1)',
  },
  privacyLaw: {
    zh: '阿尔伯塔省《个人信息保护法》（PIPA）', en: 'Alberta’s Personal Information Protection Act (PIPA)',
    cite: 'Personal Information Protection Act, SA 2003, c. P-6.5, ss. 3–4', url: 'https://kings-printer.alberta.ca/documents/Acts/P06P5.pdf',
    access: b('你的个人信息受阿尔伯塔省《个人信息保护法》（PIPA）保护。', 'Your personal information is protected under Alberta’s Personal Information Protection Act (PIPA).'),
  },
  leaseEnd: {
    zh: '固定期限租约在到期日自动结束，双方都无需通知；租客经房东明示或默示同意（如收取租金）继续居住且未签新约的，视为按期租约；租客结束按月租约须在某租赁月第一天或之前书面通知，于该月最后一天生效（《住宅租赁法》第 8、13、15 条）。',
    en: 'A fixed-term tenancy ends automatically on its end date and neither side needs to give notice; if the tenant stays on with the landlord’s express or implied consent (for example by accepting rent) and no new agreement is signed, a periodic tenancy is implied; to end a monthly tenancy the tenant serves written notice on or before the first day of a tenancy month, effective on the last day of that month (Residential Tenancies Act, ss. 8, 13, 15).',
    cite: 'Residential Tenancies Act, SA 2004, c. R-17.1, ss. 8(1)(a), 9, 10, 13, 15', url: AB_RTA_URL,
  },
  adverseDecision: null,
  listingNote: b(
    '押金与所有可退的宠物、钥匙等押金合计不得超过一个月租金（《住宅租赁法》第 43 条）。房东可以拒绝养宠物，但不能拒绝持有经训练的服务犬或导盲犬的残障人士（《服务犬法》《盲人权利法》）。没有政府规定的租约格式，书面租约须在租客签回后 21 天内交给租客一份房东签字的副本；纠纷可交住宅租赁纠纷解决服务处（RTDRS）或法院（第 17、54.1 条）。',
    'The security deposit plus every refundable pet, key or other deposit may not exceed one month’s rent (Residential Tenancies Act, s. 43). A landlord may refuse pets but may not deny tenancy to a disabled person with a trained service or guide dog (Service Dogs Act; Blind Persons’ Rights Act). There is no prescribed lease form; for a written lease the landlord serves a signed copy within 21 days after the tenant returns it, and disputes can go to the Residential Tenancy Dispute Resolution Service (RTDRS) or the court (ss. 17, 54.1).',
  ),
  notPermitted: [],
  depositFootnote: b(
    '押金须在 2 个银行工作日内存入计息信托账户（2026 年利率 0.0%）；租客交还房屋后 10 天内须退还押金，或附上扣款明细退还余额（《住宅租赁法》第 44–46 条）。',
    'The deposit goes into an interest-bearing trust account within 2 banking days (0.0% in 2026); within 10 days after the tenant gives up possession the landlord returns it, or returns the balance with a statement of deductions (Residential Tenancies Act, ss. 44–46).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// Manitoba
// ───────────────────────────────────────────────────────────────────────────

const MB_RTA_URL = 'https://web2.gov.mb.ca/laws/statutes/ccsm/r119.php'

const MB: ProvinceRules = {
  code: 'MB',
  statute: { zh: '《住宅租赁法》', en: 'The Residential Tenancies Act', cite: 'The Residential Tenancies Act, C.C.S.M. c. R119', url: MB_RTA_URL },
  tribunal: {
    zh: '住宅租赁处（RTB），上诉至住宅租赁委员会', en: 'Residential Tenancies Branch (RTB), with appeals to the Residential Tenancies Commission',
    cite: 'The Residential Tenancies Act, C.C.S.M. c. R119, ss. 141(1), 145(1), 152(1)', url: 'https://www.gov.mb.ca/cca/rtb/',
  },
  leaseForm: {
    mandatory: true,
    name: b('标准住宅租赁协议（Form 1）', 'Standard Residential Tenancy Agreement (Form 1)'),
    url: 'https://web2.gov.mb.ca/laws/regs/current/forms/071_2010/form_1e.pdf',
    copyDays: 21,
    cite: 'The Residential Tenancies Act, C.C.S.M. c. R119, ss. 7(1)–(4), 8; Residential Tenancies Regulation, M.R. 71/2010, s. 2(1) and Schedule, Form 1',
    lines: [
      b('租约可以口头、书面或默示订立；房东要求担保人或租约包含租客服务时，必须书面订立（《住宅租赁法》第 7(1) 条）。',
        'A tenancy agreement may be oral, written or implied; it must be in writing if the landlord requires a guarantor or it includes tenant services (The Residential Tenancies Act, s. 7(1)).'),
      b('书面租约（终身租约除外）必须使用法定格式 Form 1，由双方签名；不合格式的租约视为包含该格式条款，不一致的条款无效（第 7(2)–(4) 条）。',
        'Every written agreement (other than a life lease) must be in the prescribed Form 1 and signed by both parties; an agreement not in that form is deemed to include its provisions, and any inconsistent term is void (s. 7(2)–(4)).'),
      b('租客签字交回书面租约后 21 天内，房东须交给租客一份双方签名的副本（第 8 条）。',
        'Within 21 days after the tenant signs and returns a written agreement, the landlord must give the tenant a copy signed by both parties (s. 8).'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 0.5,
    zh: '押金最多为首月租金的一半；房东须在订立租约前告知，订立租约后才能要求支付，并须出具书面收据（《住宅租赁法》第 29、30 条）。',
    en: 'The security deposit is at most half of the first month’s rent; the landlord must say so before the agreement is entered into, may require payment only once it is, and must give a written receipt (The Residential Tenancies Act, ss. 29, 30).',
    covers: b('用于欠租或其他赔偿，包括修复损坏和特别清洁。', 'May be claimed for outstanding rent or other compensation, including repair of damage and extraordinary cleaning.'),
    interest: b('每年 0.5%（2026 年）。', '0.5% a year (2026).'),
    returnDays: 14,
    cite: 'The Residential Tenancies Act, C.C.S.M. c. R119, ss. 29, 30, 31, 31.1, 32; Residential Tenancies Interest Regulation, M.R. 73/2010, s. 2', url: MB_RTA_URL,
  },
  petDeposit: {
    allowed: true, maxMonths: 1, combinedWithDeposit: false,
    zh: '只有房东同意养宠物时才可收取宠物损坏押金，最多一个月租金，与押金分开另计；每份租约只能收一份，不得为服务动物收取（《住宅租赁法》第 29.1 条）。',
    en: 'Only when the landlord gives permission to keep a pet: a pet damage deposit of up to one month’s rent, separate from the security deposit; only one per tenancy, and none for a service animal (The Residential Tenancies Act, s. 29.1).',
    cite: 'The Residential Tenancies Act, C.C.S.M. c. R119, ss. 29.1(1)–(5), 31.2', url: MB_RTA_URL,
  },
  keyOrOtherDeposits: {
    allowed: false, key: 'prohibited',
    zh: '法律只允许押金、宠物损坏押金和（含租客服务的租约）租客服务押金三种押金，不得收取法律不允许的其他款项；交钥匙或车库遥控器之前不能收取费用或押金，补配遗失的钥匙可以收费（《住宅租赁法》第 14(1)、29.3–29.4 条；住宅租赁处政策指南 2.6）。',
    en: 'The Act allows only three deposits — the security deposit, the pet damage deposit and, for tenancies with tenant services, a tenant services deposit — and no other payment the Act does not permit; no fee or deposit may be collected before handing over keys or garage door openers, though replacing a lost key may be charged (The Residential Tenancies Act, ss. 14(1), 29.3–29.4; Branch Policies and Procedures Guidebook 2.6).',
    cite: 'The Residential Tenancies Act, C.C.S.M. c. R119, ss. 1 (“deposit”), 14(1), 29.3–29.4; Residential Tenancies Regulation, M.R. 71/2010, ss. 18–21; RTB Policies and Procedures Guidebook, Sub-Section 2.6',
    url: 'https://www.gov.mb.ca/cca/rtb/ot/gbook/s2tenagree_paymentsnotallowed6.html',
  },
  advanceRent: {
    maxMonths: null, lastMonth: null,
    zh: '租约不能让租金在约定付款日之前到期，这类加速条款无效；房东不能要求预开支票，但租客可以自愿提供；法律没有明确限制租客自愿预付的租金（《住宅租赁法》第 14(1)、15、16 条）。',
    en: 'A lease cannot make rent payable before its payment date (such a clause is void); a landlord cannot require post-dated cheques, though a tenant may give them voluntarily; the Act sets no explicit cap on rent a tenant chooses to prepay (The Residential Tenancies Act, ss. 14(1), 15, 16).',
    cite: 'The Residential Tenancies Act, C.C.S.M. c. R119, ss. 14(1), 15, 16', url: MB_RTA_URL,
  },
  applicationFee: {
    allowed: false,
    zh: '房东不得为接受、处理申请或调查申请人是否合适（含信用和筛查查询）向准租客收取任何费用（《住宅租赁法》第 14(2) 条，2023 年 5 月 30 日起）。',
    en: 'A landlord may not require or receive any payment from a prospective tenant for taking, processing or accepting an application, or for investigating the applicant’s suitability (credit and screening checks included) (The Residential Tenancies Act, s. 14(2), since 30 May 2023).',
    cite: 'The Residential Tenancies Act, C.C.S.M. c. R119, s. 14(2) (as enacted by S.M. 2023, c. 43, s. 2)', url: MB_RTA_URL,
  },
  petFee: null,
  petBanAllowed: {
    value: true,
    zh: '房东可以拒绝养宠物或实行禁养楼宇，宠物规则须书面且合理；但不能拒绝服务动物，也不能为其收取宠物押金（《住宅租赁法》第 11(2)–(3)、29.1、29.2 条；住宅租赁处指南）。',
    en: 'A landlord may refuse pets or run a no-pet building, with pet rules in writing and reasonable; a service animal cannot be refused and no pet deposit may be charged for it (The Residential Tenancies Act, ss. 11(2)–(3), 29.1, 29.2; Branch guidance).',
    cite: 'The Residential Tenancies Act, C.C.S.M. c. R119, ss. 11(2)–(3), 29.1(1), 29.1(3), 29.2; RTB fact sheet “Before You Rent – a Landlord’s Guide”',
    url: 'https://www.gov.mb.ca/cca/rtb/resource_list/beforeyourentll.pdf',
  },
  rentIncrease: {
    pct2026: 1.8,
    zh: '每 12 个月最多涨一次，须用法定表格（Form 1A）提前至少 3 个月书面通知；2026 年指导比例为 1.8%，超出须住宅租赁处批准；2026 年生效的涨租中，月租 $1,670 或以上的单位等不受指导比例限制（《住宅租赁法》第 25、116、118、123 条）。',
    en: 'Rent may rise at most once in 12 months, with at least 3 months’ written notice in the prescribed Form 1A; the 2026 guideline is 1.8%, and more needs the Branch’s approval; for increases effective in 2026, units renting for $1,670 or more a month (among others) are exempt from the guideline (The Residential Tenancies Act, ss. 25, 116, 118, 123).',
    cite: 'The Residential Tenancies Act, C.C.S.M. c. R119, ss. 25–28, 116, 118, 120, 123; Residential Rent Regulation, M.R. 156/92, ss. 3, 4.1; M.R. 91/2026',
    url: 'https://news.gov.mb.ca/news/index.html?item=70517',
  },
  humanRights: {
    law: b('曼尼托巴省《人权法典》', 'Manitoba’s Human Rights Code'),
    body: b('曼尼托巴人权委员会', 'the Manitoba Human Rights Commission'),
    examples: b('收入来源、婚姻或家庭状况、社会弱势、依赖服务动物', 'source of income, marital or family status, social disadvantage, reliance on a service animal'),
    url: 'https://web2.gov.mb.ca/laws/statutes/ccsm/h175.php?lang=en',
    cite: 'The Human Rights Code, C.C.S.M. c. H175, ss. 9(2)(i), 9(2)(j), 9(2)(m), 16(1)–(2)',
  },
  privacyLaw: pipeda(PIPEDA_URL),
  leaseEnd: {
    zh: '书面固定期限租约：房东须在到期前至少 3 个月提出同期限、同条件的续约（可依法涨租），租客须在到期前至少 2 个月签字交回，否则租约在到期日结束；房东没有提出续约而租客继续居住的，视为续约（原期限与 12 个月取较短者）。按月租约每期自动续期，租客须在某付款期最后一天或之前通知，最早于下一期最后一天生效（《住宅租赁法》第 21、86、87 条）。',
    en: 'Fixed-term written lease: at least 3 months before the end date the landlord must offer a renewal for the same term on the same terms (subject to a lawful increase); the tenant renews by signing and returning it at least 2 months before the end, otherwise the tenancy ends on the end date; if the landlord makes no offer and the tenant stays, the lease is deemed renewed for the same term or 12 months, whichever is less. A periodic tenancy renews each period; the tenant gives notice on or before the last day of a rental period, effective no earlier than the last day of the next one (The Residential Tenancies Act, ss. 21, 86, 87).',
    cite: 'The Residential Tenancies Act, C.C.S.M. c. R119, ss. 21, 22, 23, 86, 87', url: MB_RTA_URL,
  },
  adverseDecision: {
    zh: '依据《个人调查法》第 7 条，你可在收到本通知后 30 天内要求房东披露：所用征信机构的名称和地址、从其他来源取得的事实信息的来源与细节、任何调查信息的性质，以及如何对报告提出异议。',
    en: 'Under section 7 of The Personal Investigations Act you may, within 30 days after this notice, require the landlord to disclose the name and address of any reporting agency used, the source and detail of factual information obtained elsewhere, the nature of any investigative information, and how to protest information in the report.',
    cite: 'The Personal Investigations Act, C.C.S.M. c. P34, ss. 1, 3, 6, 7', url: 'https://web2.gov.mb.ca/laws/statutes/ccsm/p034.php?lang=en',
  },
  listingNote: b(
    '押金最多为首月租金的一半；获准养宠物时可另收最多一个月租金的宠物损坏押金；不得收取申请费或筛查费（《住宅租赁法》第 14(2)、29、29.1 条）。房东可以拒绝养宠物，但不能拒绝服务动物，也不能为其收取宠物押金（第 29.1(3) 条）。书面租约须使用标准住宅租赁协议（Form 1），签署后 21 天内交给租客一份；纠纷由住宅租赁处（RTB）处理（第 7、8、152 条）。',
    'The security deposit is at most half of the first month’s rent; with permission for a pet, a pet damage deposit of up to one month’s rent may also be taken; application and screening fees are prohibited (The Residential Tenancies Act, ss. 14(2), 29, 29.1). A landlord may refuse pets but not a service animal, and may not charge a pet deposit for one (s. 29.1(3)). A written lease must use the Standard Residential Tenancy Agreement (Form 1), with a copy to the tenant within 21 days; disputes go to the Residential Tenancies Branch (RTB) (ss. 7, 8, 152).',
  ),
  notPermitted: [
    b('申请费、筛查费或信用查询费', 'application, screening or credit-check fees'),
    b('交钥匙或车库遥控器前收取的费用或押金', 'fees or deposits before handing over keys or garage door openers'),
    b('要求预开支票', 'requiring post-dated cheques'),
  ],
  depositFootnote: b(
    '押金每年付息 0.5%（2026 年）；房东没有索赔时，须在租约结束后 14 天内退还押金和利息；要索赔须在 28 天内书面通知并退还其余部分（《住宅租赁法》第 32 条）。',
    'Deposits earn 0.5% a year (2026). With no claim, the landlord returns the deposit with interest within 14 days after the tenancy ends; to make a claim the landlord sends written notice within 28 days and returns any unclaimed balance (The Residential Tenancies Act, s. 32).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// Saskatchewan
// ───────────────────────────────────────────────────────────────────────────

const SK_RTA_URL = 'https://publications.saskatchewan.ca/api/v1/products/23011/formats/29464/download'

const SK: ProvinceRules = {
  code: 'SK',
  statute: {
    zh: '《2006 年住宅租赁法》及《2007 年住宅租赁条例》', en: 'The Residential Tenancies Act, 2006 and The Residential Tenancies Regulations, 2007',
    cite: 'The Residential Tenancies Act, 2006, SS 2006, c R-22.0001; The Residential Tenancies Regulations, 2007, RRS c R-22.0001 Reg 1, s 4 and Schedule 1', url: SK_RTA_URL,
  },
  tribunal: {
    zh: '住宅租赁办公室（ORT）', en: 'Office of Residential Tenancies (ORT)',
    cite: 'The Residential Tenancies Act, 2006, ss 14, 70, 71, 71.1, 72, 73; The Residential Tenancies Regulations, 2007, ss 11, 13',
    url: 'https://www.saskatchewan.ca/government/government-structure/boards-commissions-and-agencies/office-of-residential-tenancies',
  },
  leaseForm: {
    mandatory: false,
    name: b('附表一「租赁协议标准条件」', 'Schedule 1, “Standard Conditions of a Tenancy Agreement”'),
    url: SK_RTA_URL,
    copyDays: 20,
    cite: 'The Residential Tenancies Act, 2006, ss 18, 19(1)–(5), 20; The Residential Tenancies Regulations, 2007, s 4 and Schedule 1',
    lines: [
      b('没有强制的政府租约表格；租约可以口头或书面订立，但三个月或以上的固定期限租约必须书面订立（《2006 年住宅租赁法》第 18、19 条）。',
        'No government lease form is mandatory; agreements may be oral or written, but a fixed term of three months or longer must be in writing (The Residential Tenancies Act, 2006, ss 18, 19).'),
      b('书面租约必须包含附表一的标准条件和法定事项（双方法定姓名、单元地址、送达地址和电话、紧急电话、租金和到期日、水电、包含的服务、押金金额）（第 19(1) 条）。',
        'Every written agreement must contain the Schedule 1 Standard Conditions and the items in s 19(1): legal names, unit address, service address and phone, emergency number, rent and due date, utilities, included services and deposit amount (s 19(1)).'),
      b('房东须在 20 天内把签字的租约副本交给租客；交付前租客的付租义务暂停（第 19(5) 条）。',
        'The landlord must give the tenant a copy of the signed agreement within 20 days; until then the tenant’s obligation to pay rent is suspended (s 19(5)).'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 1,
    zh: '押金只能在订立租约时收一份，最多一个月租金；签约时租客最多先付一半，其余在入住后两个月内付清；房东须以信托方式保管，未经房东书面同意不能抵租金（《2006 年住宅租赁法》第 24–30 条）。',
    en: 'One security deposit, only when the agreement is entered into, of at most one month’s rent; the tenant pays at most 50% at signing and the rest within two months after taking possession; the landlord holds it in trust, and it may not be used as rent without the landlord’s written consent (The Residential Tenancies Act, 2006, ss 24–30).',
    covers: b('担保租客对物业的任何责任或义务，如损坏或欠租。', 'Secures any liability or obligation of the tenant respecting the property, such as damage or unpaid rent.'),
    interest: b('只有租约持续五年或以上才付息。', 'Interest is payable only if the tenancy lasts five years or more.'),
    returnDays: 7,
    cite: 'The Residential Tenancies Act, 2006, ss 2(n), 24–30, 32, 33; The Residential Tenancies Regulations, 2007, s 5', url: SK_RTA_URL,
  },
  petDeposit: {
    allowed: false, maxMonths: 0, combinedWithDeposit: false,
    zh: '不能在押金之外另收宠物押金；与宠物有关的押金只能是那一份押金的一部分，合计不超过一个月租金（《2006 年住宅租赁法》第 2(n)、25(1)、26(1)(b) 条）。',
    en: 'No separate pet deposit on top of the security deposit; any pet-related deposit must be part of the single deposit, and the total may not exceed one month’s rent (The Residential Tenancies Act, 2006, ss 2(n), 25(1), 26(1)(b)).',
    cite: 'The Residential Tenancies Act, 2006, ss 2(n), 25(1), 26(1)(b)', url: SK_RTA_URL,
  },
  keyOrOtherDeposits: {
    allowed: false, key: 'counts_toward_deposit',
    zh: '不能另收任何押金；钥匙或门禁卡押金属于押金的定义，只能计入那一份上限为一个月租金的押金；唯一的法定租客费用是同意转让或转租的费用，最多 $20（《2006 年住宅租赁法》第 2(n)、26(1)(b) 条；《2007 年住宅租赁条例》第 8 条）。',
    en: 'No additional deposit may be taken; a key or fob deposit is within the definition of security deposit and counts toward the single deposit capped at one month’s rent; the only prescribed tenant fee is up to $20 for considering or consenting to an assignment or sublease (The Residential Tenancies Act, 2006, ss 2(n), 26(1)(b); The Residential Tenancies Regulations, 2007, s 8).',
    cite: 'The Residential Tenancies Act, 2006, ss 2(n), 23, 25(1), 26(1)(b), 43(2), 50(5); The Residential Tenancies Regulations, 2007, s 8', url: SK_RTA_URL,
  },
  advanceRent: {
    maxMonths: 0, lastMonth: 'prohibited',
    zh: '房东不能要求、收取未来才到期的租金，所以不能预收最后一个月租金；法律没有明确禁止要求预开支票，预开支票也不算押金（《2006 年住宅租赁法》第 40、2(n)(i) 条）。',
    en: 'A landlord may not demand, receive or collect money for rent that becomes due in the future, so prepaid last month’s rent is not allowed; the Act does not expressly prohibit asking for post-dated cheques, which are not counted as a deposit (The Residential Tenancies Act, 2006, ss 40, 2(n)(i)).',
    cite: 'The Residential Tenancies Act, 2006, ss 40, 2(n)(i)', url: SK_RTA_URL,
  },
  applicationFee: {
    allowed: false,
    zh: '房东不得为接受、处理申请、调查申请人是否合适（含筛查和信用查询）或接受其为租客收取任何费用（《2006 年住宅租赁法》第 23 条）。',
    en: 'A landlord may not charge for accepting or processing an application, investigating the applicant’s suitability (screening and credit checks included) or accepting a person as a tenant (The Residential Tenancies Act, 2006, s 23).',
    cite: 'The Residential Tenancies Act, 2006, s 23', url: SK_RTA_URL,
  },
  petFee: null,
  petBanAllowed: {
    value: true,
    zh: '房东可以拒绝养宠物或把楼宇定为禁养；但服务动物不是宠物，即使在禁养楼宇也必须允许；部分住房裁决也承认情感支持动物受保护（萨斯喀彻温人权委员会指引；《2018 年萨斯喀彻温人权法典》第 11 条）。',
    en: 'A landlord may refuse pets or designate a building pet-free, but a service animal is not a pet and must be permitted even there; some housing decisions have also protected emotional support animals (Saskatchewan Human Rights Commission guidance; The Saskatchewan Human Rights Code, 2018, s 11).',
    cite: 'Saskatchewan Human Rights Commission, “Landlords, Tenants and Housing” (April 2026); The Saskatchewan Human Rights Code, 2018, ss 2, 11; The Residential Tenancies Act, 2006, s 22.1',
    url: 'https://saskhrc.ca/wp-content/uploads/2026/04/Landlords-Tenants-and-Housing-_-2026.pdf',
  },
  rentIncrease: {
    pct2026: null,
    zh: '萨斯喀彻温 2026 年没有涨租上限或指导比例。按期租约须提前至少 12 个月书面通知，涨租最早在租约开始 18 个月后、上次涨租 12 个月后生效（指定房东协会成员为提前 6 个月，最早在租约开始 12 个月后、上次涨租 6 个月后）；固定期限内只能按签约时约定的金额和时间涨租（《2006 年住宅租赁法》第 52–54 条）。',
    en: 'Saskatchewan has no rent cap or guideline for 2026. In a periodic tenancy the landlord gives at least 12 months’ written notice, and an increase takes effect no earlier than 18 months after the tenancy began or 12 months after the last increase (6 months’ notice, 12 and 6 months, for members of a prescribed landlord association); in a fixed term rent may rise only as agreed when the lease was signed (The Residential Tenancies Act, 2006, ss 52–54).',
    cite: 'The Residential Tenancies Act, 2006, ss 52, 53, 53.1, 54; The Residential Tenancies Regulations, 2007, ss 8.1, 8.2, 9', url: SK_RTA_URL,
  },
  humanRights: {
    law: b('《2018 年萨斯喀彻温人权法典》', 'The Saskatchewan Human Rights Code, 2018'),
    body: b('萨斯喀彻温人权委员会', 'the Saskatchewan Human Rights Commission'),
    examples: b('领取公共援助、家庭状况（不能写「不收儿童」或「只租成人」）', 'receipt of public assistance, family status (“no children” or “adults only” rules are prohibited)'),
    url: 'https://saskhrc.ca/wp-content/uploads/2020/03/Code2018.pdf',
    cite: 'The Saskatchewan Human Rights Code, 2018, SS 2018, c S-24.2, ss 2, 11, 34',
  },
  privacyLaw: pipeda(PIPEDA_BRIEF_URL),
  leaseEnd: {
    zh: '固定期限租约在到期日结束，不会自动续约或转为按月租约；房东须在到期前至少两个月送达「两个月意向通知」，说明是否提供新租约及条件；租客须在一个月内书面接受，不回复视为拒绝，须在期满时搬出；租客结束按月租约须书面通知，最早在房东收到通知一个月后生效（《2006 年住宅租赁法》第 55(2)、56(1)、63 条；《2007 年住宅租赁条例》第 8.2 条）。',
    en: 'A fixed-term tenancy ends on its end date and does not renew automatically or turn month-to-month; at least two months before the end the landlord serves the “Two Month Notice of Intention” saying whether a new agreement is offered and on what terms; the tenant has one month to accept in writing, and silence is a rejection, so the tenant must vacate at the end of the term; a tenant ends a monthly tenancy with written notice effective no earlier than one month after the landlord receives it (The Residential Tenancies Act, 2006, ss 55(2), 56(1), 63; The Residential Tenancies Regulations, 2007, s 8.2).',
    cite: 'The Residential Tenancies Act, 2006, ss 55(2), 56(1), 63, 64.2; The Residential Tenancies Regulations, 2007, ss 8.2, 8.3; Schedule 1, standard condition 13',
    url: 'https://publications.saskatchewan.ca/api/v1/products/23014/formats/29469/download',
  },
  adverseDecision: {
    zh: '如本决定全部或部分基于信用报告，你可在 60 天内书面要求房东提供信用报告机构的名称和地址（《信用报告法》第 19、20 条）。',
    en: 'If this decision relied wholly or partly on a credit report, you may ask the landlord in writing, within 60 days, for the name and address of the credit reporting agency (The Credit Reporting Act, ss. 19, 20).',
    cite: 'The Credit Reporting Act, SS 2004, c C-43.2, ss 19, 20 (s 17(1)(a)(ii))',
    url: 'https://publications.saskatchewan.ca/api/v1/products/9613/formats/14580/download',
  },
  listingNote: b(
    '押金只能收一份，最多一个月租金，签约时最多先付一半，其余在入住后两个月内付清；不能另收宠物或钥匙押金，不能预收未到期的租金，也不能收取申请费（《2006 年住宅租赁法》第 23、25、26、40 条）。房东可以把楼宇定为禁养宠物，但服务动物不是宠物，必须允许（《2018 年萨斯喀彻温人权法典》）。没有强制的租约表格，书面租约须包含附表一标准条件，20 天内交给租客一份；纠纷由住宅租赁办公室（ORT）处理（第 19、70 条）。',
    'One security deposit of at most one month’s rent, with at most half paid at signing and the rest within two months after move-in; no separate pet or key deposit, no rent collected before it is due, and no application fee (The Residential Tenancies Act, 2006, ss 23, 25, 26, 40). A landlord may designate a building pet-free, but a service animal is not a pet and must be permitted (The Saskatchewan Human Rights Code, 2018). There is no mandatory lease form; a written lease must include the Schedule 1 Standard Conditions, with a copy to the tenant within 20 days; disputes go to the Office of Residential Tenancies (ORT) (ss 19, 70).',
  ),
  notPermitted: [
    b('申请费、筛查费或信用查询费', 'application, screening or credit-check fees'),
    b('另收的宠物押金', 'a separate pet deposit'),
    b('另收的钥匙押金', 'a separate key deposit'),
    b('预收未到期的租金（含最后一个月）', 'rent collected before it is due (last month included)'),
  ],
  depositFootnote: b(
    '押金须以信托方式保管；只有租约持续五年或以上才付息；房东知悉租客搬离后 7 个工作日内，须退还押金和利息，或退还无争议部分并送达索赔通知（《2006 年住宅租赁法》第 30、32、33 条）。',
    'The deposit is held in trust and earns interest only if the tenancy lasts five years or more; within 7 business days after the landlord knows the tenant has vacated, the landlord returns it with interest, or returns the undisputed part and serves a notice of claim (The Residential Tenancies Act, 2006, ss 30, 32, 33).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// Nova Scotia
// ───────────────────────────────────────────────────────────────────────────

const NS_RTA_URL = 'https://nslegislature.ca/sites/default/files/legc/statutes/residential%20tenancies.pdf'

const NS: ProvinceRules = {
  code: 'NS',
  statute: {
    zh: '《住宅租赁法》及《临时住宅租金涨幅上限法》', en: 'Residential Tenancies Act and Interim Residential Rental Increase Cap Act',
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401; Interim Residential Rental Increase Cap Act, S.N.S. 2021, c. 22', url: NS_RTA_URL,
  },
  tribunal: {
    zh: '住宅租赁主任（新斯科舍服务局住宅租赁项目），可在 10 天内上诉至小额索偿法院', en: 'Director of Residential Tenancies (Residential Tenancies Program, Service Nova Scotia), with appeals to the Small Claims Court within 10 days',
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401, ss. 13(1), 17C', url: NS_RTA_URL,
  },
  leaseForm: {
    mandatory: true,
    name: b('标准租约（Form P）', 'Standard Form of Lease (Form P)'),
    url: 'https://novascotia.ca/just/regulations/regs/rtsflease.htm',
    copyDays: 10,
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401, ss. 7(1)–(2), 8(2A)–(5); Standard Form of Lease Regulations, N.S. Reg. 19/2025, s. 3',
    lines: [
      b('所有房东和租客都必须使用标准租约（Form P）；没有签署标准租约的书面或口头租赁，视为按标准租约订立（《住宅租赁法》第 7 条；《标准租约条例》第 3 条）。',
        'Every landlord and tenant must use the Director’s Standard Form of Lease (Form P); a tenancy where no standard form was signed is deemed to be on it (Residential Tenancies Act, s. 7; Standard Form of Lease Regulations, s. 3).'),
      b('双方签名的副本须在签约时由租客保留，或在 10 天内交给租客（第 7(2) 条）。',
        'A copy signed by both parties is kept by the tenant at signing or given within 10 days (s. 7(2)).'),
      b('房东还须在 10 天内向租客提供一份《住宅租赁法》（纸质、电子或链接）（第 8 条）。',
        'The landlord must also give the tenant a copy of the Act — paper, electronic or a link — within 10 days (s. 8).'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 0.5,
    zh: '押金最多半个月租金，须存入信托账户（特许银行、信托公司或信用社）；租金以外收取的任何款项都视为押金并计入这一上限（《住宅租赁法》第 12 条）。',
    en: 'The security deposit is capped at half a month’s rent and is held in a trust account (chartered bank, trust company or credit union); any money taken in addition to rent is deemed part of it and counts toward the cap (Residential Tenancies Act, s. 12).',
    covers: b('只能用于欠租或租客应负责的损坏，不包括正常损耗。', 'May be applied only to unpaid rent or damage the tenant is responsible for, not ordinary wear and tear.'),
    interest: b('法定利率自 2013 年 1 月 1 日起为每年 0%。', 'The regulated rate has been 0% a year since 1 January 2013.'),
    returnDays: 10,
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401, ss. 12(2)–(4), 12A; Residential Tenancies Regulations, N.S. Reg. 190/1989, s. 5', url: NS_RTA_URL,
  },
  petDeposit: {
    allowed: false, maxMonths: 0, combinedWithDeposit: false,
    zh: '不能另收宠物押金；租金以外收取的任何款项都视为那一份押金的一部分，上限为半个月租金（《住宅租赁法》第 12(1)–(2) 条）。',
    en: 'No separate pet deposit; any money taken in addition to rent is deemed part of the single security deposit capped at half a month’s rent (Residential Tenancies Act, s. 12(1)–(2)).',
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401, s. 12(1)–(2); Service Nova Scotia, Residential Tenancies Renting Guide (April 2025)',
    url: 'https://www.novascotia.ca/sites/default/files/documents/1-1764/residential-tenancies-guides-renting-en.pdf',
  },
  keyOrOtherDeposits: {
    allowed: false, key: 'counts_toward_deposit',
    zh: '不能另收钥匙、门禁卡或订金等押金，这些款项都视为押金并计入半个月上限；标准租约可约定由租客承担有上限的实际费用，如开锁或钥匙费、退票费、转租或转让费用（最多 $75）（《住宅租赁法》第 9B(2)、12 条）。',
    en: 'No separate key, fob or holding deposits — such money is deemed a security deposit within the half-month cap; the standard lease may make the tenant responsible for capped costs actually incurred, such as lock-out or key charges, returned-cheque charges and assignment or sublet expenses (up to $75) (Residential Tenancies Act, ss. 9B(2), 12).',
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401, ss. 12(1)–(2), 9B(2); Standard Form of Lease Regulations, N.S. Reg. 19/2025, Form clause 16', url: NS_RTA_URL,
  },
  advanceRent: {
    maxMonths: 0, lastMonth: 'counts_toward_deposit',
    zh: '法律没有直接规定预付租金；政府指引把签约前或租金到期前收取的任何款项视为押金，所以预付的最后一个月租金也计入半个月上限；标准租约把预开支票列为可选付款方式（《住宅租赁法》第 12 条；新斯科舍服务局租房指南）。',
    en: 'The Act does not expressly regulate prepaid rent; official guidance treats money taken before the lease is signed or before rent is due as a security deposit, so a prepaid last month counts toward the half-month cap; the standard lease lists post-dated cheques as one payment option (Residential Tenancies Act, s. 12; Service Nova Scotia Renting Guide).',
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401, s. 12(1)–(2); Service Nova Scotia Renting Guide; Standard Form of Lease Regulations, N.S. Reg. 19/2025, Form clause 13',
    url: 'https://www.novascotia.ca/sites/default/files/documents/1-1764/residential-tenancies-guides-renting-en.pdf',
  },
  applicationFee: {
    allowed: false,
    zh: '任何人都不得为租房申请向准租客索取或收取金钱或其他价值（《住宅租赁法》第 6 条）。',
    en: 'No person may demand, accept or receive money or other value from a prospective tenant for an application to become a tenant (Residential Tenancies Act, s. 6).',
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401, s. 6', url: NS_RTA_URL,
  },
  petFee: null,
  petBanAllowed: {
    value: true,
    zh: '房东可以制定合理的楼宇规则，包括是否允许养宠物；规则须合理、对所有租客公平，并在签约前交给租客；为服务动物提供便利的人权义务仍然适用（《住宅租赁法》第 9A 条）。',
    en: 'A landlord may set reasonable rules for the premises, including whether pets are allowed; rules must be reasonable, apply fairly to all tenants and be given before the lease is signed, and the human-rights duty to accommodate service animals still applies (Residential Tenancies Act, s. 9A).',
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401, s. 9A; Service Nova Scotia Renting Guide (April 2025)',
    url: 'https://www.novascotia.ca/sites/default/files/documents/1-1764/residential-tenancies-guides-renting-en.pdf',
  },
  rentIncrease: {
    pct2026: 5,
    zh: '租约前 12 个月内不能涨租，之后每 12 个月最多一次；按年或按月租约须提前 4 个月书面通知；2026 年对现有租客的涨幅上限为 5%（现有租客就同一单元签新的固定期限租约也适用），上限不限制新租客的租金（《住宅租赁法》第 11 条；《临时住宅租金涨幅上限法》）。',
    en: 'No increase in the first 12 months of a tenancy or more than once in 12 months; year-to-year and month-to-month leases need 4 months’ written notice; for 2026 increases for an existing tenant are capped at 5% (also when the existing tenant signs a new fixed-term lease for the same unit), and the cap does not limit rent for a new tenant (Residential Tenancies Act, s. 11; Interim Residential Rental Increase Cap Act).',
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401, s. 11; Interim Residential Rental Increase Cap Act, S.N.S. 2021, c. 22, ss. 3–4, 7 (as amended 2024, c. 12)',
    url: 'https://nslegislature.ca/sites/default/files/legc/statutes/interim%20residential%20rental%20increase%20cap.pdf',
  },
  humanRights: {
    law: b('新斯科舍省《人权法》', 'Nova Scotia’s Human Rights Act'),
    body: b('新斯科舍人权委员会', 'the Nova Scotia Human Rights Commission'),
    examples: b('收入来源（含领取公共援助）、家庭状况（有子女）', 'source of income (including receipt of public assistance), family status (having children)'),
    url: 'https://nslegislature.ca/sites/default/files/legc/statutes/human%20rights.pdf',
    cite: 'Human Rights Act, R.S.N.S. 1989, c. 214, ss. 5(1)(b), (r), (t), 6(b)',
  },
  privacyLaw: pipeda(PIPEDA_URL),
  leaseEnd: {
    zh: '固定期限租约在约定的结束日终止，不会续期；租客经业主同意继续居住的，视为按月续约。按期租约若无人发出终止通知，自动按相同期限续期；租客通知期：按年租约须在租约年度结束前至少 3 个月，按月租约须在月末前 1 个月（《住宅租赁法》第 10、10A 条）。',
    en: 'A fixed-term lease ends on its end date and does not renew; a tenant who stays with the owner’s consent is deemed renewed month to month. Periodic leases renew automatically for the same term unless notice is given; tenant notice is at least 3 months before the end of a lease year (year-to-year) and 1 month before the end of a month (month-to-month) (Residential Tenancies Act, ss. 10, 10A).',
    cite: 'Residential Tenancies Act, R.S.N.S. 1989, c. 401, ss. 10(1), 10(3A), 10A(1)–(3)', url: NS_RTA_URL,
  },
  adverseDecision: {
    zh: '如本决定全部或部分基于消费者报告，你有权要求披露征信机构对你的档案；房东须书面告知该机构的名称和地址，以及从征信机构以外来源取得的信息的来源与性质（《消费者报告法》第 11 条）。',
    en: 'If this decision relied wholly or partly on a consumer report, you have the right to disclosure of the reporting agency’s file; the landlord must tell you in writing the agency’s name and address and the source and nature of any information obtained from other sources (Consumer Reporting Act, s. 11).',
    cite: 'Consumer Reporting Act, R.S.N.S. 1989, c. 93, s. 11(1)–(3)',
    url: 'https://nslegislature.ca/sites/default/files/legc/statutes/consumer%20reporting.pdf',
  },
  listingNote: b(
    '押金最多半个月租金，租金以外收取的任何款项（宠物、钥匙押金等）都视为押金并计入这一上限；不得收取申请费（《住宅租赁法》第 6、12 条）。房东可以制定合理的楼宇规则，包括是否允许养宠物，但仍须按人权法为服务动物提供便利（第 9A 条）。必须使用政府标准租约（Form P），签约时或 10 天内交给租客一份；纠纷由住宅租赁主任处理（第 7、13 条）。',
    'The security deposit is capped at half a month’s rent, and any money taken beyond rent — pet or key deposits included — counts toward that cap; application fees are prohibited (Residential Tenancies Act, ss. 6, 12). A landlord may set reasonable building rules, including whether pets are allowed, but must still accommodate service animals under human-rights law (s. 9A). The government Standard Form of Lease (Form P) is mandatory, with a copy to the tenant at signing or within 10 days; disputes go to the Director of Residential Tenancies (ss. 7, 13).',
  ),
  notPermitted: [
    b('申请费', 'application fees'),
    b('另收的宠物押金', 'a separate pet deposit'),
    b('另收的钥匙押金或订金', 'a separate key or holding deposit'),
  ],
  depositFootnote: b(
    '押金须存入信托账户，利率自 2013 年起为 0%；租约结束后 10 天内须退还押金和利息；房东想在租客未书面同意时保留任何部分，须在同一 10 天内向住宅租赁主任提出索赔（《住宅租赁法》第 12、12A 条）。',
    'The deposit is held in trust and has earned 0% since 2013; it is returned with interest within 10 days after the lease ends, and a landlord who wants to keep any part without the tenant’s written consent must file a claim with the Director within the same 10 days (Residential Tenancies Act, ss. 12, 12A).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// New Brunswick
// ───────────────────────────────────────────────────────────────────────────

const NB_RTA_URL = 'https://laws.gnb.ca/en/document/cs/R-10.2'

const NB: ProvinceRules = {
  code: 'NB',
  statute: { zh: '《住宅租赁法》', en: 'The Residential Tenancies Act', cite: 'The Residential Tenancies Act, S.N.B. 1975, c. R-10.2; General Regulation 82-218', url: NB_RTA_URL },
  tribunal: {
    zh: '租客与房东关系办公室（新不伦瑞克服务局）', en: 'Tenant and Landlord Relations Office (Service New Brunswick)',
    cite: 'The Residential Tenancies Act, S.N.B. 1975, c. R-10.2, ss. 19–21, 27',
    url: 'https://www.gnb.ca/en/topic/family-home-community/housing-property/solve-problem.html',
  },
  leaseForm: {
    mandatory: true,
    name: b('标准租约（Form 6）', 'Residential Lease, standard form of lease (Form 6)'),
    url: 'https://www.pxw1.snb.ca/snb7001/e/1000/CSS-FOL-SNB-45-0065E.pdf',
    copyDays: null,
    cite: 'The Residential Tenancies Act, S.N.B. 1975, c. R-10.2, s. 9',
    lines: [
      b('每份租约都必须使用标准租约：房东须提供两份原件，双方签名后各持一份（《住宅租赁法》第 9 条）。',
        'Every tenancy must use the standard form of lease: the landlord provides two duplicate originals, and each party keeps a signed copy (The Residential Tenancies Act, s. 9).'),
      b('对标准租约的修改或删除无效，增加的条款须写在两份原件上；没有签署标准租约的，视为已签署（第 9 条）。',
        'Alterations or deletions are void and additions must appear on both originals; if no standard form is signed, the parties are deemed to have signed one (s. 9).'),
      b('没有拿到标准租约的租客，可以把租金交给住宅租赁官，直到房东履行义务（第 9 条）。',
        'A tenant not given the form may pay rent to a residential tenancies officer until the landlord complies (s. 9).'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 1,
    zh: '押金须在租约中约定，最多一个月租金（按周租约为一周）；房东须在 15 天内交到租客与房东关系办公室保管（《住宅租赁法》第 8 条）。',
    en: 'A deposit must be provided for in the lease and is capped at one month’s rent (one week for weekly tenancies); the landlord remits it within 15 days to the Tenant and Landlord Relations Office (The Residential Tenancies Act, s. 8).',
    covers: b('可用于欠租、租约要求的未付水电报销、未付滞纳金，以及租客应负责的清洁或损坏。', 'May be applied to unpaid rent, unpaid utility reimbursements the lease requires, unpaid late fees, and cleaning or damage the tenant is responsible for.'),
    interest: b('租客不获付利息，利息归政府。', 'No interest is paid to the tenant; the interest goes to the Crown.'),
    returnDays: null,
    cite: 'The Residential Tenancies Act, S.N.B. 1975, c. R-10.2, ss. 8(1)–(3), 8(7.1), 8(12), 8(15), 8.1', url: NB_RTA_URL,
  },
  petDeposit: {
    allowed: false, maxMonths: 0, combinedWithDeposit: false,
    zh: '不能另收宠物押金；与宠物有关的担保只能计入那一份押金（最多一个月租金），并交到租客与房东关系办公室（《住宅租赁法》第 8(4)、8(4.1)(c)、8.01(3) 条）。',
    en: 'No separate pet deposit; any pet-related security must fit within the single deposit (at most one month’s rent) remitted to the Tenant and Landlord Relations Office (The Residential Tenancies Act, ss. 8(4), 8(4.1)(c), 8.01(3)).',
    cite: 'The Residential Tenancies Act, S.N.B. 1975, c. R-10.2, ss. 8(4), 8(4.1)(c), 8.01(3)', url: NB_RTA_URL,
  },
  keyOrOtherDeposits: {
    allowed: false, key: 'counts_toward_deposit',
    zh: '除租金、一份押金（有上限并上交政府）和与租赁有关服务的合理费用外，不得要求任何款项，此类约定无效；为担保租客义务而交付的款项视为押金（《住宅租赁法》第 8(4)、8.01(3) 条）。',
    en: 'No payment may be required other than rent, one security deposit (capped and remitted to the government) or a reasonable amount for a service related to the tenancy, and any such agreement is void; money given to secure the tenant’s obligations is deemed a security deposit (The Residential Tenancies Act, ss. 8(4), 8.01(3)).',
    cite: 'The Residential Tenancies Act, S.N.B. 1975, c. R-10.2, ss. 8(4), 8.01(3)', url: NB_RTA_URL,
  },
  advanceRent: {
    maxMonths: null, lastMonth: 'prohibited',
    zh: '房东可以要求首月租金和押金，但不能要求预付最后一个月租金，也不能要求某一笔租金高于其他常规付款；违规收取的款项须立即退还（《住宅租赁法》第 8(4.1)–(4.2) 条）。',
    en: 'A landlord may ask for the first month’s rent and a deposit, but not a prepayment of the last month’s rent or a single payment larger than the regular ones; money taken in breach must be returned immediately (The Residential Tenancies Act, s. 8(4.1)–(4.2)).',
    cite: 'The Residential Tenancies Act, S.N.B. 1975, c. R-10.2, s. 8(4.1)–(4.2)', url: NB_RTA_URL,
  },
  // No verified fact on application fees for New Brunswick — left out.
  applicationFee: null,
  petFee: null,
  petBanAllowed: {
    value: true,
    zh: '房东可以实行禁养宠物，标准租约设有宠物限制或禁止一栏；但须按《人权法》为残障租客需要的服务动物破例（标准租约 E 部分）。',
    en: 'A landlord may have a no-pets policy, and the standard lease has a section for pet restrictions or prohibitions; an exception must be made for a service animal a tenant with a disability needs, under the Human Rights Act (standard lease, Section E).',
    cite: 'The Residential Tenancies Act, s. 9(3); Standard Form of Lease (Form 6 12/2021), Section E',
    url: 'https://www.gnb.ca/en/topic/family-home-community/housing-property/renters.html',
  },
  rentIncrease: {
    pct2026: 3,
    zh: '除非另有书面约定，租约前 12 个月内不能涨租，之后每 12 个月最多一次；须提前 6 个月以单独、注明日期并签名的文件书面通知；自 2025 年 2 月 1 日起涨幅上限为 3%，超出的通知视为 3%（仅为收回翻修资本开支可申请最多 9%）（《住宅租赁法》第 11.1、11.12–11.14 条）。',
    en: 'Unless agreed in writing otherwise, no increase in the first 12 months or more than once in 12 months, with 6 months’ written notice in a separate, dated and signed document; since 1 February 2025 increases are capped at 3%, and a notice for more is deemed a 3% notice (up to 9% may be sought only to recover capital spent on renovations) (The Residential Tenancies Act, ss. 11.1, 11.12–11.14).',
    cite: 'The Residential Tenancies Act, S.N.B. 1975, c. R-10.2, ss. 11.1, 11.12–11.14; General Regulation 82-218, ss. 11.1, 11.12',
    url: 'https://www.gnb.ca/en/topic/family-home-community/housing-property/increase.html',
  },
  humanRights: {
    law: b('新不伦瑞克省《人权法》', 'New Brunswick’s Human Rights Act'),
    body: b('新不伦瑞克人权委员会', 'the New Brunswick Human Rights Commission'),
    examples: b('家庭状况、社会状况（含收入来源）', 'family status, social condition (including source of income)'),
    url: 'https://laws.gnb.ca/en/document/cs/2011-c.171',
    cite: 'Human Rights Act, R.S.N.B. 2011, c. 171, ss. 2, 2.1(k), (o), 5(1), 9',
  },
  privacyLaw: pipeda(PIPEDA_URL),
  leaseEnd: {
    zh: '固定期限租约在到期日自动结束，双方都无需通知；到期后租客继续居住且房东收取租金的，形成新的按期租约。按月租约的终止通知须在月末前 1 个月书面发出；房东只能基于有限理由（如自用、改作非住宅用途、经批准的翻修）终止按期租约（《住宅租赁法》第 23、24 条）。',
    en: 'A fixed-term tenancy ends automatically on its end date with no notice needed; if the tenant stays and the landlord accepts rent, a new periodic tenancy is created. A month-to-month tenancy is ended with written notice 1 month before the end of a month; a landlord may end a periodic tenancy only for limited reasons, such as own use, non-residential use or approved renovations (The Residential Tenancies Act, ss. 23, 24).',
    cite: 'The Residential Tenancies Act, S.N.B. 1975, c. R-10.2, ss. 23, 24(1), 24.12, 24.13',
    url: 'https://www.gnb.ca/en/topic/family-home-community/housing-property/lease.html',
  },
  adverseDecision: {
    zh: '如信用报告在本决定中起了作用，你可在 60 天内书面要求房东提供信用报告机构的名称和地址（《信用报告服务法》第 15 条）。',
    en: 'If a credit report played a role in this decision, you may ask the landlord in writing, within 60 days, for the name and address of the credit reporting agency (Credit Reporting Services Act, s. 15).',
    cite: 'Credit Reporting Services Act, S.N.B. 2017, c. 27, s. 15', url: 'https://laws.gnb.ca/en/document/cs/2017-c.27',
  },
  listingNote: b(
    '押金须在租约中约定，最多一个月租金，房东须在 15 天内交到租客与房东关系办公室保管；不能另收宠物或其他押金，也不能要求预付最后一个月租金（《住宅租赁法》第 8 条）。房东可以实行禁养宠物，但须按《人权法》为残障租客需要的服务动物破例。必须使用标准租约，双方各持一份签字原件；纠纷由租客与房东关系办公室处理（第 9、19 条）。',
    'A deposit must be in the lease, is capped at one month’s rent and is remitted by the landlord within 15 days to the Tenant and Landlord Relations Office; no separate pet or other deposit, and no prepaid last month’s rent (The Residential Tenancies Act, s. 8). A landlord may have a no-pets policy but must make an exception for a service animal a tenant with a disability needs, under the Human Rights Act. The standard form of lease is mandatory, with a signed original for each party; disputes go to the Tenant and Landlord Relations Office (ss. 9, 19).',
  ),
  notPermitted: [
    b('另收的宠物押金', 'a separate pet deposit'),
    b('租金、押金和合理服务费以外的其他款项', 'any payment other than rent, the deposit and a reasonable service charge'),
    b('预付最后一个月租金', 'prepaid last month’s rent'),
  ],
  depositFootnote: b(
    '押金须在 15 天内上交租客与房东关系办公室保管，租客不获付利息；房东须在租约结束后 7 天内提出索赔，否则余额在租客书面要求后 7 天内退还（《住宅租赁法》第 8、8.1 条）。',
    'The deposit is remitted within 15 days to the Tenant and Landlord Relations Office and earns the tenant no interest; the landlord must claim within 7 days after the tenancy ends, otherwise the balance is returned within 7 days of the tenant’s written request (The Residential Tenancies Act, ss. 8, 8.1).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// Prince Edward Island
// ───────────────────────────────────────────────────────────────────────────

const PE_RTA_URL = 'https://www.princeedwardisland.ca/sites/default/files/legislation/r-13-11-_residential_tenancy_act.pdf'

const PE: ProvinceRules = {
  code: 'PE',
  statute: {
    zh: '《住宅租赁法》及《住宅租赁条例》', en: 'Residential Tenancy Act and Residential Tenancy Regulations',
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11; Residential Tenancy Regulations (EC269/23)', url: PE_RTA_URL,
  },
  tribunal: {
    zh: '住宅租赁主任办公室，可上诉至岛屿监管与上诉委员会（IRAC）', en: 'Office of the Director of Residential Tenancy (Rental Office), with appeals to the Island Regulatory and Appeals Commission (IRAC)',
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11, ss. 7, 75–89', url: 'https://peirentaloffice.ca/about-us/',
  },
  leaseForm: {
    mandatory: false,
    name: b('标准租赁协议（Form 1，可选用）', 'Form 1, Standard Form of Tenancy Agreement (optional)'),
    url: 'https://peirentaloffice.ca/wp-content/uploads/Form-1-Standard-Form-of-Tenancy-Agreement.pdf',
    copyDays: 10,
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11, s. 11(1)–(3), (7)',
    lines: [
      b('租约必须书面订立，但不要求特定的政府表格；房东须准备包含法定内容的书面协议，包括上一位租客的租金和押金（《住宅租赁法》第 11(1)–(2) 条）。',
        'A written tenancy agreement is mandatory but no particular government form is; the landlord prepares a written agreement with the content the Act lists, including the previous tenant’s rent and the deposit (Residential Tenancy Act, s. 11(1)–(2)).'),
      b('订立租约后 10 天内，房东须免费把副本交给租客（第 11(3) 条）。',
        'Within 10 days after entering into the agreement the landlord gives the tenant a copy at no cost (s. 11(3)).'),
      b('租赁办公室提供可选用的标准租赁协议（Form 1）。', 'The Rental Office publishes an optional Form 1, Standard Form of Tenancy Agreement.'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 1,
    zh: '押金只能在订立租约时收取，每份租约一份，最多一个月租金（按周付租为一周）；须在 2 个银行工作日内存入岛内的计息账户（3 套或以上单位须用专门信托账户），并开具收据（《住宅租赁法》第 14、15 条）。',
    en: 'One deposit per tenancy, only when the agreement is entered into, of at most one month’s rent (one week if rent is weekly); it goes into an interest-bearing account in the province within 2 banking days (a dedicated trust account for 3 or more units), with a receipt (Residential Tenancy Act, ss. 14, 15).',
    covers: b('以信托方式保管，担保租客的义务；租约中让房东自动保留押金的条款被禁止。', 'Held in trust as security for the tenant’s obligations; a lease term letting the landlord keep it automatically is prohibited.'),
    interest: b('按法定利率付息，2026 年为 2.75%。', 'Interest at the prescribed rate, 2.75% for 2026.'),
    returnDays: 15,
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11, ss. 14, 15, 40; Residential Tenancy Regulations, s. 3', url: PE_RTA_URL,
  },
  petDeposit: {
    allowed: false, maxMonths: 0, combinedWithDeposit: false,
    zh: '除那一份押金外不得接受任何押金，每份租约也只能收一份押金，所以不能另收宠物押金（《住宅租赁法》第 12(2)、15(b) 条）。',
    en: 'No deposit other than the single security deposit may be accepted, and only one per tenancy, so a separate pet deposit is prohibited (Residential Tenancy Act, ss. 12(2), 15(b)).',
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11, ss. 12(2), 15(b)', url: PE_RTA_URL,
  },
  keyOrOtherDeposits: {
    allowed: false, key: 'prohibited',
    zh: '除押金外不得接受其他押金，钥匙、门禁卡或订金押金都不允许；可以收取更换或加配钥匙的实际成本、银行退票费加最多 $25 手续费，以及租客要求的额外服务费用；不得收取访客费（《住宅租赁法》第 12(2)、20 条）。',
    en: 'No deposit other than the security deposit may be accepted, so key, fob or holding deposits are prohibited; the landlord may charge the actual cost of replacement or extra keys, the bank’s returned-cheque charge plus up to $25, and services the tenant asks for; no guest fees (Residential Tenancy Act, ss. 12(2), 20).',
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11, ss. 12(2), 20', url: PE_RTA_URL,
  },
  advanceRent: {
    maxMonths: 0, lastMonth: 'counts_toward_deposit',
    zh: '超出应付租金的款项视为押金，计入一个月上限，超过上限的部分视为下期租金的部分付款；因此不能在足额押金之外再收最后一个月租金（《住宅租赁法》第 12(2)、14(5) 条）。',
    en: 'Money received above the rent payable is treated as a security deposit within the one-month cap, and anything beyond the cap as partial payment of the next rent; a landlord therefore cannot collect last month’s rent on top of a full deposit (Residential Tenancy Act, ss. 12(2), 14(5)).',
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11, ss. 14(5), 12(2)', url: PE_RTA_URL,
  },
  applicationFee: {
    allowed: false,
    zh: '房东不得为接受或处理租房申请、调查申请人是否合适（如信用或推荐人查询）或接受其为租客收取费用（《住宅租赁法》第 12(1) 条）。',
    en: 'A landlord may not charge for accepting or processing an application, investigating the applicant’s suitability (such as credit or reference checks) or accepting the person as a tenant (Residential Tenancy Act, s. 12(1)).',
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11, s. 12(1)', url: PE_RTA_URL,
  },
  petFee: null,
  petBanAllowed: {
    value: true,
    zh: '房东和租客可以约定禁养宠物，违反可以成为驱逐理由；但任何实际禁止服务动物的条款无效（《住宅租赁法》第 16、61 条）。',
    en: 'A landlord and tenant may agree to a no-pets term, and breaching it can be grounds for eviction; any term that has the effect of prohibiting service animals is void (Residential Tenancy Act, ss. 16, 61).',
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11, ss. 16, 61; Rental Office FAQs', url: 'https://peirentaloffice.ca/faqs/',
  },
  rentIncrease: {
    pct2026: 2,
    zh: '每 12 个月最多涨一次，须用法定表格（Form 8）提前至少 3 个月通知；涨幅不得超过主任每年定的比例（法定不超过 3%），2026 年为 2%；上限随单元而非租客，不能在换租客或空置期间涨租（《住宅租赁法》第 47–50 条）。',
    en: 'Rent may rise once every 12 months, with at least 3 months’ notice on the approved Form 8; no increase may exceed the annual allowable increase set by the Director (by statute at most 3%), which is 2% for 2026; the limits run with the unit, so rent cannot rise between tenants or while the unit is vacant (Residential Tenancy Act, ss. 47–50).',
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11, ss. 47–50', url: 'https://peirentaloffice.ca/2026-rent-increase/',
  },
  humanRights: {
    law: b('爱德华王子岛省《人权法》', 'Prince Edward Island’s Human Rights Act'),
    body: b('爱德华王子岛人权委员会', 'the Prince Edward Island Human Rights Commission'),
    examples: b('收入来源、家庭状况', 'source of income, family status'),
    url: 'https://www.princeedwardisland.ca/sites/default/files/legislation/H-12%20-Human%20Rights%20Act.pdf',
    cite: 'Human Rights Act, R.S.P.E.I. 1988, c. H-12, ss. 1(1)(d), 3(1)',
  },
  privacyLaw: pipeda(PIPEDA_URL),
  leaseEnd: {
    zh: '没有续约选项的固定期限租约不会单纯结束；除非房东依法终止或双方另签书面协议结束，否则视为按相同条件转为按月租约；租客结束按月或固定期限租约须提前至少一个月通知（固定期限最早于约定结束日生效）（《住宅租赁法》第 51、52、55 条）。',
    en: 'A fixed-term agreement without a renewal option does not simply end: unless the landlord validly terminated it or the parties signed a separate written agreement to end it, it is deemed renewed month to month on the same terms; a tenant ends a month-to-month or fixed-term tenancy with at least one month’s notice (a fixed term no earlier than its end date) (Residential Tenancy Act, ss. 51, 52, 55).',
    cite: 'Residential Tenancy Act, R.S.P.E.I. 1988, c. R-13.11, ss. 51, 52, 55', url: PE_RTA_URL,
  },
  adverseDecision: {
    zh: '如本决定全部或部分基于消费者报告机构或其他来源的信息，你可在 60 天内要求房东告知该机构的名称和地址，或（信息来自其他来源时）信息的性质与来源（《消费者报告法》第 10 条）。',
    en: 'If this decision relied wholly or partly on information from a consumer reporting agency or another source, you may, within 60 days, ask the landlord for the agency’s name and address or, for another source, the nature and source of the information (Consumer Reporting Act, s. 10).',
    cite: 'Consumer Reporting Act, R.S.P.E.I. 1988, c. C-20, s. 10(2)–(3)',
    url: 'https://www.princeedwardisland.ca/sites/default/files/legislation/C-20-Consumer%20Reporting%20Act.pdf',
  },
  listingNote: b(
    '只能收一份押金，最多一个月租金，并须存入岛内的计息账户；不能另收宠物、钥匙或订金押金，也不得收取申请费或筛查费（《住宅租赁法》第 12、14、15 条）。双方可以约定禁养宠物，但任何实际禁止服务动物的条款无效（第 16 条）。租约必须书面订立（政府表格可选用），10 天内免费交给租客一份；纠纷由住宅租赁主任办公室处理，可上诉至岛屿监管与上诉委员会（IRAC）（第 11、89 条）。',
    'One security deposit of at most one month’s rent, held in an interest-bearing account in the province; no separate pet, key or holding deposit, and no application or screening fee (Residential Tenancy Act, ss. 12, 14, 15). A no-pets term may be agreed, but any term that effectively bans service animals is void (s. 16). The tenancy agreement must be in writing (the government form is optional), with a free copy to the tenant within 10 days; disputes go to the Office of the Director of Residential Tenancy, with appeals to the Island Regulatory and Appeals Commission (IRAC) (ss. 11, 89).',
  ),
  notPermitted: [
    b('申请费、筛查费或信用查询费', 'application, screening or credit-check fees'),
    b('另收的宠物押金', 'a separate pet deposit'),
    b('钥匙、门禁卡或订金押金', 'key, fob or holding deposits'),
    b('访客费', 'guest fees'),
  ],
  depositFootnote: b(
    '押金须在 2 个银行工作日内存入岛内计息账户，2026 年利率为 2.75%；租约结束后 15 天内，房东须退还押金和利息或向主任申请索赔，否则须付给租客双倍押金（《住宅租赁法》第 14、40 条）。',
    'The deposit goes into an interest-bearing account in the province within 2 banking days (2.75% in 2026); within 15 days after the tenancy ends the landlord returns it with interest or applies to the Director to claim against it, or else pays the tenant double (Residential Tenancy Act, ss. 14, 40).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// Newfoundland and Labrador
// ───────────────────────────────────────────────────────────────────────────

const NL_RTA_URL = 'https://www.assembly.nl.ca/legislation/sr/statutes/r14-2.htm'

const NL: ProvinceRules = {
  code: 'NL',
  statute: { zh: '《2018 年住宅租赁法》', en: 'Residential Tenancies Act, 2018', cite: 'Residential Tenancies Act, 2018, S.N.L. 2018, c. R-14.2', url: NL_RTA_URL },
  tribunal: {
    zh: '住宅租赁办公室', en: 'Residential Tenancies Office',
    cite: 'Residential Tenancies Act, 2018, S.N.L. 2018, c. R-14.2, ss. 5, 42, 45–47, 50', url: 'https://www.gov.nl.ca/gs/landlord-tenant/',
  },
  leaseForm: {
    mandatory: false,
    name: b('标准租赁协议（政府范本，可修改使用）', 'Standard Rental Agreement (government template)'),
    url: 'https://www.gov.nl.ca/gs/files/landlord-pdf-section-02-rental-agreement.pdf',
    copyDays: 10,
    cite: 'Residential Tenancies Act, 2018, S.N.L. 2018, c. R-14.2, ss. 7(1)–(4), 10(2)',
    lines: [
      b('没有强制的政府表格；每份租约都须包含法定信息，书面租约须逐字载入第 10 条的法定条件（《2018 年住宅租赁法》第 7、10(2) 条）。',
        'No government form is mandatory; every agreement must contain the required information, and a written agreement must reproduce the statutory conditions in s. 10 word for word (Residential Tenancies Act, 2018, ss. 7, 10(2)).'),
      b('订立租约时房东须给租客一份《2018 年住宅租赁法》，签署后 10 天内交给租客签字的租约副本；口头租约须在 10 天内书面告知法定信息（第 7 条）。',
        'The landlord gives the tenant a copy of the Act when the agreement is made and a copy of the signed agreement within 10 days of signing; for an oral agreement, a written notice with the required information within 10 days (s. 7).'),
      b('房东履行这些义务之前，租客的付租义务暂停（第 7 条）。', 'Until the landlord complies, the tenant’s obligation to pay rent is suspended (s. 7).'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 0.75,
    zh: '押金最多为月租的四分之三（按周租约为两周租金），须开具收据，并在 2 个银行工作日内存入省内的计息账户（3 套或以上单位须用专门信托账户）（《2018 年住宅租赁法》第 14 条）。',
    en: 'The security deposit is capped at three quarters of a month’s rent (two weeks’ rent for weekly tenancies), with a receipt, and goes into an interest-bearing account in the province within 2 banking days (a dedicated trust account for 3 or more units) (Residential Tenancies Act, 2018, s. 14).',
    covers: b('以信托方式保管，担保租客的义务，如欠租或损坏。', 'Held in trust as security for the tenant’s obligations, such as unpaid rent or damage.'),
    interest: b('按《押金利息条例》计息，2026 年为 0.00%。', 'Interest at the Security Deposit Interest Regulations rate, 0.00% for 2026.'),
    returnDays: 10,
    cite: 'Residential Tenancies Act, 2018, S.N.L. 2018, c. R-14.2, s. 14; Security Deposit Interest Regulations', url: NL_RTA_URL,
  },
  petDeposit: {
    allowed: false, maxMonths: 0, combinedWithDeposit: false,
    zh: '不能另收宠物押金；租金以外收到的任何款项都视为那一份押金的一部分，上限为月租的四分之三，多付的租客可以用来抵租金（《2018 年住宅租赁法》第 14(1)–(3) 条）。',
    en: 'No separate pet deposit; any money received beyond rent is part of the single deposit capped at three quarters of a month’s rent, and an overpayment may be applied by the tenant to rent (Residential Tenancies Act, 2018, s. 14(1)–(3)).',
    cite: 'Residential Tenancies Act, 2018, S.N.L. 2018, c. R-14.2, s. 14(1)–(3); Residential Tenancies Office, A Guide for Landlords and Tenants (January 1, 2019)',
    url: 'https://www.gov.nl.ca/gs/files/landlord-guide-for-landlords-tenants.pdf',
  },
  keyOrOtherDeposits: {
    allowed: false, key: 'counts_toward_deposit',
    zh: '不能另收押金；钥匙或门禁卡押金等租金以外的款项都视为押金，计入四分之三月租的上限；可以收取滞纳金（第一天 $5、之后每天 $2，最多 $75）、银行实际退票费，以及转租或转让的实际费用（《2018 年住宅租赁法》第 14(2)–(3)、15 条）。',
    en: 'No separate deposits; any money beyond rent, key or fob deposits included, is deemed a security deposit within the three-quarter-month cap; allowed charges are a late fee ($5 for the first day and $2 a day after, up to $75), the bank’s NSF charge and sublet or assignment costs actually incurred (Residential Tenancies Act, 2018, ss. 14(2)–(3), 15).',
    cite: 'Residential Tenancies Act, 2018, S.N.L. 2018, c. R-14.2, ss. 14(2)–(3), 15, 10(1) statutory condition 3', url: NL_RTA_URL,
  },
  advanceRent: {
    maxMonths: null, lastMonth: 'prohibited',
    zh: '房东不能要求或接受预付最后一周或最后一个月的租金，也不能要求某一笔租金高于其他常规付款；租约可以要求预开支票（《2018 年住宅租赁法》第 12、13 条）。',
    en: 'A landlord may not require or accept a prepayment of the last week’s or last month’s rent, or a single payment larger than the regular ones; a rental agreement may require post-dated cheques (Residential Tenancies Act, 2018, ss. 12, 13).',
    cite: 'Residential Tenancies Act, 2018, S.N.L. 2018, c. R-14.2, ss. 12, 13', url: NL_RTA_URL,
  },
  applicationFee: {
    allowed: null,
    zh: '法律没有规定申请费、筛查费或信用查询费；但租客在租金以外支付的任何款项都视为押金，向最终成为租客的人收取的费用可能被计入四分之三月租的押金（《2018 年住宅租赁法》第 14(2) 条）。',
    en: 'The Act does not mention application, screening or credit-check fees; but money a tenant pays beyond rent is deemed a security deposit, so a fee collected from someone who becomes the tenant risks counting toward the three-quarter-month deposit (Residential Tenancies Act, 2018, s. 14(2)).',
    cite: 'Residential Tenancies Act, 2018, S.N.L. 2018, c. R-14.2 (no provision); cf. s. 14(2)', url: NL_RTA_URL,
  },
  petFee: null,
  petBanAllowed: {
    value: true,
    zh: '房东一般可以禁止养宠物或限制种类；但对服务动物适用禁养条款可能构成歧视，房东须提供便利，除非造成过度困难（住宅租赁办公室指南；合理规则政策 02-005）。',
    en: 'A landlord may generally prohibit pets or limit the types allowed; applied to a service animal a no-pets term may be discriminatory, and the landlord must accommodate unless that would cause undue hardship (Residential Tenancies Office guide; Policy 02-005, Reasonable Rules).',
    cite: 'Residential Tenancies Office, A Guide for Landlords and Tenants (2019); Residential Tenancies Program Policy 02-005 (Reasonable Rules)',
    url: 'https://www.gov.nl.ca/gs/files/landlord-guide-for-landlords-tenants.pdf',
  },
  rentIncrease: {
    pct2026: null,
    zh: '没有涨租上限或指导比例；租约前 12 个月内和固定期限内不能涨租，按期租约每 12 个月最多一次；按月或固定期限的租约须提前至少 6 个月书面通知（《2018 年住宅租赁法》第 16 条）。',
    en: 'There is no rent cap or guideline; rent cannot rise in the first 12 months, during a fixed term, or more than once in 12 months for a periodic tenancy; month-to-month or fixed-term premises need at least 6 months’ written notice (Residential Tenancies Act, 2018, s. 16).',
    cite: 'Residential Tenancies Act, 2018, S.N.L. 2018, c. R-14.2, s. 16', url: NL_RTA_URL,
  },
  humanRights: {
    law: b('纽芬兰与拉布拉多省《2010 年人权法》', 'Newfoundland and Labrador’s Human Rights Act, 2010'),
    body: b('纽芬兰与拉布拉多人权委员会', 'the Human Rights Commission of Newfoundland and Labrador'),
    examples: b('家庭状况、收入来源（指领取收入与就业支持）', 'family status, source of income (receiving income or employment support)'),
    url: 'https://www.assembly.nl.ca/legislation/sr/statutes/h13-1.htm',
    cite: 'Human Rights Act, 2010, S.N.L. 2010, c. H-13.1, ss. 2(p), 9(1), 12',
  },
  privacyLaw: pipeda(PIPEDA_URL),
  leaseEnd: {
    zh: '固定期限为 6–12 个月；要在期满时结束，租客须提前至少 2 个月、房东须提前至少 3 个月通知（房东无须理由）；无人通知而租客继续居住的，租约按相同条件继续，可按按月租约终止（租客提前 1 个月、房东提前 3 个月）（《2018 年住宅租赁法》第 8(3)、18 条）。',
    en: 'Fixed terms run 6–12 months; to end one at its term the tenant gives at least 2 months’ notice and the landlord at least 3 months’ (no cause needed); if no notice is given and the tenant stays, the tenancy continues on the same terms and can be ended like a month-to-month tenancy (tenant 1 month, landlord 3 months) (Residential Tenancies Act, 2018, ss. 8(3), 18).',
    cite: 'Residential Tenancies Act, 2018, S.N.L. 2018, c. R-14.2, ss. 8(3), 18(1)–(2), (5)–(6)', url: NL_RTA_URL,
  },
  adverseDecision: null,
  listingNote: b(
    '押金最多为月租的四分之三，租金以外的任何款项（宠物、钥匙押金等）都视为押金；不能要求预付最后一个月租金（《2018 年住宅租赁法》第 12、14 条）。房东一般可以禁止养宠物或限制种类，但须为服务动物提供便利，除非造成过度困难（住宅租赁办公室指南）。没有强制的租约表格，书面租约须逐字载入法定条件，10 天内交给租客一份；纠纷由住宅租赁办公室处理（第 7、10、42 条）。',
    'The security deposit is capped at three quarters of a month’s rent, and any money beyond rent — pet or key deposits included — counts as deposit; prepaid last month’s rent may not be required (Residential Tenancies Act, 2018, ss. 12, 14). A landlord may generally prohibit pets or limit the types, but must accommodate a service animal unless that causes undue hardship (Residential Tenancies Office guide). There is no mandatory lease form; a written lease must reproduce the statutory conditions word for word, with a copy to the tenant within 10 days; disputes go to the Residential Tenancies Office (ss. 7, 10, 42).',
  ),
  notPermitted: [
    b('另收的宠物押金', 'a separate pet deposit'),
    b('另收的钥匙押金', 'a separate key deposit'),
    b('预付最后一个月租金', 'prepaid last month’s rent'),
  ],
  depositFootnote: b(
    '押金须开具收据，并在 2 个银行工作日内存入省内计息账户，2026 年利率为 0.00%；租客搬离后 10 天内须退还，除非房东有索赔（《2018 年住宅租赁法》第 14 条）。',
    'The deposit needs a receipt and goes into an interest-bearing account in the province within 2 banking days (0.00% in 2026); it is returned within 10 days after the tenant vacates unless the landlord has a claim (Residential Tenancies Act, 2018, s. 14).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// Yukon
// ───────────────────────────────────────────────────────────────────────────

const YT_RTA_URL = 'https://laws.yukon.ca/cms/images/LEGISLATION/PRINCIPAL/2025/2025-0007/2025-0007_1.pdf'

const YT: ProvinceRules = {
  code: 'YT',
  statute: {
    zh: '《住宅租赁法》（2025 年 9 月 1 日起施行）及《住宅租赁条例》', en: 'Residential Tenancies Act (in force 1 September 2025) and Residential Tenancies Regulation',
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7; Residential Tenancies Regulation, O.I.C. 2025/160', url: YT_RTA_URL,
  },
  tribunal: {
    zh: '住宅租赁办公室（RTO）', en: 'Residential Tenancies Office (RTO)',
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7, ss. 94, 119; Residential Tenancies Regulation, O.I.C. 2025/160, s. 3',
    url: 'https://yukon.ca/en/housing-and-property/landlords-and-tenants-responsibilities/dispute-resolution-residential-tenancies-office',
  },
  leaseForm: {
    mandatory: false,
    name: b('租赁协议范本（育空政府，可选用）', 'Tenancy agreement template (Government of Yukon, optional)'),
    url: YT_RTA_URL,
    copyDays: 21,
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7, ss. 12–13; Residential Tenancies Regulation, O.I.C. 2025/160, s. 5',
    lines: [
      b('没有强制的政府表格，住宅租赁办公室提供可选用的范本（《住宅租赁法》第 12–13 条）。',
        'There is no mandatory government form; the Residential Tenancies Office publishes an optional template (Residential Tenancies Act, ss. 12–13).'),
      b('2025 年 9 月 1 日起订立的租约必须由房东书面准备，包含法定标准条款和规定事项：姓名、地址、开始日期、固定或按期、固定期满后续约还是须搬出、租金、包含的服务和押金（第 13(1)–(2) 条）。',
        'Every agreement made on or after 1 September 2025 must be in writing, prepared by the landlord, with the standard terms and the required particulars: names, address, start date, fixed or periodic term, whether a fixed term continues or the tenant must vacate, rent, included services and deposits (s. 13(1)–(2)).'),
      b('房东须在 21 天内把签字的租约副本交给租客（第 13 条）。', 'The landlord gives the tenant a copy of the signed agreement within 21 days (s. 13).'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 1,
    zh: '押金最多一个月租金（按周租约为一周），只能在订立租约时收取，每份租约一份；未经房东书面同意不能抵租金；租约中让房东自动保留押金的条款被禁止（《住宅租赁法》第 16–18、23 条）。',
    en: 'The security deposit is capped at one month’s rent (one week for weekly tenancies), may be required only when the agreement is entered into, and only one per agreement; it may not be used as rent without the landlord’s written consent, and a term for automatic retention is prohibited (Residential Tenancies Act, ss. 16–18, 23).',
    covers: b('担保租客对物业的任何责任或义务。', 'Secures any liability or obligation of the tenant respecting the property.'),
    interest: b('利率为加拿大银行最优惠利率减 2%，不低于 0%（《住宅租赁条例》第 8 条）。', 'Interest is the Bank of Canada prime rate minus 2%, never below 0% (Residential Tenancies Regulation, s. 8).'),
    returnDays: 15,
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7, ss. 1, 16–18, 23, 53; Residential Tenancies Regulation, O.I.C. 2025/160, s. 8', url: YT_RTA_URL,
  },
  petDeposit: {
    allowed: true, maxMonths: 0.5, combinedWithDeposit: false,
    zh: '只有房东允许养宠物时才可收取宠物损坏押金，最多半个月租金（按周租约为一周），每份租约一份，只能在租约开始或租客开始养宠物时收取；与动物有关的押金条款受《人权法》约束（服务动物）（《住宅租赁法》第 19–22 条）。',
    en: 'Only if the landlord permits a pet: a pet damage deposit of up to half a month’s rent (one week for weekly tenancies), one per tenancy, required only at the start of the tenancy or when the tenant acquires a pet; animal-related deposit terms are subject to the Human Rights Act (service animals) (Residential Tenancies Act, ss. 19–22).',
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7, ss. 19–22, 53', url: YT_RTA_URL,
  },
  keyOrOtherDeposits: {
    allowed: false, key: 'counts_toward_deposit',
    zh: '押金和宠物损坏押金之外不允许其他押金；另收的钥匙或门禁卡押金本身就属于押金，计入一份、一个月的上限；租约写明时，可以收取钥匙、门锁或门禁设备的直接成本，以及银行退票费加最多 $25（《住宅租赁法》第 1、18(b) 条；《住宅租赁条例》第 6–7 条）。',
    en: 'No deposits beyond the security deposit and the pet damage deposit; a separate key or fob deposit would itself be a security deposit and count against the one-deposit, one-month limits; if the agreement specifies them, the landlord may charge the direct cost of a key, lock or access device and an NSF fee equal to the bank’s charge plus up to $25 (Residential Tenancies Act, ss. 1, 18(b); Residential Tenancies Regulation, ss. 6–7).',
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7, ss. 1, 18(b); Residential Tenancies Regulation, O.I.C. 2025/160, ss. 6–7',
    url: 'https://laws.yukon.ca/cms/images/LEGISLATION/SUBORDINATE/2025/2025-0160/2025-0160.pdf',
  },
  advanceRent: {
    maxMonths: 0, lastMonth: 'prohibited',
    zh: '房东不能为将来到期的租金要求或收取款项，所以不能预收租金或最后一个月租金；法律没有明确规定能否要求预开支票（《住宅租赁法》第 23–25 条）。',
    en: 'A landlord may not demand, receive or collect money for rent that becomes due in the future, so prepaid or last-month rent is prohibited; the Act does not expressly deal with requiring post-dated cheques (Residential Tenancies Act, ss. 23–25).',
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7, ss. 1, 23, 24, 25', url: YT_RTA_URL,
  },
  applicationFee: {
    allowed: false,
    zh: '房东不得为接受、处理申请、调查申请人是否合适（如筛查或信用查询）或接受其为租客收取任何费用（《住宅租赁法》第 15 条）。',
    en: 'A landlord may not charge anything for accepting or processing an application, investigating the applicant’s suitability (such as screening or credit checks) or accepting the person as a tenant (Residential Tenancies Act, s. 15).',
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7, s. 15', url: YT_RTA_URL,
  },
  petFee: null,
  petBanAllowed: {
    value: true,
    zh: '房东可以决定是否允许养宠物；但租约中有关动物的禁止、限制或其他要求都受《人权法》约束，须为残障人士的服务动物提供便利（《住宅租赁法》第 19–20 条）。',
    en: 'A landlord may decide whether to permit pets, but any prohibition, restriction or other animal-related requirement in the agreement is subject to the Human Rights Act, so service animals for a person with a disability must be accommodated (Residential Tenancies Act, ss. 19–20).',
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7, ss. 19–20; Human Rights Act, R.S.Y. 2002, c. 116',
    url: 'https://yukon.ca/en/housing-and-property/landlords-and-tenants-responsibilities/security-and-pet-deposits',
  },
  rentIncrease: {
    pct2026: 2.6,
    zh: '首次定租后 12 个月内不能涨租，之后每 12 个月最多一次，须用法定表格提前至少 3 个月通知；2026 年 5 月 15 日至 2027 年 5 月 14 日生效的涨租上限为 2.6%；用算法或人工智能软件评估或设定租金属于违法（《住宅租赁法》第 38–41、136(3) 条；《住宅租赁条例》第 10–12 条）。',
    en: 'No increase in the first 12 months after rent is first set, then at most once every 12 months, with at least 3 months’ notice on the approved form; for increases taking effect 15 May 2026 – 14 May 2027 the cap is 2.6%; using algorithmic or AI software to evaluate or set rent is an offence (Residential Tenancies Act, ss. 38–41, 136(3); Residential Tenancies Regulation, ss. 10–12).',
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7, ss. 3, 38–41, 136(3); Residential Tenancies Regulation, O.I.C. 2025/160, ss. 10–12',
    url: 'https://yukon.ca/en/housing-and-property/landlords-and-tenants-responsibilities/rent-increases',
  },
  humanRights: {
    law: b('育空《人权法》', 'Yukon’s Human Rights Act'),
    body: b('育空人权委员会', 'the Yukon Human Rights Commission'),
    examples: b('婚姻或家庭状况（含有子女的租客）、收入来源（含领取公共援助）', 'marital or family status (including tenants with children), source of income (including receipt of public assistance)'),
    url: 'https://laws.yukon.ca/cms/images/LEGISLATION/PRINCIPAL/2002/2002-0116/2002-0116.pdf',
    cite: 'Human Rights Act, R.S.Y. 2002, c. 116, ss. 7(k)–(l), 9(d), 11(3)(b), 16, 22',
  },
  privacyLaw: pipeda(PIPEDA_BRIEF_URL),
  leaseEnd: {
    zh: '租约须写明固定期满后是续为按期租约、续另一个固定期，还是租客须搬出；没有要求搬出且双方未另签新约的，视为按相同条件转为按月租约；租客结束按月租约须至少提前一个月通知，于租金到期日前一天生效；房东只能基于法定理由终止租约，没有「无理由」驱逐（《住宅租赁法》第 13(2)、55、56 条）。',
    en: 'The agreement must say whether a fixed term continues as a periodic tenancy, continues for another fixed term, or ends with the tenant vacating; if it does not require the tenant to vacate and no new agreement is made, it is deemed renewed month to month on the same terms; a tenant ends a monthly tenancy with at least one month’s notice, effective the day before rent is due; landlords may end tenancies only for the reasons in the Act, with no “without cause” evictions (Residential Tenancies Act, ss. 13(2), 55, 56).',
    cite: 'Residential Tenancies Act, S.Y. 2025, c. 7, ss. 13(2)(g)(iii), 55, 56', url: YT_RTA_URL,
  },
  adverseDecision: null,
  listingNote: b(
    '押金最多一个月租金；允许养宠物时可另收最多半个月租金的宠物损坏押金；不得预收未到期的租金，也不得收取申请费或筛查费（《住宅租赁法》第 15、17、21、23 条）。房东可以决定是否允许养宠物，但相关条款受《人权法》约束，须为残障人士的服务动物提供便利（第 20 条）。租约须书面订立并包含法定标准条款，21 天内交给租客一份；纠纷由住宅租赁办公室（RTO）处理（第 13、94 条）。',
    'The security deposit is capped at one month’s rent, plus — if a pet is permitted — a pet damage deposit of up to half a month’s rent; no rent collected before it is due and no application or screening fee (Residential Tenancies Act, ss. 15, 17, 21, 23). A landlord may decide whether to permit pets, but such terms are subject to the Human Rights Act and service animals must be accommodated (s. 20). The agreement must be in writing with the standard terms, with a copy to the tenant within 21 days; disputes go to the Residential Tenancies Office (RTO) (ss. 13, 94).',
  ),
  notPermitted: [
    b('申请费、筛查费或信用查询费', 'application, screening or credit-check fees'),
    b('预收未到期的租金（含最后一个月）', 'rent collected before it is due (last month included)'),
    b('另收的钥匙押金', 'a separate key deposit'),
  ],
  depositFootnote: b(
    '押金和宠物押金的利率为最优惠利率减 2%（不低于 0%）；租约结束与收到租客书面转寄地址或电子转账资料两者中较晚一日起 15 天内，房东须退还押金和利息，或申请纠纷解决（《住宅租赁法》第 53 条；《住宅租赁条例》第 8 条）。',
    'Deposits earn prime minus 2% (never below 0%); within 15 days after the later of the end of the tenancy and receipt of the tenant’s forwarding address or e-transfer details in writing, the landlord returns them with interest or applies for dispute resolution (Residential Tenancies Act, s. 53; Residential Tenancies Regulation, s. 8).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// Northwest Territories
// ───────────────────────────────────────────────────────────────────────────

const NT_RTA_URL = 'https://www.justice.gov.nt.ca/en/files/legislation/residential-tenancies/residential-tenancies.a.pdf'

const NT: ProvinceRules = {
  code: 'NT',
  statute: {
    zh: '《住宅租赁法》及《住宅租赁条例》', en: 'Residential Tenancies Act and Residential Tenancies Regulations',
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5; Residential Tenancies Regulations, R-052-2010', url: NT_RTA_URL,
  },
  tribunal: {
    zh: '租赁官（西北地区租赁办公室）', en: 'Rental Officer (NWT Rental Office)',
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5, ss. 1, 72', url: 'https://www.justice.gov.nt.ca/en/boards-agencies/rental-office/',
  },
  leaseForm: {
    mandatory: false,
    name: b('法定租赁协议格式（《住宅租赁条例》附表）', 'Tenancy agreement in the Schedule to the Residential Tenancies Regulations'),
    url: NT_RTA_URL,
    copyDays: 60,
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5, ss. 9–11; Residential Tenancies Regulations, R-052-2010, s. 1 and Schedule',
    lines: [
      b('租约可以口头、书面或默示订立；书面租约须签名，「可以」使用条例附表的格式（《住宅租赁法》第 9 条）。',
        'A tenancy agreement may be oral, written or implied; a written agreement must be signed and “may be” in the form in the Schedule to the Regulations (Residential Tenancies Act, s. 9).'),
      b('每份租约都视为包含该格式的条款，不一致的条款无效（第 10 条）。', 'Every agreement is deemed to include the provisions of that form, and inconsistent provisions have no effect (s. 10).'),
      b('书面租约由租客签字交给房东后 60 天内，房东须让租客收到签字副本；在此之前租客可以把租金交给租赁官（第 11 条）。',
        'For a written agreement the landlord must ensure the tenant receives a signed copy within 60 days after the tenant signs and delivers it; until then the tenant may pay rent to a rental officer (s. 11).'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 1,
    zh: '押金最多一个月租金（按周租约为一周）；非按周租约可先付一半，其余三个月内付清；须以信托方式与房东资金分开保管（《住宅租赁法》第 14、15 条）。',
    en: 'The security deposit is capped at one month’s rent (one week for weekly tenancies); for other tenancies the tenant may pay half at the start and the rest within three months; it is held in trust, separate from the landlord’s money (Residential Tenancies Act, ss. 14, 15).',
    covers: b('担保房屋损坏和欠租。', 'Security for damage to the premises and for arrears of rent.'),
    interest: b('每年按 1 月 1 日加拿大银行特许银行非支票储蓄存款利率计单利。', 'Simple interest credited annually at the Bank of Canada chartered-bank non-chequable savings rate in effect on 1 January.'),
    returnDays: 10,
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5, ss. 1, 14, 15–18; Residential Tenancies Regulations, R-052-2010, s. 2', url: NT_RTA_URL,
  },
  petDeposit: {
    allowed: true, maxMonths: 0.5, combinedWithDeposit: false,
    zh: '租客养或打算养宠物时可收取宠物押金，最多半个月租金（按周租约为半周），无论几只宠物每份租约只能收一份；不得为残障人士使用的服务动物收取（《住宅租赁法》第 14.1 条）。',
    en: 'If the tenant keeps or intends to keep a pet, a pet security deposit of up to half a month’s rent (half a week’s for weekly tenancies), only one regardless of the number of pets; none for a service animal used by a person with a disability (Residential Tenancies Act, s. 14.1).',
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5, ss. 1, 14.1, 16–18', url: NT_RTA_URL,
  },
  keyOrOtherDeposits: {
    allowed: false, key: 'prohibited',
    zh: '除押金和宠物押金外，房东不得以订立租约为条件向租客或准租客要求或收取任何其他押金（含钥匙或门禁卡押金）或款项；滞纳金最多 $5 加每天 $1，上限 $65（《住宅租赁法》第 14.2 条；《住宅租赁条例》第 3 条）。',
    en: 'Apart from the security and pet security deposits, a landlord may not require or receive from a tenant or prospective tenant any other deposit (key or fob deposits included) or any other amount as a condition of entering a tenancy; a late-payment penalty is capped at $5 plus $1 a day, up to $65 (Residential Tenancies Act, s. 14.2; Residential Tenancies Regulations, s. 3).',
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5, s. 14.2; Residential Tenancies Regulations, R-052-2010, s. 3', url: NT_RTA_URL,
  },
  advanceRent: {
    maxMonths: 0, lastMonth: 'prohibited',
    zh: '法律没有直接规定预付租金或预开支票；但房东不得要求押金以外的款项作为订约条件，加速条款无效，租赁办公室指南明确房东不能要求提前付租（《住宅租赁法》第 13、14.2 条）。',
    en: 'The Act has no provision expressly on prepaid rent or post-dated cheques, but a landlord may not require any amount beyond the deposits as a condition of entering a tenancy, acceleration clauses are void, and the Rental Office’s guidance says the landlord cannot ask the tenant to pay rent early (Residential Tenancies Act, ss. 13, 14.2).',
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5, ss. 13, 14.2; NWT Rental Office, Information about the Residential Tenancies Act for landlords and tenants (Oct. 2021)',
    url: 'https://www.justice.gov.nt.ca/en/files/rental-agreements/Information%20about%20the%20Residential%20Tenancies%20Act%20for%20landlords%20and%20tenants_2021.pdf',
  },
  applicationFee: {
    allowed: false, inferred: true,
    zh: '法律没有点名申请费，但第 14.2(1) 条禁止房东以订约为条件向准租客收取押金以外的任何款项，因此看来不能收取申请、筛查或信用查询费（《住宅租赁法》第 14.2(1) 条）。',
    en: 'Application fees are not named, but s. 14.2(1) bars a landlord from requiring or receiving from a prospective tenant any amount other than the deposits as a condition of entering a tenancy, so an application, screening or credit-check fee appears to be prohibited (Residential Tenancies Act, s. 14.2(1)).',
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5, s. 14.2(1)', url: NT_RTA_URL,
  },
  petFee: null,
  petBanAllowed: {
    value: true,
    zh: '房东可以决定是否允许养宠物，并可在书面租约中约定禁养；但须按《人权法》为残障人士的服务动物提供便利（《住宅租赁法》第 7(2)、12 条；租赁办公室指南）。',
    en: 'A landlord may decide whether to allow pets and include a no-pets term in a written agreement, but must accommodate a service animal used by a person with a disability under the Human Rights Act (Residential Tenancies Act, ss. 7(2), 12; Rental Office guidance).',
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5, ss. 7(2), 12, 14.1, 45; NWT Rental Office booklet (Oct. 2021)',
    url: 'https://www.justice.gov.nt.ca/en/files/rental-agreements/Information%20about%20the%20Residential%20Tenancies%20Act%20for%20landlords%20and%20tenants_2021.pdf',
  },
  rentIncrease: {
    pct2026: null,
    zh: '没有涨租上限或指导比例；上次涨租生效（或首次收租）满 12 个月后才能再涨，换了房东也一样，须提前至少三个月书面通知；租客可把涨租通知当作终止通知，于涨租前一天生效（《住宅租赁法》第 47 条）。',
    en: 'There is no cap or guideline; rent may rise only 12 months after the last increase took effect (or after rent was first charged), even after a change of landlord, with at least three months’ written notice; a tenant may treat the notice as notice of termination effective the day before the increase (Residential Tenancies Act, s. 47).',
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5, s. 47', url: NT_RTA_URL,
  },
  humanRights: {
    law: b('西北地区《人权法》', 'the Northwest Territories’ Human Rights Act'),
    body: b('西北地区人权委员会', 'the NWT Human Rights Commission'),
    examples: b('家庭状况、社会状况（含收入来源和领取公共援助）', 'family status, social condition (including source of income and receipt of public assistance)'),
    url: 'https://www.justice.gov.nt.ca/en/files/legislation/human-rights/human-rights.a.pdf',
    cite: 'Human Rights Act, S.N.W.T. 2002, c. 18, ss. 1, 5(1), 12, 48; Residential Tenancies Act, s. 7(2)',
  },
  privacyLaw: pipeda(PIPEDA_BRIEF_URL),
  leaseEnd: {
    zh: '固定期限租约到期时视为按月续约，权利义务不变（可依法涨租），除非双方另订新约、租约已依法终止或属雇主提供的住房；租客可提前至少 30 天书面通知，于期满日结束；按月租约须提前至少 30 天通知，于某期最后一天结束（《住宅租赁法》第 48–52 条）。',
    en: 'At its end date a fixed-term agreement is deemed renewed as a monthly tenancy with the same rights and obligations (subject to a lawful increase), unless the parties made a new agreement, the tenancy was terminated under the Act, or it is employer-provided housing; a tenant may end a fixed term on its end date with written notice at least 30 days before, and a monthly tenancy with at least 30 days’ notice ending on the last day of a period (Residential Tenancies Act, ss. 48–52).',
    cite: 'Residential Tenancies Act, R.S.N.W.T. 1988, c. R-5, ss. 48–52', url: NT_RTA_URL,
  },
  adverseDecision: null,
  listingNote: b(
    '押金最多一个月租金（可先付一半，其余三个月内付清）；租客养宠物时可另收最多半个月租金的宠物押金，服务动物除外；不能收取其他任何款项作为订约条件（《住宅租赁法》第 14、14.1、14.2 条）。房东可以在书面租约中约定禁养宠物，但须按《人权法》为残障人士的服务动物提供便利（第 7(2)、12 条）。没有强制的租约表格，但每份租约都视为包含法定格式的条款，签字副本须在 60 天内交给租客；纠纷由租赁官处理（第 10、11、72 条）。',
    'The security deposit is capped at one month’s rent (half up front, the rest within three months); if the tenant keeps a pet, a pet deposit of up to half a month’s rent, none for a service animal; no other amount may be required as a condition of the tenancy (Residential Tenancies Act, ss. 14, 14.1, 14.2). A landlord may include a no-pets term in a written agreement but must accommodate a service animal under the Human Rights Act (ss. 7(2), 12). There is no mandatory lease form, but every agreement is deemed to include the prescribed form’s terms, and the tenant receives a signed copy within 60 days; disputes go to a rental officer (ss. 10, 11, 72).',
  ),
  notPermitted: [
    b('以订约为条件收取的押金和宠物押金以外的任何押金或款项（含钥匙押金）', 'any deposit or amount other than the security and pet deposits as a condition of the tenancy (key deposits included)'),
    b('提前收取租金', 'collecting rent early'),
  ],
  depositFootnote: b(
    '押金和宠物押金须以信托方式保管，每年计单利；租客搬离后 10 天内须退还押金和明细，保留任何金额须书面通知并附明细；没有入住和搬出检查报告，不能因损坏扣押金（《住宅租赁法》第 14–18 条）。',
    'Deposits are held in trust with simple interest each year; within 10 days after the tenant vacates the landlord returns them with an itemized statement, or gives written notice with a statement of anything kept; nothing may be kept for damage without entry and exit inspection reports (Residential Tenancies Act, ss. 14–18).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// Nunavut
// ───────────────────────────────────────────────────────────────────────────

const NU_RTA_URL = 'https://www.nunavutlegislation.ca/en/consolidated-law/residential-tenancies-act-official-consolidation'

const NU: ProvinceRules = {
  code: 'NU',
  statute: { zh: '《住宅租赁法》', en: 'Residential Tenancies Act', cite: 'Residential Tenancies Act, C.S.Nu., c. R-60', url: NU_RTA_URL },
  tribunal: {
    zh: '租赁官（努纳武特租赁办公室），可在 14 天内上诉至努纳武特司法法院', en: 'Rental Officer (Nunavut Rental Office), with appeals to the Nunavut Court of Justice within 14 days',
    cite: 'Residential Tenancies Act, C.S.Nu., c. R-60, ss. 72–74', url: 'https://www.gov.nu.ca/en/justice-and-individual-protection/nunavut-rental-office',
  },
  leaseForm: {
    mandatory: false,
    name: b('住宅租赁协议（《住宅租赁法》附表）', 'Residential Tenancy Agreement in the Schedule to the Act'),
    url: NU_RTA_URL,
    copyDays: 60,
    cite: 'Residential Tenancies Act, C.S.Nu., c. R-60, ss. 9–12 and Schedule',
    lines: [
      b('租约可以口头、书面或默示订立；书面租约须签名，「可以」使用法律附表中的格式（《住宅租赁法》第 9 条）。',
        'A tenancy agreement may be oral, written or implied; a written agreement must be signed and “may be” in the form in the Schedule to the Act (Residential Tenancies Act, s. 9).'),
      b('每份租约都视为包含附表的条款，不一致的条款无效；附表条款不得修改或删除，但可以按第 12 条增加（第 10、12 条）。',
        'Every agreement is deemed to include the Schedule’s provisions and inconsistent provisions have no effect; no part may be altered or deleted, but additions may be made under s. 12 (ss. 10, 12).'),
      b('书面租约须在 60 天内让租客收到签字副本；在此之前租客可以把租金交给租赁官（第 11 条）。',
        'For a written agreement the tenant must receive a signed copy within 60 days; until then the tenant may pay rent to a rental officer (s. 11).'),
    ],
  },
  deposit: {
    allowed: true, maxMonths: 1,
    zh: '押金最多一个月租金（按周租约为一周）；非按周租约可先付一半，其余三个月内付清；须以信托方式与房东资金分开保管，入住时须签署房屋状况与物品清单（《住宅租赁法》第 14、15 条）。',
    en: 'The security deposit is capped at one month’s rent (one week for weekly tenancies); for other tenancies the tenant may pay half at the start and half within three months; it is held in trust, separate from the landlord’s money, and a signed condition-and-contents document is required at the start (Residential Tenancies Act, ss. 14, 15).',
    covers: b('担保租客造成的损坏修复和欠租。', 'Security for repairs of damage caused by the tenant and for arrears of rent.'),
    interest: b('每年按 1 月 1 日加拿大银行 30 天存款收据利率付息。', 'Interest credited annually at the Bank of Canada 30-day deposit-receipt rate in effect on 1 January.'),
    returnDays: 10,
    cite: 'Residential Tenancies Act, C.S.Nu., c. R-60, ss. 1, 14–18', url: NU_RTA_URL,
  },
  petDeposit: {
    allowed: false, maxMonths: 0, combinedWithDeposit: false,
    zh: '法律没有宠物押金条款，第 14(5) 条禁止向租客或准租客收取押金以外的任何款项；宠物造成的损坏可以从普通押金中索赔（上限一个月租金）（《住宅租赁法》第 14(5) 条）。',
    en: 'The Act has no pet-deposit provision, and s. 14(5) bars requiring or receiving any amount from a tenant or prospective tenant other than the security deposit; pet damage can be claimed against the ordinary deposit, capped at one month’s rent (Residential Tenancies Act, s. 14(5)).',
    cite: 'Residential Tenancies Act, C.S.Nu., c. R-60, s. 14(5)', url: NU_RTA_URL,
  },
  keyOrOtherDeposits: {
    allowed: false, key: 'prohibited',
    zh: '钥匙或门禁卡押金、首月或最后一个月租金押金，以及向租客或准租客收取的任何其他款项都被禁止，唯一例外是一份最多一个月租金的押金（《住宅租赁法》第 14(5)–(6) 条）。',
    en: 'Key or fob deposits, first- or last-month rent deposits and any other amount from a tenant or prospective tenant are prohibited; the only exception is the single security deposit of at most one month’s rent (Residential Tenancies Act, s. 14(5)–(6)).',
    cite: 'Residential Tenancies Act, C.S.Nu., c. R-60, s. 14(5)–(6)', url: NU_RTA_URL,
  },
  advanceRent: {
    maxMonths: 0, lastMonth: 'prohibited',
    zh: '房东不能要求或收取首月或最后一个月租金的押金，或押金以外的任何款项（按时支付到期的首月租金不算押金）；加速条款无效；法律没有规定预开支票（《住宅租赁法》第 13、14(5) 条）。',
    en: 'A landlord may not require or receive a deposit for the first or last month’s rent, or any other amount beyond the security deposit (paying the first month’s rent when due is not a deposit); acceleration clauses are void; the Act is silent on post-dated cheques (Residential Tenancies Act, ss. 13, 14(5)).',
    cite: 'Residential Tenancies Act, C.S.Nu., c. R-60, ss. 13, 14(5)', url: NU_RTA_URL,
  },
  applicationFee: {
    allowed: false,
    zh: '房东不得向准租客收取押金以外的「任何其他款项」，涵盖申请、筛查和信用查询费（《住宅租赁法》第 14(5) 条）。',
    en: 'A landlord may not require or receive “any other amount” from a prospective tenant other than the security deposit, which covers application, screening and credit-check fees (Residential Tenancies Act, s. 14(5)).',
    cite: 'Residential Tenancies Act, C.S.Nu., c. R-60, s. 14(5)', url: NU_RTA_URL,
  },
  petFee: null,
  // No verified fact on whether a Nunavut landlord may ban pets — left out.
  petBanAllowed: null,
  rentIncrease: {
    pct2026: null,
    zh: '没有涨租上限或指导比例；上次涨租生效（或首次收租）满 12 个月后才能再涨，换了房东也一样，须提前至少三个月书面通知；租客可把涨租通知当作终止通知，于涨租前一天生效（《住宅租赁法》第 47 条）。',
    en: 'There is no cap or guideline; rent may rise only 12 months after the last increase took effect (or after rent was first charged), even after a change of landlord, with at least three months’ written notice; a tenant may treat the notice as notice of termination effective the day before the increase (Residential Tenancies Act, s. 47).',
    cite: 'Residential Tenancies Act, C.S.Nu., c. R-60, s. 47 and Schedule ss. 4(1), 5(1), 5(4)', url: NU_RTA_URL,
  },
  humanRights: {
    law: b('努纳武特《人权法》', 'Nunavut’s Human Rights Act'),
    body: b('努纳武特人权审裁处', 'the Nunavut Human Rights Tribunal'),
    examples: b('家庭状况（含有子女的租客）、合法收入来源（含公共援助）', 'family status (including tenants with children), lawful source of income (including public assistance)'),
    url: 'https://www.nunavutlegislation.ca/en/consolidated-law/human-rights-act-official-consolidation',
    cite: 'Human Rights Act, C.S.Nu., c. H-70, ss. 1, 7(1), 13, 16',
  },
  privacyLaw: pipeda(PIPEDA_BRIEF_URL),
  leaseEnd: {
    zh: '固定期限租约到期时视为按月续约，权利义务不变（可依法涨租），除非另订新约、租约已依法终止、单元是房东在努纳武特唯一的住所，或属公共或雇主住房；租客可提前至少 30 天通知于期满日结束；按月租约：租住不足 12 个月须提前 30 天，满 12 个月须提前 60 天（《住宅租赁法》第 48–52 条）。',
    en: 'At its end date a fixed-term agreement is deemed renewed as a monthly tenancy with the same rights and obligations (subject to a lawful increase), unless a new agreement was made, the tenancy was terminated under the Act, the unit was the landlord’s only residence in Nunavut, or it is subsidized public or employer housing; a tenant may end a fixed term on its end date with at least 30 days’ notice; a monthly tenancy needs 30 days’ notice in its first 12 months and 60 days after that (Residential Tenancies Act, ss. 48–52).',
    cite: 'Residential Tenancies Act, C.S.Nu., c. R-60, ss. 48–52', url: NU_RTA_URL,
  },
  adverseDecision: null,
  listingNote: b(
    '只能收一份押金，最多一个月租金（可先付一半，其余三个月内付清）；不能另收宠物、钥匙或首月 / 最后一个月租金押金，也不得收取申请费（《住宅租赁法》第 14 条）。没有强制的租约表格，但每份租约都视为包含法定附表的条款，签字副本须在 60 天内交给租客；纠纷由租赁官处理，可在 14 天内上诉至努纳武特司法法院（第 10、11、72–74 条）。',
    'One security deposit of at most one month’s rent (half up front, the rest within three months); no separate pet or key deposit, no first- or last-month rent deposit, and no application fee (Residential Tenancies Act, s. 14). There is no mandatory lease form, but every agreement is deemed to include the Schedule’s terms, and the tenant receives a signed copy within 60 days; disputes go to a rental officer, with appeals to the Nunavut Court of Justice within 14 days (ss. 10, 11, 72–74).',
  ),
  notPermitted: [
    b('申请费、筛查费或信用查询费', 'application, screening or credit-check fees'),
    b('另收的宠物押金', 'a separate pet deposit'),
    b('钥匙或门禁卡押金', 'key or fob deposits'),
    b('首月或最后一个月租金押金', 'first- or last-month rent deposits'),
  ],
  depositFootnote: b(
    '押金须以信托方式保管，每年付息；租客搬离后 10 天内须退还押金、利息和明细，保留任何金额须通知租客和租赁官；维修费用未定时，10 天内给出估算，30 天内结清（《住宅租赁法》第 14–18 条）。',
    'The deposit is held in trust and earns interest each year; within 10 days after the tenant vacates the landlord returns it with interest and an itemized statement, notifying the tenant and a rental officer of anything kept; if repair costs are not yet known, an estimate within 10 days and the final balance within 30 days (Residential Tenancies Act, ss. 14–18).',
  ),
}

// ───────────────────────────────────────────────────────────────────────────
// Lookup + helpers
// ───────────────────────────────────────────────────────────────────────────

export const PROVINCE_RULES: Record<NonOntarioCode, ProvinceRules> = { QC, BC, AB, MB, SK, NS, NB, PE, NL, YT, NT, NU }

export type ProvinceInput = ProvinceCode | string | null | undefined

/** Code for any input; an empty or unknown value is Ontario (the product's default). */
function codeOf(code: ProvinceInput): ProvinceCode {
  return normalizeProvince(code) ?? 'ON'
}

/** The rules for a province outside Ontario; null for Ontario (callers keep lib/ontario/rules). */
export function rulesFor(code: ProvinceInput): ProvinceRules | null {
  const c = codeOf(code)
  return c === 'ON' ? null : PROVINCE_RULES[c]
}

const pick = (t: Bi, lang: Lang): string => (lang === 'zh' ? t.zh : t.en)

/** 1–3 sentences for the listing page's 租赁条件 section; null for Ontario. */
export function listingRulesNote(code: ProvinceInput, lang: Lang): string | null {
  const r = rulesFor(code)
  return r ? pick(r.listingNote, lang) : null
}

export type MoveInRules = {
  /** Most rent a landlord may require ahead of its due date, in months: QC 1, 0 = none, null = no express rule. */
  advanceRentMonths: number | null
  deposit: { allowed: boolean; maxMonths: number }
  petDeposit: { allowed: boolean; maxMonths: number; combinedWithDeposit: boolean }
  /** allowed = a key deposit may be taken at all; countsTowardDeposit = it shares the deposit cap. */
  keyDeposit: { allowed: boolean | null; countsTowardDeposit: boolean }
  notPermitted: Bi[]
  footnote: Bi | null
  cite: string
}

/** Facts for the move-in cost card; null for Ontario. */
export function moveInRules(code: ProvinceInput): MoveInRules | null {
  const r = rulesFor(code)
  if (!r) return null
  const k = r.keyOrOtherDeposits
  return {
    advanceRentMonths: r.advanceRent.maxMonths,
    deposit: { allowed: r.deposit.allowed, maxMonths: r.deposit.maxMonths },
    petDeposit: { allowed: r.petDeposit.allowed, maxMonths: r.petDeposit.maxMonths, combinedWithDeposit: r.petDeposit.combinedWithDeposit },
    keyDeposit: { allowed: k.key === 'prohibited' ? false : k.allowed, countsTowardDeposit: k.key === 'counts_toward_deposit' },
    notPermitted: r.notPermitted,
    footnote: r.depositFootnote,
    cite: r.deposit.cite,
  }
}

// Listing text patterns (same spirit as the Ontario check, kept local so Ontario stays untouched).
const APP_FEE_RE = /\b(application|screening|credit[- ]check|processing|admin(istration)?)\s+fees?\b|申请费|筛查费|信用(检查|查询)费|手续费/i
const PET_DEPOSIT_RE = /\bpet\s+(damage\s+)?deposits?\b|宠物(损坏)?押金/i
const CLEAN_DEPOSIT_RE = /\bclean(ing)?\s+deposits?\b|清洁押金|\bdamage\s+deposits?\b|损坏押金/i
// Where a deposit is allowed, "damage deposit" is the everyday name of the security deposit itself
// (British Columbia, the Prairies): only a cleaning deposit is a separate one there.
const CLEANING_ONLY_RE = /\bclean(ing)?\s+deposits?\b|清洁押金/i
// Quebec allows no deposit at all: any deposit the copy states counts, unless it says there is none.
const ANY_DEPOSIT_RE = /\b(security|damage|rent|key|fob|pet|cleaning|holding)\s+deposits?\b|\bdeposit\s*(:|of\b|is\b|required\b|\$)|押金/i
// Phrases that say a deposit is NOT taken ("No pet deposit", "Deposit: none", 「不收押金」「押金：无」). They are
// removed before the Quebec check, so copy that rules a deposit out is not read as stating one.
const NEGATED_DEPOSIT_RE = /\b(no|without|zero)\s+((security|damage|rent|key|fob|pet|cleaning|holding)\s+)?deposits?\b|\bdeposit[- ]free\b|\bdeposits?\s*[:：]\s*(none|nil|n\/?a|\$?0(\.00)?(?![\d.,]))|不(收|需要?|用)(任何)?(宠物|钥匙|清洁|损坏)?押金|无(需)?(宠物|钥匙|清洁)?押金|免(宠物|钥匙)?押金|零押金|押金\s*[:：]\s*(无|没有|不收|免|0(?![\d.,]))/gi
const PET_FEE_RE = /\bpet\s+fees?\b|宠物费/i
const LAST_MONTH_RE = /\blast\s+month[’']?s?\s+rent\b|\bfirst\s+(and|&)\s+last\b|最后一个月租金|首尾(两个)?月/i
const NO_LAST_MONTH_RE = /\bno\s+(first\s+(and|&)\s+)?last\s+month|不(需要?|用|收)(预付)?最后一个月/i

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

/** Listing publish check for the listing's province. Ontario → checkListingCompliance unchanged;
 *  elsewhere only the verified facts of that province. */
export function checkListingComplianceFor(code: ProvinceInput, input: ListingInput): { passed: boolean; findings: Finding[] } {
  const r = rulesFor(code)
  if (!r) return checkListingCompliance(input)
  const f: Finding[] = []
  const name = { zh: provinceName(r.code, 'zh'), en: provinceName(r.code, 'en') }
  const rent = Number(input.monthly_rent) || 0
  const dep = input.deposit == null ? null : Number(input.deposit)
  const key = input.key_deposit == null ? 0 : Number(input.key_deposit) || 0
  const text = `${input.title || ''}\n${input.description || ''}\n${input.schedule_b || ''}`
  const k = r.keyOrOtherDeposits
  const qc = r.code === 'QC'

  if (!r.deposit.allowed) {
    const positive = text.replace(NEGATED_DEPOSIT_RE, ' ')
    const stated = PET_DEPOSIT_RE.test(positive) || CLEAN_DEPOSIT_RE.test(positive) || ANY_DEPOSIT_RE.test(positive)
    if ((dep != null && dep > 0) || (key > 0) || stated) {
      f.push({
        rule: qc ? 'QC-CCQ-1904-no-deposit' : `${r.code}-no-deposit`, statute: r.deposit.cite, severity: 'block',
        message: { zh: `${name.zh}不允许收取任何押金（包括钥匙押金和宠物押金）。`, en: `${name.en} does not allow any deposit (key and pet deposits included).` },
      })
    }
  } else {
    const total = (dep ?? 0) + (k.key === 'counts_toward_deposit' ? key : 0)
    const cap = r.deposit.maxMonths * rent
    if (rent > 0 && total > 0 && total > cap + 0.5) {
      const months = r.deposit.maxMonths === 0.5 ? b('半个月', 'half a month’s') : r.deposit.maxMonths === 0.75 ? b('四分之三个月', 'three quarters of a month’s') : b('一个月', 'one month’s')
      f.push({
        rule: `${r.code}-deposit-cap`, statute: r.deposit.cite, severity: 'block',
        message: {
          zh: `押金${k.key === 'counts_toward_deposit' && key > 0 ? '（含钥匙押金）' : ''} ${usd(total)} 超过${name.zh}允许的上限：${months.zh}租金（${usd(cap)}）。`,
          en: `The deposit${k.key === 'counts_toward_deposit' && key > 0 ? ' (key deposit included)' : ''} of ${usd(total)} exceeds ${name.en}’s cap of ${months.en} rent (${usd(cap)}).`,
        },
      })
    }
    if (key > 0 && k.key === 'prohibited') {
      f.push({
        rule: `${r.code}-no-key-deposit`, statute: k.cite, severity: 'block',
        message: { zh: `${name.zh}不允许另收钥匙押金。`, en: `${name.en} does not allow a separate key deposit.` },
      })
    }
    if (PET_DEPOSIT_RE.test(text) && !r.petDeposit.allowed) {
      f.push({
        rule: `${r.code}-no-pet-deposit`, statute: r.petDeposit.cite, severity: 'block',
        message: { zh: `${name.zh}不允许另收宠物押金。`, en: `${name.en} does not allow a separate pet deposit.` },
      })
    }
    const cleanMentioned = CLEANING_ONLY_RE.test(text)
    if (cleanMentioned && !(k.allowed && k.key === 'counts_toward_deposit')) {
      f.push({
        rule: `${r.code}-no-cleaning-deposit`, statute: k.cite, severity: 'block',
        message: {
          zh: k.key === 'counts_toward_deposit'
            ? `${name.zh}不能另收清洁押金；租金以外的款项都算作押金的一部分，受押金上限约束。`
            : `${name.zh}不允许另收清洁押金。`,
          en: k.key === 'counts_toward_deposit'
            ? `${name.en} does not allow a separate cleaning deposit; any money beyond rent is part of the capped deposit.`
            : `${name.en} does not allow a separate cleaning deposit.`,
        },
      })
    }
  }
  if (r.petFee && !r.petFee.allowed && PET_FEE_RE.test(text)) {
    f.push({
      rule: qc ? 'QC-CCQ-1904-no-pet-fee' : `${r.code}-no-pet-fee`, statute: r.petFee.cite, severity: 'block',
      message: { zh: `${name.zh}不允许收取宠物费。`, en: `${name.en} does not allow pet fees.` },
    })
  }
  if (r.advanceRent.lastMonth === 'prohibited' && LAST_MONTH_RE.test(text) && !NO_LAST_MONTH_RE.test(text)) {
    f.push({
      rule: qc ? 'QC-CCQ-1904-advance-rent' : `${r.code}-no-last-month-rent`, statute: r.advanceRent.cite, severity: 'block',
      message: qc
        ? { zh: '魁北克只能预收第一个月租金，不能预收最后一个月租金。', en: 'In Quebec only the first month’s rent may be collected in advance, not the last month’s.' }
        : { zh: `${name.zh}不允许预收最后一个月租金。`, en: `${name.en} does not allow prepaid last month’s rent.` },
    })
  }
  const fee = r.applicationFee
  const feeMentioned = (input.application_fee != null && Number(input.application_fee) > 0) || APP_FEE_RE.test(text)
  if (fee && feeMentioned) {
    if (fee.allowed === false && fee.inferred) {
      f.push({
        rule: `${r.code}-no-application-fee`, statute: fee.cite, severity: 'warn',
        message: {
          zh: `提到申请费 / 筛查费 / 手续费。${name.zh}法律禁止以订约为条件向准租客收取押金以外的任何款项，看来包括此类费用。`,
          en: `An application / screening / processing fee is mentioned. ${name.en}’s law bars requiring any amount other than the deposits from a prospective tenant as a condition of the tenancy, which appears to cover such a fee.`,
        },
      })
    } else if (fee.allowed === false) {
      f.push({
        rule: `${r.code}-no-application-fee`, statute: fee.cite, severity: 'block',
        message: { zh: `提到申请费 / 筛查费 / 手续费。${name.zh}禁止向申请人收取此类费用。`, en: `An application / screening / processing fee is mentioned. ${name.en} prohibits charging applicants such a fee.` },
      })
    } else if (qc) {
      f.push({
        rule: 'QC-application-fee', statute: fee.cite, severity: 'warn',
        message: {
          zh: '提到申请费。魁北克没有任何官方来源允许收取一般申请费；信用查询费只能是合理费用，并须申请人同意。',
          en: 'An application fee is mentioned. No official Quebec source authorizes a general application fee; a credit-check fee may only be a reasonable fee, charged with the applicant’s consent.',
        },
      })
    }
  }
  return { passed: !f.some((x) => x.severity === 'block'), findings: f }
}

/** Whether a landlord there may ban pets: true / false, null when Ontario or not verified. */
export function petBanAllowed(code: ProvinceInput): boolean | null {
  const r = rulesFor(code)
  return r?.petBanAllowed ? r.petBanAllowed.value : null
}

/** The human-rights law, body and link for a province; null for Ontario. */
export function humanRights(code: ProvinceInput, lang: Lang): { law: string; body: string; url: string; examples: string } | null {
  const r = rulesFor(code)
  if (!r) return null
  const h = r.humanRights
  return { law: pick(h.law, lang), body: pick(h.body, lang), url: h.url, examples: pick(h.examples, lang) }
}

/** What an applicant authorizes on the application form, worded for the province (no Ontario
 *  sources). `credit`: 'if_checked' (default) says "(if checked)", true / false states it outright.
 *  Null for Ontario. */
export function applyConsentText(code: ProvinceInput, lang: Lang, opts: { credit?: boolean | 'if_checked'; retentionDays?: number } = {}): string | null {
  const r = rulesFor(code)
  if (!r) return null
  const credit = opts.credit ?? 'if_checked'
  const law = pick(r.humanRights.law, lang)
  const days = opts.retentionDays && opts.retentionDays > 0 ? Math.round(opts.retentionDays) : null
  const qc = r.code === 'QC'
  if (lang === 'zh') {
    const c = credit === 'if_checked' ? '，以及（如勾选）在你同意的前提下获取你的信用报告' : credit ? '，以及在你同意的前提下获取你的信用报告' : ''
    return [
      `提交即代表你授权房东和 Stayloop 核实你提供的信息、联系你之前的房东、查询公开记录${c}。`,
      days ? `数据保留 ${days} 天后销毁。` : '',
      `筛查遵守${law}。`,
      qc ? '依据魁北克信息查阅委员会（CAI）的指引：房东可以查看你的身份证件，但不能复印、拍照或记录证件信息；不需要也不能要求你提供社会保险号、驾照或驾照号、健康卡号；信用查询只需要姓名、地址和出生日期；你拒绝提供证件号码时，房东不能因此拒绝你的申请。职业、薪资、雇主和银行资料也不是必需的，你可以自愿提供。' : '',
      // P-39.1 s. 8: tell the applicant the purpose, their rights and that the information may be communicated outside Québec.
      qc ? '这些信息用于评估你的租房申请；你有权查阅房东持有的你的个人信息（privacy@stayloop.ai）；信息可能在魁北克以外处理，详见隐私政策（《私营部门个人信息保护法》第 8、27 条）。' : '',
    ].join('')
  }
  const c = credit === 'if_checked' ? ', and (if checked) obtain your credit report with your consent' : credit ? ', and obtain your credit report with your consent' : ''
  return [
    `By submitting, you authorize the landlord and Stayloop to verify the information you provide, contact your previous landlords and search public records${c}.`,
    days ? ` Data is deleted after ${days} days.` : '',
    ` Screening follows ${law}.`,
    qc ? ' Under guidance from the Commission d’accès à l’information (CAI), the landlord may look at your ID but may not copy, photograph or record its details; your social insurance number, driver’s licence or its number, and health-card number are not needed and may not be required; a credit check needs only your name, address and date of birth; and the landlord may not refuse your application because you decline to give ID numbers. Your job, salary, employer and bank details are not required either; you may provide them voluntarily.' : '',
    qc ? ' This information is used to assess your rental application; you may access the personal information the landlord holds about you (privacy@stayloop.ai); it may be processed outside Québec — see the privacy policy (Act respecting the protection of personal information in the private sector, ss. 8, 27).' : '',
  ].join('')
}

/** The paragraph every adverse-decision notice carries. Ontario → lib/ontario/rules
 *  decisionNoticeFooter (unchanged); elsewhere: landlord decided, AI only organised, no ground
 *  protected by that province's human-rights law, the privacy-law access right, and the
 *  province's verified adverse-decision right when one exists. */
export function decisionNoticeFooterFor(code: ProvinceInput, lang: Lang): string {
  const r = rulesFor(code)
  if (!r) return decisionNoticeFooter(lang)
  const h = r.humanRights
  if (lang === 'zh') {
    return [
      `本决定由房东本人作出，AI 只做资料整理；没有考虑${h.law.zh}保护的任何特征，例如${h.examples.zh}。`,
      r.privacyLaw.access.zh,
      '如需查阅或更正资料：privacy@stayloop.ai。',
      r.adverseDecision ? r.adverseDecision.zh : '',
    ].join('')
  }
  return [
    `The decision was made by the landlord personally; AI only organised the material. No ground protected by ${h.law.en} was considered — for example ${h.examples.en}.`,
    ` ${r.privacyLaw.access.en}`,
    ' To access or correct your information: privacy@stayloop.ai.',
    r.adverseDecision ? ` ${r.adverseDecision.en}` : '',
  ].join('')
}

/** The lease-form rule for the province; null for Ontario. */
export function leaseFormGuidance(code: ProvinceInput, lang: Lang): { mandatory: boolean; name: string; url: string; copyDays: number | null; lines: string[] } | null {
  const r = rulesFor(code)
  if (!r) return null
  const l = r.leaseForm
  return { mandatory: l.mandatory, name: pick(l.name, lang), url: l.url, copyDays: l.copyDays, lines: l.lines.map((x) => pick(x, lang)) }
}

/** A compact Chinese fact pack for the model — only verified facts, each with its citation.
 *  Null for Ontario (the agent keeps its Ontario fact packs). */
export function aiFactsBlock(code: ProvinceInput): string | null {
  const r = rulesFor(code)
  if (!r) return null
  const name = provinceName(r.code, 'zh')
  const line = (label: string, t: { zh: string; cite?: string } | null | undefined) =>
    t ? `- ${label}：${t.zh}${t.cite ? `〔${t.cite}〕` : ''}` : ''
  const lines = [
    `【${name}租房规则 · 只可引用以下内容；这里没有列出的话题，不要回答具体规则，请用户向${r.tribunal.zh}或专业人士核实。不要套用其他省份的法律、机构或表格名称。】`,
    `- 适用法律：${r.statute.zh}〔${r.statute.cite}〕`,
    `- 纠纷机构：${r.tribunal.zh}〔${r.tribunal.cite}〕`,
    `- 租约格式：${r.leaseForm.name.zh}；${r.leaseForm.lines.map((x) => x.zh).join('')}〔${r.leaseForm.cite}〕`,
    line('押金', r.deposit),
    r.deposit.allowed ? `- 押金用途：${r.deposit.covers.zh}${r.deposit.interest ? `利息：${r.deposit.interest.zh}` : ''}` : '',
    r.depositFootnote ? `- 押金利息与退还：${r.depositFootnote.zh}` : '',
    line('宠物押金', r.petDeposit),
    line('钥匙及其他押金', r.keyOrOtherDeposits),
    line('预付租金', r.advanceRent),
    line('申请费', r.applicationFee),
    line('禁养宠物', r.petBanAllowed),
    line('涨租', r.rentIncrease),
    line('租约到期', r.leaseEnd),
    `- 人权：${r.humanRights.law.zh}，主管机构为${r.humanRights.body.zh}；受保护特征包括${r.humanRights.examples.zh}等〔${r.humanRights.cite}〕`,
    `- 个人信息：适用${r.privacyLaw.zh}。${r.privacyLaw.access.zh}〔${r.privacyLaw.cite}〕`,
    line('拒租后的告知义务', r.adverseDecision),
    r.quebec ? line('新租客最低租金通知', r.quebec.lowestRentNotice) : '',
    r.quebec ? line('怀孕与子女', r.quebec.childrenPregnancy) : '',
    r.quebec ? line('租约语言', r.quebec.leaseLanguage) : '',
    r.quebec ? line('申请材料的限制', r.quebec.screeningLimits) : '',
    r.quebec ? line('2026 年定租比例', r.quebec.rent2026) : '',
  ]
  return lines.filter(Boolean).join('\n')
}
