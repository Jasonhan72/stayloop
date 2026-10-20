// Flinks — Canadian bank-account aggregation. Flinks Connect (iframe) hands
// the browser a loginId; the server exchanges it for accounts + 90 days of
// transactions and reduces them to the deterministic income summary.
//
// Sandbox ("toolbox") is public and needs no account — every result from it
// is stamped sandbox:true and never trusted by scoring.
import { summarizeBank, type AccountIn } from '../income'
import type { BankResult } from '../types'

const SANDBOX_INSTANCE = 'toolbox'
const SANDBOX_CUSTOMER = '43387ca6-0391-4c82-857d-70d95f087ecb'

export function flinksConfig() {
  const instance = process.env.FLINKS_INSTANCE || SANDBOX_INSTANCE
  const customerId = process.env.FLINKS_CUSTOMER_ID || SANDBOX_CUSTOMER
  const apiBase = (process.env.FLINKS_API_BASE || `https://${instance}-api.private.fin.ag`).replace(/\/$/, '')
  const sandbox = instance === SANDBOX_INSTANCE
  return { instance, customerId, apiBase, sandbox }
}

// Credentials Flinks issues per instance (Dashboard → Settings → instance):
//   FLINKS_AUTH_KEY   — `flinks-auth-key`, only used to mint the short-lived
//                       Authorize Token that Flinks Connect has required in
//                       its URL since October 2024
//   FLINKS_API_SECRET — `x-api-key`, used on the aggregation endpoints
//                       (Authorize, GetAccountsDetail …)
export function flinksConfigured(): boolean {
  return !!(process.env.FLINKS_AUTH_KEY && process.env.FLINKS_API_SECRET)
}

/**
 * A Flinks API failure with its Flinks code (`FlinksCode` in the body, e.g. CARD_IN_USE,
 * SESSION_EXPIRED, RETRY_LATER — https://docs.flinks.com/api/authorize/error-codes) so the
 * routes can tell the applicant something they can act on (lib/verify/bankErrors.ts).
 */
export class FlinksError extends Error {
  constructor(message: string, public readonly code: string | null, public readonly httpStatus: number) {
    super(message)
    this.name = 'FlinksError'
  }
}

function flinksCodeOf(data: { FlinksCode?: unknown; flinksCode?: unknown } | null | undefined): string | null {
  const c = data?.FlinksCode ?? data?.flinksCode
  return typeof c === 'string' && /^[A-Z_]{3,40}$/.test(c) ? c : null
}

// Short-lived token that must ride in the Connect URL (`authorizeToken`).
export async function flinksGenerateAuthorizeToken(): Promise<string> {
  const { apiBase, customerId } = flinksConfig()
  const res = await fetch(`${apiBase}/v3/${customerId}/BankingServices/GenerateAuthorizeToken`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', 'flinks-auth-key': process.env.FLINKS_AUTH_KEY || '' },
    body: '{}',
  })
  const data = await res.json().catch(() => ({})) as { Token?: string; token?: string; HttpStatusCode?: number; Message?: string; FlinksCode?: string }
  const token = data.Token || data.token
  if (!res.ok || !token) throw new FlinksError(`flinks authorize-token ${res.status} ${data.HttpStatusCode ?? ''}: ${data.Message || ''}`.trim(), flinksCodeOf(data), res.status)
  return token
}

// Connect iframe URL. `demo=true` only makes sense on the sandbox instance.
// redirectUrl must be on a domain Flinks has whitelisted for this instance;
// OAuth institutions land there with ?loginId=… appended.
export function flinksConnectUrl(opts: { authorizeToken: string; redirectUrl: string; lang?: 'en' | 'fr' }): string {
  const { instance, sandbox } = flinksConfig()
  const explicit = process.env.NEXT_PUBLIC_FLINKS_CONNECT_URL
  const base = explicit || `https://${instance}-iframe.private.fin.ag/v2/`
  const u = new URL(base)
  if (sandbox) u.searchParams.set('demo', 'true')
  u.searchParams.set('authorizeToken', opts.authorizeToken)
  u.searchParams.set('redirectUrl', opts.redirectUrl)
  u.searchParams.set('daysOfTransactions', 'Days90')
  u.searchParams.set('consentEnable', 'true')
  u.searchParams.set('customerName', 'Stayloop')
  u.searchParams.set('accountSelectorEnable', 'true')
  u.searchParams.set('accountSelectorMultiple', 'true')
  u.searchParams.set('language', opts.lang || 'en')
  u.searchParams.set('theme', 'light')
  return u.toString()
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.FLINKS_API_SECRET) h['x-api-key'] = process.env.FLINKS_API_SECRET
  if (process.env.FLINKS_BEARER) h.Authorization = `Bearer ${process.env.FLINKS_BEARER}`
  return h
}

type FlinksAccount = {
  Title?: string; AccountNumber?: string; Category?: string; Type?: string; Currency?: string
  Holder?: { Name?: string }
  Balance?: { Available?: number | null; Current?: number | null }
  Transactions?: Array<{ Date?: string; Description?: string; Credit?: number | null; Debit?: number | null; Balance?: number | null }>
}
export type DetailResponse = { HttpStatusCode?: number; RequestId?: string; Institution?: string; Accounts?: FlinksAccount[]; Message?: string; FlinksCode?: string }

