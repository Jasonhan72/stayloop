/**
 * One email address, the way `lease_documents_tenant_email_shape` enforces it
 * in the database (migration 20261115_code_review_s0_s1): something@host.tld
 * with no whitespace, comma or bracket anywhere. Forms that write a tenant's
 * email check this first so the person sees a sentence, not a constraint error.
 * Keep the pattern identical to the SQL one.
 */
export const EMAIL_SHAPE = /^[^\s,()@]+@[^\s,()@]+\.[^\s,()@]+$/

export function emailShapeOk(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return !v || EMAIL_SHAPE.test(v)
}

export const EMAIL_SHAPE_MESSAGE = {
  zh: '租客邮箱格式不对：只填一个邮箱地址，不要带空格、逗号或括号。',
  en: 'Tenant email looks invalid: one address only, without spaces, commas or brackets.',
}
