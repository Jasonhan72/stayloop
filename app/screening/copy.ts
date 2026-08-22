// Bilingual copy for the screening landing — the single source for BOTH the
// visible page (LandingBody, client, follows the language toggle) and the
// JSON-LD in the server page (zh, matching the zh default of the SSR output).
// One module so the structured data can never drift from what renders.
//
// The page shipped as a server component with hardcoded zh — and i18n
// auto-selects EN for any non-Chinese browser, so every English visitor from
// Google got an English header over a fully Chinese body. Copy discipline
// unchanged: the EN says exactly what the zh says, nothing invented.

export const SOURCES = [
  {
    zh: 'LTB 判令目录(安省开放数据)',
    en: 'LTB Order Catalogue — Ontario Open Data',
    descZh: '按姓名建库检索房东与租客委员会已公开的终局判令;姓名命中须经地址佐证才计入,目录不含判决结果,报告只说「已出判令」并附原件链接。',
    descEn: 'Final Landlord and Tenant Board orders, name-indexed by us. A name hit only counts once an address corroborates it; the catalogue carries no outcomes, so the report says "an order was issued" and links the original.',
  },
  {
    zh: '安省法院公开门户',
    en: 'Ontario Courts public portal',
    descZh: '民事与小额法庭的真实当事人检索,区分申请人是被告还是原告——只有被告/债务人记录才影响评分。',
    descEn: 'Real party search across Civil and Small Claims filings, distinguishing defendant from plaintiff — only defendant/debtor records can affect the score.',
  },
  {
    zh: '确定性文件取证引擎',
    en: 'Deterministic document forensics',
    descZh: 'PDF 元数据与生成工具指纹、内部结构分析、CRA 法定扣缴复算、工资单数学一致性、跨文档交叉核对——服务端确定性计算,不是 AI 猜测。',
    descEn: 'PDF metadata and generator-tool fingerprints, internal structure analysis, CRA statutory-deduction recomputation, pay-stub math, cross-document checks — computed deterministically server-side, not guessed by AI.',
  },
  {
    zh: '信用报告转录与核验',
    en: 'Credit report transcription & checks',
    descZh: '转录申请人自行上传的信用报告(逐条账户、额度、催收),复核真伪特征与报告时效。Stayloop 不直连征信局。',
    descEn: "Transcribes the applicant's own uploaded credit report (every tradeline, limit, collection) and checks authenticity markers and report freshness. Stayloop does not pull from the bureaus.",
  },
  {
    zh: '雇主独立性核验',
    en: "Employer arm's-length checks",
    descZh: '联邦公司注册库 + 官方 CBR/MRAS 联查:雇主是否真实存在、雇佣信签署人是否与申请人是关联方(家族公司自开收入证明是最常见的造假形态)。',
    descEn: "Federal corporate registry plus the official CBR/MRAS federated search: does the employer exist, and is the letter's signatory related to the applicant — a family company vouching for its own relative is the most common income fraud.",
  },
]

export const PRINCIPLES = [
  {
    zh: '每个结论注明依据',
    en: 'Every conclusion cites its evidence',
    descZh: '评分由公开规则对测得事实计算——报告逐条列出触发的规则与所读数值,同样的材料永远得到同样的分数。',
    descEn: 'Scores come from published rules applied to measured facts — the report lists every rule that fired and the value it read. Same documents, same score, every time.',
  },
  {
    zh: '查过和没查过,分开说',
    en: 'Searched and not-searched are different things',
    descZh: '「✓ 已检索」只代表真的按姓名执行了检索;不可用、超时、未检索的数据源单独标注,绝不冒充「无记录」。',
    descEn: 'A "✓ searched" check means a name search actually ran. Unavailable, timed-out or unsearched sources are labelled as such — never passed off as "no records".',
  },
  {
    zh: '同名≠同一个人',
    en: 'A namesake is not the applicant',
    descZh: '法庭与 LTB 的姓名命中在地址佐证之前一律视为可能同名,不进评分;网页索引命中标注为「提及」,永不参与打分。',
    descEn: 'Court and LTB name hits are treated as possible namesakes until an address corroborates them, and never scored before that; web-index hits are labelled "mentions" and never scored at all.',
  },
  {
    zh: 'OHRC 红线内建',
    en: 'OHRC red lines built in',
    descZh: '种族、宗教、残障、家庭状况、是否领取补助等受保护特征不进入检索、不进入评分——合规审计随报告输出。',
    descEn: 'Protected grounds — race, religion, disability, family status, receipt of assistance — never enter the search or the score. A compliance audit ships with every report.',
  },
]

export const STEPS = [
  {
    zh: '上传申请材料',
    en: 'Upload the application documents',
    descZh: '租约申请表、工资单、雇主信、银行流水、租客自行下载的信用报告——支持 PDF 与照片。',
    descEn: "Rental application, pay stubs, employment letter, bank statements, the applicant's own credit report download — PDFs and photos both work.",
  },
  {
    zh: 'AI 抽取事实,规则计算评分',
    en: 'AI extracts facts; rules compute the score',
    descZh: 'AI 只负责读出材料里的事实;分数由公开的确定性规则计算——同样的材料永远得到同样的分数。同时执行文件取证与法庭/LTB 检索。',
    descEn: 'The AI only reads facts out of the documents; a published deterministic rubric turns them into the score. Document forensics and court/LTB searches run in the same pipeline.',
  },
  {
    zh: '拿到可追溯的报告',
    en: 'Get a report you can interrogate',
    descZh: '四维评分、触发的每条规则与所读数值、逐数据源检索状态、取证发现、待办核验清单。可打印、可存档。',
    descEn: 'Four-dimension score, every rule fired with the value it read, per-source search status, forensic findings, a verification checklist. Printable and archivable.',
  },
]