export async function flinksAuthorize(loginId: string): Promise<string> {
  const { apiBase, customerId } = flinksConfig()
  const res = await fetch(`${apiBase}/v3/${customerId}/BankingServices/Authorize`, {
    method: 'POST', headers: headers(), signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ LoginId: loginId, MostRecentCached: true }),
  })
  const data = await res.json().catch(() => ({})) as { RequestId?: string; HttpStatusCode?: number; Message?: string; FlinksCode?: string }
  if (!data.RequestId) throw new FlinksError(`flinks authorize ${res.status} ${data.HttpStatusCode ?? ''}: ${data.Message || ''}`.trim(), flinksCodeOf(data), res.status)
  return data.RequestId
}

/** One step of reading the accounts: the data, or "the bank is still being read" (202). */
export type DetailStep = { ready: true; detail: DetailResponse } | { ready: false }

function detailStep(res: Response, data: DetailResponse): DetailStep {
  if (res.status === 202 || data.HttpStatusCode === 202) return { ready: false }
  if (res.ok && Array.isArray(data.Accounts)) return { ready: true, detail: data }
  throw new FlinksError(`flinks detail ${res.status} ${data.HttpStatusCode ?? ''}: ${data.Message || ''}`.trim(), flinksCodeOf(data), res.status)
}

// First GetAccountsDetail call. A large bank often answers 202; the read then
// continues on GetAccountsDetailAsync, driven by the page (/bank/poll) and the
// hourly sweep (/api/cron/verify-sweep) — never by a loop inside one request,
// which failed slow banks and died with the tab (B6, 2026-10-19).
export async function flinksAccountsDetailStart(requestId: string): Promise<DetailStep> {
  const { apiBase, customerId } = flinksConfig()
  const res = await fetch(`${apiBase}/v3/${customerId}/BankingServices/GetAccountsDetail`, {
    method: 'POST', headers: headers(), signal: AbortSignal.timeout(25000),
    body: JSON.stringify({ RequestId: requestId, WithTransactions: true, WithBalance: true, DaysOfTransactions: 'Days90', WithAccountIdentity: true }),
  })
  return detailStep(res, await res.json().catch(() => ({})) as DetailResponse)
}

export async function flinksAccountsDetailPoll(requestId: string): Promise<DetailStep> {
  const { apiBase, customerId } = flinksConfig()
  const res = await fetch(`${apiBase}/v3/${customerId}/BankingServices/GetAccountsDetailAsync/${encodeURIComponent(requestId)}`, {
    method: 'GET', headers: headers(), signal: AbortSignal.timeout(20000),
  })
  return detailStep(res, await res.json().catch(() => ({})) as DetailResponse)
}

/**
 * End Flinks' access to this connection once the summary is stored. A loginId never
 * expires and can pull the account again (docs.flinks.com/guides/connect/retrieve-account-data),
 * so keeping it is standing access to someone's bank. CARD_IN_USE right after Authorize is
 * expected; the caller keeps the id and the sweep retries.
 */
export async function flinksDeleteCard(loginId: string): Promise<void> {
  const { apiBase, customerId } = flinksConfig()
  const res = await fetch(`${apiBase}/v3/${customerId}/BankingServices/DeleteCard/${encodeURIComponent(loginId)}`, {
    method: 'DELETE', headers: headers(), signal: AbortSignal.timeout(15000),
  })
  if (res.ok) return
  const data = await res.json().catch(() => ({})) as { HttpStatusCode?: number; Message?: string; FlinksCode?: string }
  const code = flinksCodeOf(data)
  // Already gone counts as deleted.
  if (res.status === 404 || code === 'INVALID_LOGIN') return
  throw new FlinksError(`flinks delete-card ${res.status}: ${data.Message || ''}`.trim(), code, res.status)
}

/** The Flinks calls the bank flow uses — injectable so the flow is testable without the network. */
export type FlinksApi = {
  authorize: (loginId: string) => Promise<string>
  detailStart: (requestId: string) => Promise<DetailStep>
  detailPoll: (requestId: string) => Promise<DetailStep>
  deleteCard: (loginId: string) => Promise<void>
}
export const flinksApi: FlinksApi = {
  authorize: flinksAuthorize,
  detailStart: flinksAccountsDetailStart,
  detailPoll: flinksAccountsDetailPoll,
  deleteCard: flinksDeleteCard,
}

export function flinksToBankResult(detail: DetailResponse): BankResult {
  const accounts: AccountIn[] = (detail.Accounts || []).map((a) => ({
    title: a.Title ?? null,
    account_number: a.AccountNumber ?? null,
    category: a.Category ?? null,
    type: a.Type ?? null,
    currency: a.Currency ?? null,
    holder_name: a.Holder?.Name ?? null,
    balance_current: a.Balance?.Current ?? null,
    balance_available: a.Balance?.Available ?? null,
    transactions: (a.Transactions || []).map((t) => ({
      date: (t.Date || '').slice(0, 10),
      description: t.Description || '',
      credit: typeof t.Credit === 'number' ? t.Credit : null,
      debit: typeof t.Debit === 'number' ? t.Debit : null,
      balance: typeof t.Balance === 'number' ? t.Balance : null,
    })),
  }))
  return summarizeBank(accounts, detail.Institution ?? null, 90)
}
