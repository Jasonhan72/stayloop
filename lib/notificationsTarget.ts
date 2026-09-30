// Where the retired /notifications page sends people (2026-09-30).
export function notificationsTarget(signedIn: boolean, hat: 'tenant' | 'landlord' | 'agent', provider: boolean): string {
  if (!signedIn) return '/login?next=/messages'
  if (provider) return '/provider/jobs'
  return `/${hat}/todo`
}
