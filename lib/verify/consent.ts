// Consent text shown on /verify/<token> before any provider is launched.
// Versioned: the accepted version is stored on the request and on the
// screening snapshot, so a later wording change never rewrites what someone
// actually agreed to. Written for PIPEDA's "meaningful consent" bar: purpose,
// what, who sees it, how long, how to withdraw — in plain words.
export const CONSENT_VERSION = 'v1-2026-09'

export const CONSENT_TEXT = {
  zh: {
    title: '在开始之前，请确认以下内容',
    intro: '这个页面由你正在申请的房东通过 Stayloop 发出。你将要授权的每一项都是自愿的，可以只做其中一部分；未完成的项目只会显示为「未核验」，不会被当作负面结果。',
    items: [
      { h: '目的', p: '仅用于评估你对该处房屋的租赁申请。不会用于营销，不会出售给任何第三方。' },
      { h: '收集什么', p: '身份：证件类型、证件国家、姓名、出生日期、活体检测结果（证件号只保留末四位）。银行：你选择授权的账户的持有人姓名、近 90 天交易与余额，用于识别稳定收入；我们不保存你的网银登录凭证。征信：仅在你本人授权后拉取一份你自己的信用报告摘要。' },
      { h: '谁能看到', p: '发出邀请的房东（及其在 Stayloop 上的授权协作者）以及 Stayloop 用于生成筛查报告的系统。核验由持牌供应商（Veriff、Flinks）执行，它们各自的隐私政策适用于处理过程。' },
      { h: '保留多久', p: '与该次筛查记录一同保存；申请结束后你可以要求删除。要求删除请写信至 privacy@stayloop.ai 并注明本页面链接。' },
      { h: '撤回', p: '在完成前的任何时候关闭页面即视为未授权。已完成的项目可通过上述邮箱要求撤回并删除。' },
    ],
    ack: '我已阅读并同意以上内容，并确认我是本人操作。',
    typedNameLabel: '请输入你的全名作为签名',
    button: '同意并继续',
  },
  en: {
    title: 'Before you start, please confirm the following',
    intro: 'This page was sent by the landlord you are applying to, through Stayloop. Each authorisation below is voluntary and you may complete only some of them; anything left undone simply shows as "not verified" and is never treated as a negative result.',
    items: [
      { h: 'Purpose', p: 'Used only to assess your rental application for this property. Never for marketing, never sold to any third party.' },
      { h: 'What is collected', p: 'Identity: document type, issuing country, name, date of birth and the liveness result (only the last four characters of the document number are kept). Bank: for the accounts you choose to share, the holder name, the last 90 days of transactions and balances, used to identify stable income; we never store your online-banking credentials. Credit: only after your own authorisation, a summary of your own credit report.' },
      { h: 'Who can see it', p: 'The landlord who sent this invitation (and collaborators they have authorised on Stayloop), plus the Stayloop systems that generate the screening report. Verification is performed by licensed providers (Veriff, Flinks), whose own privacy policies apply to the processing.' },
      { h: 'How long it is kept', p: 'Alongside this screening record; after the application concludes you may ask for deletion by writing to privacy@stayloop.ai and quoting this page’s link.' },
      { h: 'Withdrawing', p: 'Closing this page before finishing counts as not authorising. Completed items can be withdrawn and deleted by writing to the address above.' },
    ],
    ack: 'I have read and agree to the above, and confirm I am completing this myself.',
    typedNameLabel: 'Type your full name as your signature',
    button: 'Agree and continue',
  },
} as const
