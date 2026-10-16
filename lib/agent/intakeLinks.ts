// Agent intake links · pure rules (V1.0 阶段 2 · 丙 #13, 2026-10-16).
//
// An agent hands an applicant a link for a landlord client's unit — no
// listing needed. On /intake/<token> the applicant uploads their documents
// and signs an authorisation scoped to what O. Reg. 290/98 lets a landlord
// ask for (credit references, rental history, income information); the
// submission becomes a screening under the AGENT's authId, and the landlord
// client sees it too while a confirmed delegation that allows screening is
// live. No 'use client': the public route and the page both import this.
//
// Consent is versioned like lib/verify/consent.ts: the accepted version is
// stored on the submission, so a later wording change never rewrites what
// someone actually agreed to.

export const INTAKE_LINK_DAYS = 14
export const INTAKE_TOKEN_RE = /^[a-f0-9]{64}$/
export const INTAKE_MAX_FILES = 20
/** Same cap as the tenant-files bucket (lib/screening/prepareUpload.ts MAX_UPLOAD_BYTES). */
export const INTAKE_MAX_FILE_BYTES = 25 * 1024 * 1024
export const INTAKE_PATH_ROOT = 'agent-intake'

export const AGENT_INTAKE_CONSENT_VERSION = 'agent-intake-v1-2026-10'

export type IntakeFileKind = 'id' | 'paystub' | 'bank_statement' | 'employment_letter' | 'credit_report' | 'reference' | 'other'
export const INTAKE_FILE_KINDS: { kind: IntakeFileKind; label: { zh: string; en: string }; hint: { zh: string; en: string } }[] = [
  { kind: 'id', label: { zh: '政府证件', en: 'Government ID' }, hint: { zh: '驾照、护照或 PR 卡', en: 'Driver’s licence, passport or PR card' } },
  { kind: 'paystub', label: { zh: '近期工资单', en: 'Recent pay stubs' }, hint: { zh: '过去 2–3 个月（PDF 或图片）', en: 'Last 2–3 months (PDF or image)' } },
  { kind: 'bank_statement', label: { zh: '银行对账单', en: 'Bank statement' }, hint: { zh: '最新一份，能看到工资到账', en: 'Most recent, showing payroll deposits' } },
  { kind: 'employment_letter', label: { zh: '在职证明信', en: 'Employment letter' }, hint: { zh: '可选 · 来自雇主', en: 'Optional · from your employer' } },
  { kind: 'credit_report', label: { zh: '信用报告', en: 'Credit report' }, hint: { zh: '可选 · 你自己从 Equifax / TransUnion 下载的', en: 'Optional · one you pulled yourself from Equifax / TransUnion' } },
  { kind: 'reference', label: { zh: '租史 / 推荐', en: 'Rental history / references' }, hint: { zh: '可选 · 前房东联系方式或推荐信', en: 'Optional · previous landlord contact or a reference letter' } },
  { kind: 'other', label: { zh: '其他', en: 'Other' }, hint: { zh: '可选', en: 'Optional' } },
]
const KIND_SET = new Set<string>(INTAKE_FILE_KINDS.map((k) => k.kind))

export type IntakeLinkState = 'active' | 'revoked' | 'expired'
export type IntakeLinkLike = { expires_at: string; revoked_at: string | null }

export function intakeLinkState(l: IntakeLinkLike, now = new Date()): IntakeLinkState {
  if (l.revoked_at) return 'revoked'
  const t = Date.parse(l.expires_at)
  if (!Number.isFinite(t) || t <= now.getTime()) return 'expired'
  return 'active'
}

export function intakeLinkExpiry(now = new Date(), days = INTAKE_LINK_DAYS): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString()
}

/** 32 random bytes as 64 lowercase hex characters (edge + browser: WebCrypto). */
export function makeIntakeToken(rng: (buf: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const buf = rng(new Uint8Array(32))
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function intakeLinkUrl(site: string, token: string): string {
  return `${site.replace(/\/$/, '')}/intake/${token}`
}

export function intakeFilePath(linkId: string, kind: IntakeFileKind, fileName: string, n = 0, now = Date.now()): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file'
  return `${INTAKE_PATH_ROOT}/${linkId}/${kind}/${now}_${n}_${safe}`
}

/** Where the agent runs the screening that a submission produced — the same
 *  path /api/screening/from-application sends landlords to, with the agent
 *  navigation flag the screening page reads. */
export function intakeScreeningHref(screeningId: string): string {
  return `/screening/app?as=agent&screening=${screeningId}&run=1`
}

export type IntakeManifestFile = { path: string; name: string; size: number; mime: string; kind: IntakeFileKind }
export type IntakeSubmissionInput = {
  applicant_name?: unknown
  applicant_email?: unknown
  move_in_date?: unknown
  consent_version?: unknown
  consent_name?: unknown
  files?: unknown
}
export type IntakeSubmission = { applicant_name: string; applicant_email: string; move_in_date: string | null; consent_version: string; consent_name: string; files: IntakeManifestFile[] }
export type IntakeValidation = { ok: true; value: IntakeSubmission } | { ok: false; reason: 'applicant_name' | 'applicant_email' | 'move_in_date' | 'consent_version' | 'consent_name' | 'files' }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '')