export const FAQS = [
  {
    zh: { q: '租客筛查会查哪些内容?', a: '五类:①上传文件的确定性取证(PDF 元数据、生成工具指纹、工资单数学、跨文档一致性);②租客自行提供的信用报告转录与核验;③安省 LTB 判令目录(开放数据)按姓名检索;④安省法院公开门户的当事人检索;⑤雇主真实性与独立性核验(公司注册库)。每个数据源在报告里带自己的检索状态。' },
    en: { q: 'What does a tenant screening actually check?', a: "Five things: deterministic forensics on the uploaded files (PDF metadata, generator fingerprints, pay-stub math, cross-document consistency); transcription and checks of the applicant's own credit report; a name search of Ontario's LTB Order Catalogue open data; a party search of the Ontario Courts public portal; and employer existence and arm's-length checks against corporate registries. Every source carries its own search status in the report." },
  },
  {
    zh: { q: '这在安省合法吗?', a: '合法。安省《人权法典》下的 O. Reg. 290/98 明确允许房东在选择租客时使用信用参考、租史、信用检查与收入信息,并要求整体考量、不得歧视性使用。Stayloop 把 OHRC 受保护特征(种族、宗教、残障、家庭状况等)排除在检索与评分之外,合规审计随每份报告输出。' },
    en: { q: 'Is this legal in Ontario?', a: 'Yes. O. Reg. 290/98 under the Human Rights Code expressly permits landlords to use credit references, rental history, credit checks and income information when selecting tenants, considered together and never in a discriminatory way. Stayloop excludes OHRC protected grounds (race, religion, disability, family status and more) from both search and scoring, and a compliance audit ships with every report.' },
  },
  {
    zh: { q: '会查刑事记录吗?', a: '不会。筛查只使用申请人自愿提交的文件与公开的民事记录(LTB 判令、法院门户)。Stayloop 不进行警方记录核查,也不是《消费者报告法》(安省)意义上的消费者报告机构。' },
    en: { q: 'Does it check criminal records?', a: 'No. Screening uses only documents the applicant voluntarily submits and public civil records (LTB orders, court portal). Stayloop performs no police record checks and is not a consumer reporting agency within the meaning of the Consumer Reporting Act (Ontario).' },
  },
  {
    zh: { q: '租客需要做什么?', a: '提交申请材料即可——通常是申请表、收入证明和自行从 Equifax/TransUnion 下载的信用报告。Stayloop 不直连征信局,信用信息只来自租客自己提供的报告。' },
    en: { q: 'What does the tenant have to do?', a: 'Just submit the application documents — typically the application form, proof of income, and a credit report they download themselves from Equifax or TransUnion. Stayloop never pulls from the bureaus; credit information comes only from the report the tenant provides.' },
  },
  {
    zh: { q: '多快能拿到报告?', a: '通常几分钟。上传材料后,抽取、取证、法庭与 LTB 检索、评分是流水线并行执行的,页面上能看到每一步的进度。' },
    en: { q: 'How fast is the report?', a: 'Usually minutes. After upload, extraction, forensics, court and LTB searches, and scoring run as a parallel pipeline, with each step visible on screen as it completes.' },
  },
  {
    zh: { q: '怎么收费?', a: '注册免费账号即可使用,免费档每月可筛查 5 单,历史记录云端保留。深度核验(雇主注册库联查等)属于 Pro 功能,定价见定价页。' },
    en: { q: 'What does it cost?', a: 'Create a free account to get started — the free tier includes 5 screenings per month, with your history saved. Deep verification (employer registry cross-checks and more) is a Pro feature — see the pricing page.' },
  },
  {
    zh: { q: 'LTB(房东与租客委员会)记录是怎么查的?', a: '使用安省 2026 年发布的 LTB 判令目录开放数据,按姓名建库检索。姓名命中必须经申请人自报地址佐证才影响评分——同名不等于同一个人;目录不含判决结果,报告只说明「已出判令」并附判令原件链接。' },
    en: { q: 'How are LTB (Landlord and Tenant Board) records searched?', a: "Through Ontario's LTB Order Catalogue open data (published 2026), which we index for name search. A name hit only affects the score once it is corroborated by an address the applicant themselves declared — a namesake is not the applicant. The catalogue carries no outcomes, so the report states only that an order was issued and links the original PDF." },
  },
  {
    zh: { q: '报告可以给别人看吗?', a: '报告供房东在申请人知情同意下、为订立租约之目的使用,不得向无正当目的的第三方分发。报告内置打印版式,便于存档。' },
    en: { q: 'Can the report be shared?', a: "The report is for the landlord's use, with the applicant's knowledge and consent, for the purpose of entering a tenancy — not for distribution to third parties without a valid purpose. A print layout is built in for archiving." },
  },
]
