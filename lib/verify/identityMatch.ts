// Identity binding for the applicant-authorised credit pull (review
// 2026-09-19). The /verify token is held by the landlord as well as the
// applicant, so the bureau inquiry must be tied to the person whose identity
// was verified — not to whatever name and date of birth were typed.
//
// The old test was ONE shared name token: verified "Maria Garcia" let a pull
// for "Maria Lopez" through, and the typed DOB was never compared with the one
// the identity provider returned. Pure functions so the rule is testable; the
// route (app/api/verify/[token]/credit) only wires them.

const tokens = (x: string | null | undefined): string[] =>
  (x || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Every typed name token is present in the reference name (order- and accent-insensitive); at least two tokens typed. */
export function typedNameWithin(typed: string, reference: string | null | undefined): boolean {
  const t = tokens(typed)
  const ref = new Set(tokens(reference))
  return t.length >= 2 && ref.size > 0 && t.every((x) => ref.has(x))
}

/** Loose overlap — only for the landlord-typed applicant name, which may be a short form. */
export function sharesNameToken(typed: string, reference: string | null | undefined): boolean {
  const t = tokens(typed).filter((x) => x.length > 1)
  const ref = tokens(reference).filter((x) => x.length > 1)
  return t.length > 0 && ref.some((x) => t.includes(x))
}

export type VerifiedIdentity = { first_name?: string | null; last_name?: string | null; date_of_birth?: string | null } | null

export type CreditIdentityVerdict =
  | { ok: true }
  | { ok: false; error: 'identity_required' | 'identity_mismatch'; detail: string }

export function checkCreditPullIdentity(args: {
  provider: string | null
  typed: { first_name: string; last_name: string; date_of_birth: string }
  verifiedId: VerifiedIdentity
  consentName?: string | null
  landlordNamedApplicant?: string | null
}): CreditIdentityVerdict {
  const typedName = `${args.typed.first_name} ${args.typed.last_name}`
  const id = args.verifiedId
  if (id) {
    if (!typedNameWithin(typedName, `${id.first_name || ''} ${id.last_name || ''}`)) {
      return { ok: false, error: 'identity_mismatch', detail: 'The name entered does not match the identity verified on this request.' }
    }
    const dob = (id.date_of_birth || '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dob) && dob !== args.typed.date_of_birth) {
      return { ok: false, error: 'identity_mismatch', detail: 'The date of birth entered does not match the identity verified on this request.' }
    }
    return { ok: true }
  }
  // A real bureau inquiry is only ever made for a verified identity. The
  // consent-signature fallback exists for the local mock provider alone.
  if (args.provider !== 'mock') {
    return { ok: false, error: 'identity_required', detail: 'Complete identity verification before authorising a credit check.' }
  }
  if (!typedNameWithin(typedName, args.consentName) || (args.landlordNamedApplicant && !sharesNameToken(typedName, args.landlordNamedApplicant))) {
    return { ok: false, error: 'identity_mismatch', detail: 'The name entered must match the consent signature and the applicant this request was created for.' }
  }
  return { ok: true }
}