/** Every path must sit under this link's own folder with a known kind; paths are de-duplicated. */
export function validateIntakeSubmission(input: IntakeSubmissionInput, linkId: string): IntakeValidation {
  const applicant_name = str(input.applicant_name, 120)
  if (!applicant_name) return { ok: false, reason: 'applicant_name' }
  const applicant_email = str(input.applicant_email, 200).toLowerCase()
  if (!EMAIL_RE.test(applicant_email)) return { ok: false, reason: 'applicant_email' }
  const mi = str(input.move_in_date, 10)
  if (mi && !(/^\d{4}-\d{2}-\d{2}$/.test(mi) && Number.isFinite(Date.parse(mi)))) return { ok: false, reason: 'move_in_date' }
  if (str(input.consent_version, 40) !== AGENT_INTAKE_CONSENT_VERSION) return { ok: false, reason: 'consent_version' }
  const consent_name = str(input.consent_name, 120)
  if (consent_name.length < 2) return { ok: false, reason: 'consent_name' }
  if (!UUID_RE.test(linkId) || !Array.isArray(input.files) || input.files.length === 0 || input.files.length > INTAKE_MAX_FILES) return { ok: false, reason: 'files' }
  const prefix = `${INTAKE_PATH_ROOT}/${linkId.toLowerCase()}/`
  const files: IntakeManifestFile[] = []
  const seen = new Set<string>()
  for (const raw of input.files as unknown[]) {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'files' }
    const f = raw as Record<string, unknown>
    const path = str(f.path, 400)
    const kind = str(f.kind, 32)
    if (!path.startsWith(prefix) || !KIND_SET.has(kind)) return { ok: false, reason: 'files' }
    const rest = path.slice(prefix.length).split('/')
    if (rest.length !== 2 || rest[0] !== kind || !rest[1] || rest[1] === '.' || rest[1] === '..' || /[\\?#%]/.test(rest[1]) || rest[1].length > 160) return { ok: false, reason: 'files' }
    const size = typeof f.size === 'number' && Number.isFinite(f.size) ? Math.max(0, Math.floor(f.size)) : 0
    if (size > INTAKE_MAX_FILE_BYTES) return { ok: false, reason: 'files' }
    if (seen.has(path)) continue
    seen.add(path)
    files.push({ path, name: str(f.name, 160) || rest[1], size, mime: str(f.mime, 80) || 'application/octet-stream', kind: kind as IntakeFileKind })
  }
  if (!files.length) return { ok: false, reason: 'files' }
  return { ok: true, value: { applicant_name, applicant_email, move_in_date: mi || null, consent_version: AGENT_INTAKE_CONSENT_VERSION, consent_name, files } }
}

/** The screening's notes block (same role as the one /api/screening/from-application writes). */
export function intakeScreeningNotes(a: { linkId: string; clientId: string | null; label: string | null; submission: IntakeSubmission; lookupsAllowed: boolean }): string {
  const s = a.submission
  return [
    `[from agent intake link ${a.linkId}${a.clientId ? ` client ${a.clientId}` : ''}]`,
    a.label ? `Unit / label: ${a.label}` : null,
    `Applicant email: ${s.applicant_email}`,
    s.move_in_date ? `Requested move-in: ${s.move_in_date}` : null,
    `Applicant signed the online authorisation ${s.consent_version} (credit references, rental history, income information — O. Reg. 290/98 scope) as "${s.consent_name}".`,
    a.lookupsAllowed ? null : 'CRA_MODE=tool: no public-record lookups about the applicant were authorised or run; the applicant may provide their own.',
    `${s.files.length} document(s) uploaded by the applicant: ${s.files.map((f) => `${f.name} (${f.kind})`).join(', ')}`,
  ].filter(Boolean).join('\n')
}

/** What the applicant agrees to on /intake/<token>. `lookups` = whether Stayloop would
 *  search public records about them on the landlord's behalf (false under CRA_MODE=tool). */
export function agentIntakeConsentText(lang: 'zh' | 'en', lookups: boolean) {
  if (lang === 'zh') {
    return {
      title: '在上传之前，请确认以下内容',
      intro: '这个链接由下方列出的持牌经纪发出，材料只用于这位经纪所代表的房东评估你的租赁申请。每一项都是自愿的；没有提供的材料只会显示为「未提供」。',
      items: [
        { h: '会核对什么', p: '只在《安大略省人权法典》与 O. Reg. 290/98 允许的范围内：信用参考（你自己提供的信用报告或经你本人授权取得的摘要）、租史（前房东与推荐人）、收入信息（工资单、在职信、对账单）。' },
        { h: '不会问什么', p: '不会询问或推断任何受保护特征：种族、祖籍、民族、公民身份、信仰、性别、性取向、年龄、婚姻与家庭状况、残障、领取社会救助等。这些不进入评估。' },
        { h: '公开记录', p: lookups
          ? '经你授权，Stayloop 会按姓名检索安省法院门户与房东租客委员会（LTB）公开判令目录，命中只作为「有记录」提示并附原文链接，不下结论。'
          : '在完成《消费者报告法》注册之前，Stayloop 不替房东或经纪检索关于你本人的公开记录（法院、LTB）。你可以自查后一并提供。' },
        { h: '谁能看到', p: '发出链接的经纪、经纪所代表且已在 Stayloop 确认委托的房东，以及 Stayloop 用于生成筛查报告的系统。AI 模型服务商只在生成报告时处理文件，不用于训练。' },
        { h: '保留与你的权利', p: '材料与报告随这次筛查记录保存；申请结束后可要求删除。按《消费者报告法》s.10(7)，你有权在收到不利决定后 60 天内索取评估所依据的信息性质与来源；查阅、更正、删除请写信 privacy@stayloop.ai 并注明本页链接。' },
        { h: '撤回', p: '在点「提交」之前关闭页面即视为未授权；已提交的材料可通过上述邮箱要求撤回并删除。' },
      ],
      ack: '我已阅读并同意以上内容，确认材料真实、由我本人提交。',
      typedNameLabel: '请输入你的全名作为签名',
      button: '提交材料',
    }
  }
  return {
    title: 'Before you upload, please confirm the following',
    intro: 'This link was issued by the licensed agent shown below; your documents are used only so the landlord that agent represents can assess your rental application. Every item is voluntary; anything you do not provide simply shows as "not provided".',
    items: [
      { h: 'What is checked', p: 'Only within what the Ontario Human Rights Code and O. Reg. 290/98 allow: credit references (a credit report you provide, or a summary obtained with your own authorisation), rental history (previous landlords and references) and income information (pay stubs, employment letter, bank statements).' },
      { h: 'What is never asked', p: 'No protected characteristic is asked about or inferred: race, ancestry, ethnic origin, citizenship, creed, sex, sexual orientation, age, marital or family status, disability, receipt of public assistance. None of it enters the assessment.' },
      { h: 'Public records', p: lookups
        ? 'With your authorisation Stayloop searches the Ontario court portal and the Landlord and Tenant Board (LTB) public order catalogue by name; a hit is shown as "record found" with a link to the original and no conclusion is drawn.'
        : 'Until its Consumer Reporting Act registration is complete, Stayloop does not search public records about you (courts, LTB) on behalf of the landlord or agent. You may run those checks yourself and include the result.' },
      { h: 'Who can see it', p: 'The agent who issued the link, the landlord that agent represents once they have confirmed the delegation on Stayloop, and the Stayloop systems that generate the screening report. AI model providers process the files only to produce the report and do not train on them.' },
      { h: 'Retention and your rights', p: 'Documents and the report are kept with this screening record; after the application concludes you may ask for deletion. Under the Consumer Reporting Act s.10(7) you may, within 60 days of an adverse decision, request the nature and sources of the information it was based on; for access, correction or deletion write to privacy@stayloop.ai quoting this page’s link.' },
      { h: 'Withdrawing', p: 'Closing this page before pressing "Submit" counts as not authorising. Submitted material can be withdrawn and deleted by writing to the address above.' },
    ],
    ack: 'I have read and agree to the above, and confirm the documents are genuine and submitted by me.',
    typedNameLabel: 'Type your full name as your signature',
    button: 'Submit documents',
  }
}
