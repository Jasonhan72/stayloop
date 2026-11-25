// 2026-11-17 · the 「以上提到的操作尚未真正执行」 note was landing under correct answers. The rule behind it
// (guardrail 3b) matched any 「已…发出 / 提交 / 签署…」 in the reply, whoever did the thing: 「双方已经同意
// 解约或已发出搬迁通知」 (a tenant asking when a landlord may enter), 「房东目前是否已经向你提出了具体涨幅
// 或发了通知？」 (a question), 「确认必填项处于「已提交审核」状态」 (a status label), and a drafted letter
// in the tenant's own voice (「我在 10 月 2 日提交了报修」). Production: 5 hits in ~107 turns; of the test
// accounts' 60 stored replies the old rule flagged 6 — three model replies, all of them false alarms.
// Now a reply claims execution only when a clause says so in the assistant's own voice.
import { describe, expect, it } from 'vitest'
import { applyGuardrail, replyClaimsExecution } from '@/lib/agent/guardrail'

const out = (reply: string, proposedAction: unknown = null) => ({ reply, memoryWrites: [], proposedAction, nextStage: null }) as never
const flagged = (reply: string, role: 'tenant' | 'landlord' | 'agent' = 'tenant') => applyGuardrail(role, out(reply), /[一-鿿]/.test(reply) ? 'zh' : 'en').flags.includes('executed_claim_in_reply')

// The assistant saying it (or the platform) already did something outbound.
const CLAIMS = [
  // the act itself is still a claim
  '已帮你申请了这套房。', '我已经替你申请了。',
  '我已发送申请给房东。', '我给房东发送了消息', '邮件已经发给房东了', 'Done — I emailed the landlord.',
  '已经把你的申请提交给房东了', '我已帮你提交了申请', '已替你把资料分享给 Sarah', '资料已经发出去了',
  'I have already sent your application', 'Your application has been submitted', "I've submitted your application", 'I already shared your documents',
  '已帮你提交报修工单。', '申请已提交成功，等待房东回复。', '已为你预约周六的看房。', '好的，已经替你把消息发出去了。', '报修已提交。', '你的申请已提交。',
  '已给房东发了消息。', '消息已发给房东。', '已向房东提交申请。', '已邀请房东加入这份租约。', '房东那边我已经发消息了。', '我帮你已经提交了。', '已经替您付款了。',
  'The message has been sent to your landlord.', 'I just submitted it.', "Good news, I've booked the showing for Saturday.", 'I emailed your landlord, so you can relax.',
  // a claim, then a condition about something else
  '已帮你提交报修，如果房东 24 小时没回应我会提醒你。',
  // a claim, then a question about something else
  '申请我已经提交了，你看可以吗？',
  // a claim in the sentence that introduces a draft, and an explicit 「已帮你…」 after one
  '已帮你把催修信发给房东了，内容如下：\n\n你好，我在 10 月 2 日提交了报修。',
  '草稿如下：\n你好，我想问一下进度。\n\n另外，已帮你提交了报修工单。',
]

