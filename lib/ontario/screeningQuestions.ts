// 「我能问申请人这个吗」— the public tool's content (2026-10-25, report review
// batch 1; design/ai-rebuild-report-review-2026-10-25.md). A fixed table, no
// model. What a landlord may ask for comes from O. Reg. 290/98 under Human
// Rights Code s.21(3): rental history, credit references, credit checks (with
// consent), income information only together with those, and a guarantor.
// What may never ground a decision comes from Code s.2(1) (the protected
// grounds) and the OHRC Policy on human rights and rental housing (no ratio
// cut-offs; no history is not bad history). Two RTA items ride along because
// landlords ask them at the same moment: pets (s.14) and fees (s.134).
export type Bi = { zh: string; en: string }
export type AskStatus = 'ok' | 'ok_limited' | 'no' | 'avoid'
export type AskGroup = 'money' | 'person' | 'tenancy'
export type AskItem = { key: string; group: AskGroup; q: Bi; status: AskStatus; why: Bi; cite: string; rule?: string }

export const ASK_STATUS_LABEL: Record<AskStatus, Bi> = {
  ok: { zh: '可以问', en: 'You may ask' },
  ok_limited: { zh: '可以问，有限制', en: 'You may ask, with limits' },
  no: { zh: '不能问，也不能作为理由', en: 'Do not ask; never a reason' },
  avoid: { zh: '不需要，别收', en: 'Not needed; do not collect' },
}

export const ASK_GROUPS: { key: AskGroup; label: Bi }[] = [
  { key: 'money', label: { zh: '钱与信用', en: 'Money and credit' } },
  { key: 'person', label: { zh: '申请人本人', en: 'The applicant' } },
  { key: 'tenancy', label: { zh: '租住安排', en: 'The tenancy' } },
]

