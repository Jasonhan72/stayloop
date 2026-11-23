// /provider/onboard/professional — onboarding for 专业服务 (licensed paralegals, lawyers, insurance
// brokers, listing photographers), a page of its own since 2026-11-23 (user: 「可以单独页面，和专业服务
// 需要分开」). It is the same form as /provider/onboard, which reads its kind from the address
// (lib/marketplace/onboardKind.ts onboardKindOfPath): one account has one provider record, so the
// two pages write the same row and neither drops what the other entered.
export { default } from '../page'