// Somebody else's action, a condition, a question, advice, a label, a thing — or the reader's own words.
const NOT_CLAIMS = [
  // 2026-11-25: 「申请包 / 申请人 / 申请表」 are nouns — a reply that says a card for the pack is below claims nothing
  '我已经读取了你发来的工资单和在职信。系统已在下方为你生成了申请包卡片，请逐项核对。', '已为你打开申请人页面的入口。', '已经在下面放了一张申请包卡。', '已帮你整理好申请表上会问的几项。',
  // the three that reached real users
  '双方已经同意解约或已发出搬迁通知，房东在上午 8 点至晚上 8 点之间带新租客看房。',
  '若你已更新完毕，可进入 /dashboard 打开该房源编辑页，确认所有必填项已保存并处于「已提交审核」状态。',
  '房东目前是否已经向你提出了具体涨幅或发了通知？',
  // third party
  '租客已经申请了 T6。', '房东安排好了师傅。', '房东发了通知。', '但房东已提交 L1。', '1. 房东已经发出 N4。', '房东通常已提交 L1 申请才会有听证。',
  'The landlord has already sent the notice.',
  // the reader's own action
  '你已签署租约，就受它约束。', '如果你已经付款，请保留回执。', 'You have already paid the deposit, so keep the receipt.',
  // conditions and points in time
  '如果房东已经发出 N4，你有 7 天时间补齐。', '房东已批准报价后，系统会给你发进入通知。', '申请成功后，房东会发来租约。', '付款完成前不要交钥匙。',
  'LTB 已经安排听证的话，你会收到通知。', '房东已发出 N12 的情况下，租客有权获得一个月租金补偿。', '对方已拒绝的话可以向 LTB 申请。', '一旦报价已批准，师傅会联系你。',
  '比如房东已发出 N4 通知，你仍然可以补齐欠租。',
  'If the landlord has already sent an N4, you have 7 days.', 'Once the application has been submitted, the landlord reviews it.',
  // questions
  '房东已经把钥匙交给你了吗？', 'Has the landlord already sent a notice?', 'Would you like me to send it?',
  // advice and requirements
  '请确认材料已提交。', '房东必须已发出书面通知才能进入。', 'Make sure the form has been signed.', '请先把材料交给房东，再等他回复。',
  // a thing, not a deed
  '已签署的租约房东不能单方面修改。', '你已经提交的申请可以在「申请」页查看进度。', '已安排的看房可以在申请页看到。', '已付的租金会出现在租金页。',
  '租客已付款的那几期会显示「已付」。', '你已签署的那份是标准租约。',
  // proposals — the whole point of the product
  '我可以帮你起草一份申请，你确认后我再提交。', 'I can draft the application — I will submit it once you approve.',
  // the reader's words to send: a quoted message, and a draft
  '你可以回复房东：「我已经在 11 月 1 日付款，请查收。」',
  '你可以这样说：\n房东你好，申请我已经提交了，麻烦看一下。',
  '已经为你起草好给房东的催修信，完整内容如下：\n\n主题：报修跟进\n\n正文：\n你好，\n\n我在 10 月 2 日提交了关于厨房水龙头的报修，目前尚未有师傅前来处理。',
  "Here's a draft you can send:\n\nHi, I already paid October's rent on the 3rd.",
]

describe('who is claiming to have done it', () => {
  it('the assistant’s own claims are still caught', () => {
    for (const s of CLAIMS) expect(replyClaimsExecution(s), s).toBe(true)
  })
  it('other people’s actions, conditions, questions, advice, labels and drafts are not', () => {
    for (const s of NOT_CLAIMS) expect(replyClaimsExecution(s), s).toBe(false)
  })
  it('a long answer about landlord entry gets no note; the same answer with a real claim in it does', () => {
    const answer = '通常情况下不可以。\n\n1. 正常情况必须提前 24 小时书面通知 [1]。\n2. 仅在极少数情况下无需通知：\n· 发生紧急情况（如室内突发严重漏水、火灾等）；\n· 双方已经同意解约或已发出搬迁通知，房东在上午 8 点至晚上 8 点之间带新租客看房。\n\n除了这些法定情形，房东不能擅自进入。'
    const r = applyGuardrail('tenant', out(answer), 'zh')
    expect(r.flags).not.toContain('executed_claim_in_reply')
    expect(r.out.reply).toBe(answer)
    const withClaim = applyGuardrail('tenant', out(answer + '\n\n我已给房东发送了提醒。'), 'zh')
    expect(withClaim.flags).toContain('executed_claim_in_reply')
    expect(withClaim.out.reply).toContain('尚未真正执行')
  })
  it('every hat, both languages', () => {
    for (const role of ['tenant', 'landlord', 'agent'] as const) {
      expect(flagged('已帮你把租约发给租客了。', role)).toBe(true)
      expect(flagged('租客已经提交了申请，你可以在申请页查看。', role)).toBe(false)
      expect(flagged("I've sent the lease to the tenant.", role)).toBe(true)
      expect(flagged('The tenant has already submitted the application.', role)).toBe(false)
    }
  })
})

describe('the card path is unchanged: a card is always the assistant’s own', () => {
  const card = (summary: string) => ({ action_type: 'send_message', title: '给房东发消息', summary, recipient_label: '房东', data_scope: ['消息正文'], excluded_data: [], risk_level: 'low', metadata: { subject: 's', body: 'b' } })
  it('an executed claim inside a card summary is still rewritten, even one the reply rule would now let pass', () => {
    const r = applyGuardrail('tenant', out('好的。', card('房东已提交的材料已发送')), 'zh')
    expect(r.flags).toContain('rewrote_executed_claim')
    expect(r.out.proposedAction?.summary).toContain('已准备好（待你确认）')
  })
  it('with a card on the table the reply note is not added (the card corrects the impression)', () => {
    const r = applyGuardrail('tenant', out('我已发送申请给房东。', card('把这段话发给房东')), 'zh')
    expect(r.flags).not.toContain('executed_claim_in_reply')
  })
})