export const SCREENING_QUESTIONS: AskItem[] = [
  {
    key: 'income', group: 'money', status: 'ok_limited',
    q: { zh: '收入多少？要工资单、雇主证明、工作多久？', en: 'How much do you earn? Pay stubs, employer letter, how long employed?' },
    why: {
      zh: '可以索取收入信息，但只能和租赁历史、信用推荐、征信授权一起合并看；不能按「租金不能超过收入 30%」这类固定比例一刀切，也不能因为自雇、学生这类职业类型直接拒绝。',
      en: 'You may request income information, but only to consider together with rental history, credit references and a credit check; a fixed ratio cut-off such as “rent under 30% of income” is not a lawful ground, and self-employment or being a student is not a reason to decline.',
    },
    cite: 'O. Reg. 290/98 s.1(1)–(2) · OHRC Policy on human rights and rental housing', rule: 'OHRC-no-income-cutoff',
  },
  {
    key: 'credit_check', group: 'money', status: 'ok_limited',
    q: { zh: '能查征信吗？', en: 'Can I run a credit check?' },
    why: {
      zh: '可以，要申请人书面同意，查的是软查询、不影响分数。没有加拿大信用记录不等于信用差，不能因此作不利对待；拒绝时要告知对方可以在 60 天内索取用了什么信息。',
      en: 'Yes, with the applicant’s written consent; rental inquiries are soft and do not affect the score. No Canadian credit file is not a bad file and may not count against the applicant; on a decline, tell them they may ask within 60 days what information was used.',
    },
    cite: 'O. Reg. 290/98 s.1(1) · Consumer Reporting Act s.10(7)', rule: 'CRA-10-7-notice',
  },
  {
    key: 'rental_history', group: 'money', status: 'ok',
    q: { zh: '以前住哪里？前房东的推荐？', en: 'Where did you rent before? A reference from the previous landlord?' },
    why: {
      zh: '可以。第一次租房或刚到加拿大没有租住历史，不能因此拒绝。',
      en: 'Yes. A first-time renter or a newcomer with no rental history may not be declined for that.',
    },
    cite: 'O. Reg. 290/98 s.1(1) · OHRC Policy', rule: 'OHRC-no-income-cutoff',
  },
  {
    key: 'guarantor', group: 'money', status: 'ok_limited',
    q: { zh: '要不要担保人？', en: 'Can I ask for a guarantor?' },
    why: {
      zh: '可以要求，但要对所有申请人一个标准。只对新移民、学生、领社会援助的人要担保，就是按受保护特征区别对待。',
      en: 'You may, with one standard for every applicant. Requiring a guarantor only from newcomers, students or people on social assistance is differential treatment on a protected ground.',
    },
    cite: 'O. Reg. 290/98 s.1(1) · Human Rights Code s.2(1)', rule: 'OHRC-protected-grounds',
  },
  {
    key: 'sin', group: 'money', status: 'avoid',
    q: { zh: '要社会保险号（SIN）？', en: 'Social Insurance Number?' },
    why: {
      zh: '查征信不需要 SIN，身份核验也不需要。不要默认收集；收了就要按 PIPEDA 说明用途并保管。',
      en: 'A credit check does not need the SIN, nor does identity verification. Do not collect it by default; if you do, PIPEDA requires a stated purpose and safekeeping.',
    },
    cite: 'PIPEDA Schedule 1, Principle 4.4 · Consumer Reporting Act s.8',
  },
  {
    key: 'fees', group: 'money', status: 'no',
    q: { zh: '能收申请费、看房费或损坏押金吗？', en: 'Can I charge an application fee, a viewing fee or a damage deposit?' },
    why: {
      zh: '不能。向申请人或租客收取申请费、看房费、损坏押金都违法；只能收最后一个月租金押金，钥匙押金只能按实际成本。',
      en: 'No. Application fees, viewing fees and damage deposits are all unlawful; only a last month’s rent deposit may be taken, and a key deposit only at actual cost.',
    },
    cite: 'RTA s.134(1)–(2) · s.106(2) · O. Reg. 516/06 s.17', rule: 'RTA-134-no-fees',
  },
  {
    key: 'source_of_income', group: 'person', status: 'no',
    q: { zh: '收入来源是社会援助、ODSP、失业金吗？', en: 'Is your income from social assistance, ODSP or EI?' },
    why: {
      zh: '「领取公共援助」是受保护事由。可以问收入金额，不能按来源区别对待。',
      en: 'Receipt of public assistance is a protected ground. You may ask the amount of income, never treat its source differently.',
    },
    cite: 'Human Rights Code s.2(1)', rule: 'OHRC-protected-grounds',
  },
  {
    key: 'age', group: 'person', status: 'ok_limited',
    q: { zh: '年龄、出生日期？', en: 'Age or date of birth?' },
    why: {
      zh: '身份核验和征信需要出生日期，这可以收；但年龄不能进入决定。16、17 岁已脱离父母监护的申请人同样受保护。',
      en: 'Identity verification and a credit check need the date of birth, so it may be collected; age itself never enters the decision. Applicants aged 16 or 17 who have withdrawn from parental control are protected too.',
    },
    cite: 'Human Rights Code s.2(1), s.4', rule: 'OHRC-protected-grounds',
  },
  {
    key: 'family', group: 'person', status: 'no',
    q: { zh: '结婚了吗、有孩子吗、怀孕了吗？', en: 'Are you married, do you have children, are you pregnant?' },
    why: {
      zh: '婚姻状况、家庭状况、怀孕都是受保护事由，不能问，也不能因此拒绝。',
      en: 'Marital status, family status and pregnancy are protected grounds: do not ask, and never decline for them.',
    },
    cite: 'Human Rights Code s.2(1)', rule: 'OHRC-protected-grounds',
  },
  {
    key: 'occupants', group: 'tenancy', status: 'ok_limited',
    q: { zh: '几个人住？', en: 'How many people will live here?' },
    why: {
      zh: '可以问人数，按市政居住标准看房子装不装得下；不能因为有孩子、是几代同住而区别对待。',
      en: 'You may ask how many, against the municipal occupancy standard; you may not treat a family with children or several generations differently.',
    },
    cite: 'Human Rights Code s.2(1) · Toronto Municipal Code c.629', rule: 'OHRC-protected-grounds',
  },
  {
    key: 'citizenship', group: 'person', status: 'no',
    q: { zh: '哪国人、什么移民身份、是公民吗？', en: 'Nationality, immigration status, citizenship?' },
    why: {
      zh: '公民身份、原籍地、族裔是受保护事由。核验身份可以要证件，证件上的国籍不进决定；没有加拿大历史不能作为理由。',
      en: 'Citizenship, place of origin and ethnic origin are protected grounds. You may ask for identification to verify identity; the nationality on it never enters the decision, and no Canadian history is not a reason.',
    },
    cite: 'Human Rights Code s.2(1)', rule: 'OHRC-protected-grounds',
  },
  {
    key: 'religion_race_language', group: 'person', status: 'no',
    q: { zh: '宗教、种族、母语、口音？', en: 'Religion, race, first language, accent?' },
    why: {
      zh: '都是受保护事由（语言与口音通常指向原籍地或族裔）。不问，也不写进任何理由。',
      en: 'All protected grounds (language and accent usually point to place of origin or ethnicity). Do not ask, and never write them into a reason.',
    },
    cite: 'Human Rights Code s.2(1)', rule: 'OHRC-protected-grounds',
  },
  {
    key: 'disability', group: 'person', status: 'no',
    q: { zh: '有残障或健康问题吗？', en: 'Any disability or health condition?' },
    why: {
      zh: '不问。申请人自己提出的无障碍或调整需求，房东有配合义务；服务动物不算宠物。',
      en: 'Do not ask. Accommodation needs the applicant raises themselves come with a duty to accommodate; a service animal is not a pet.',
    },
    cite: 'Human Rights Code s.2(1), s.17', rule: 'OHRC-protected-grounds',
  },
  {
    key: 'orientation_gender', group: 'person', status: 'no',
    q: { zh: '性取向、性别认同？', en: 'Sexual orientation, gender identity?' },
    why: { zh: '受保护事由，与租住无关。', en: 'Protected grounds, unrelated to the tenancy.' },
    cite: 'Human Rights Code s.2(1)', rule: 'OHRC-protected-grounds',
  },
  {
    key: 'photos_social', group: 'person', status: 'avoid',
    q: { zh: '要照片、看社交账号？', en: 'A photo, or a look at social media?' },
    why: {
      zh: '照片和社交账号会把种族、年龄、家庭状况这些受保护特征带进决定。不收，也不看。',
      en: 'Photos and social media carry race, age and family status into the decision. Do not collect them, do not look.',
    },
    cite: 'Human Rights Code s.2(1) · OHRC Policy', rule: 'OHRC-protected-grounds',
  },
  {
    key: 'pets', group: 'tenancy', status: 'ok_limited',
    q: { zh: '有宠物吗？', en: 'Do you have pets?' },
    why: {
      zh: '可以问。但租约里的「禁养宠物」条款无效（condo 章程另有规定的除外），服务动物属于残障调整，不能因此拒绝。',
      en: 'You may ask. A no-pets clause in the lease is void (condo declarations are the exception), and a service animal is an accommodation, not a reason to decline.',
    },
    cite: 'RTA s.14 · Human Rights Code s.17', rule: 'RTA-14-no-pet-clause',
  },
  {
    key: 'smoking', group: 'tenancy', status: 'ok',
    q: { zh: '吸烟吗？', en: 'Do you smoke?' },
    why: { zh: '可以问，不是受保护事由；禁烟可以写进租约的附加条款。', en: 'You may ask; it is not a protected ground, and a no-smoking term may go in the lease’s additional terms.' },
    cite: 'Human Rights Code s.2(1)',
  },
  {
    key: 'dates_parking', group: 'tenancy', status: 'ok',
    q: { zh: '什么时候入住、想租多久、要车位吗？', en: 'Move-in date, how long, parking?' },
    why: { zh: '可以问，这些是租住安排本身。', en: 'You may ask; these are the terms of the tenancy itself.' },
    cite: 'RTA s.2(1) · O. Reg. 9/18',
  },
  {
    key: 'ltb_history', group: 'tenancy', status: 'ok_limited',
    q: { zh: '以前上过 LTB、被驱逐过吗？', en: 'Any past LTB cases or evictions?' },
    why: {
      zh: '可以问租赁历史。核实只能用申请人同意后的方式；公开记录里同名很多，没有地址佐证不能当成本人；租客曾经向 LTB 主张自己的权利不是拒绝理由。',
      en: 'You may ask about rental history. Verify only in ways the applicant consented to; public records are full of namesakes and a hit without an address match is not the person; a tenant having asserted their rights at the LTB is not a reason to decline.',
    },
    cite: 'O. Reg. 290/98 s.1(1) · Consumer Reporting Act s.8', rule: 'CRA-10-7-notice',
  },
]

export function askItemsFor(group: AskGroup): AskItem[] {
  return SCREENING_QUESTIONS.filter((i) => i.group === group)
}
