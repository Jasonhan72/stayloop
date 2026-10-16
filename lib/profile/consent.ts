// Applicant pack — the applicant's consent (V1.0 阶段 4 · 乙 #7 · G13, 2026-10-16).
// Versioned like the verification consent (lib/verify/consent.ts): the version
// string is stored on applicant_profiles.consent_version with consent_at; a new
// text means a new version and every pack asks again. The five points are the
// contract's: purpose, content, who sees it, retention, withdrawal. Nothing here
// says Stayloop looks anything up — the pack is only what the applicant provides.

export const APPLICANT_PROFILE_CONSENT_VERSION = 'profile-v1-2026-10'

export type ConsentPoint = { title: string; body: string }

export const APPLICANT_PROFILE_CONSENT_TEXT: Record<'zh' | 'en', { heading: string; intro: string; points: ConsentPoint[]; affirm: string }> = {
  zh: {
    heading: '我的申请包 · 同意',
    intro: '申请包里的每一项都是我自己填写、自己上传，或由我授权第三方出具的。Stayloop 不替任何人查任何人。',
    points: [
      { title: '目的', body: '只用于向我选择的房东或经纪出示、申请租房。' },
      { title: '内容', body: '我填写的资料（联系方式、工作与收入、过往住址、同住人与宠物）与我上传的文件。' },
      { title: '谁看', body: '只有我出示给的对象。Stayloop 不主动提供给任何人，也不用于其他用途。' },
      { title: '保留', body: '我可以随时删除任一项或整个申请包。' },
      { title: '撤回', body: '删除即撤回。已出示给房东的副本由房东保管，我可以直接向房东提出删除。' },
    ],
    affirm: '我同意按以上方式保存与出示我的申请包。',
  },
  en: {
    heading: 'My application pack · consent',
    intro: 'Everything in the pack is what I typed, what I uploaded, or what a third party issued at my request. Stayloop does not look anyone up on anyone’s behalf.',
    points: [
      { title: 'Purpose', body: 'Only to present to the landlords or agents I choose, when I apply for a rental.' },
      { title: 'Content', body: 'The details I entered (contact, work and income, previous addresses, occupants and pets) and the files I uploaded.' },
      { title: 'Who sees it', body: 'Only the people I present it to. Stayloop never hands it to anyone on its own, nor uses it for anything else.' },
      { title: 'Retention', body: 'I can delete any item, or the whole pack, at any time.' },
      { title: 'Withdrawal', body: 'Deleting is withdrawing. A copy already presented to a landlord stays with that landlord; I can ask them directly to delete it.' },
    ],
    affirm: 'I agree to have my application pack stored and presented this way.',
  },
}

/** Where the pack was shown — the audit metadata for applicant_pack_presented. */
export type PresentedTo = 'application' | 'share' | 'pdf'

export type PresentedMetadata = { to: PresentedTo; application_id?: string; scope: string[] }

export function presentedMetadata(to: PresentedTo, scope: string[], applicationId?: string | null): PresentedMetadata {
  const uniq = Array.from(new Set(scope.filter((s) => typeof s === 'string' && s.length > 0)))
  return applicationId ? { to, application_id: applicationId, scope: uniq } : { to, scope: uniq }
}

/** True when the stored consent is the current version. */
export function hasCurrentConsent(profile: { consent_version?: string | null; consent_at?: string | null } | null | undefined): boolean {
  return !!profile && profile.consent_version === APPLICANT_PROFILE_CONSENT_VERSION && !!profile.consent_at
}
