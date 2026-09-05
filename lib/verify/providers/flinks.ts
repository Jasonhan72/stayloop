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

// Short-lived token that must ride in the Connect URL (`authorizeToken`).
export async function flinksGenerateAuthorizeToken(): Promise<string> {
  const { apiBase, customerId } = flinksConfig()
  const res = await fetch(`${apiBase}/v3/${customerId}/BankingServices/GenerateAuthorizeToken`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', 'flinks-auth-key': process.env.FLINKS_AUTH_KEY || '' },
    body: '{}',
  })
  const data = await res.json().catch(() => ({})) as { Token?: string; token?: string; HttpStatusCode?: number; Message?: string }
  const token = data.Token || data.token
  if (!res.ok || !token) throw new Error(`flinks authorize-token ${res.status} ${data.HttpStatusCode ?? ''}: ${data.Message || ''}`.trim())
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
type DetailResponse = { HttpStatusCode?: number; RequestId?: string; Institution?: string; Accounts?: FlinksAccount[]; Message?: string }

export async function flinksAuthorize(loginId: string): Promise<string> {
  const { apiBase, customerId } = flinksConfig()
  const res = await fetch(`${apiBase}/v3/${customerId}/BankingServices/Authorize`, {
    method: 'POST', headers: headers(), signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ LoginId: loginId, MostRecentCached: true }),
  })
  const data = await res.json().catch(() => ({})) as { RequestId?: string; HttpStatusCode?: number; Message?: string }
  if (!data.RequestId) throw new Error(`flinks authorize ${res.status} ${data.HttpStatusCode ?? ''}: ${data.Message || ''}`.trim())
  return data.RequestId
}

// GetAccountsDetail may answer 202 while the bank is still being read; poll
// the async endpoint a bounded number of times (edge request budget).
export async function flinksAccountsDetail(requestId: string, opts: { maxPolls?: number; pollMs?: number } = {}): Promise<DetailResponse> {
  const { apiBase, customerId } = flinksConfig()
  const first = await fetch(`${apiBase}/v3/${customerId}/BankingServices/GetAccountsDetail`, {
    method: 'POST', headers: headers(), signal: AbortSignal.timeout(25000),
    body: JSON.stringify({ RequestId: requestId, WithTransactions: true, WithBalance: true, DaysOfTransactions: 'Days90', WithAccountIdentity: true }),
  })
  let data = await first.json().catch(() => ({})) as DetailResponse
  const maxPolls = opts.maxPolls ?? 6
  const pollMs = opts.pollMs ?? 3000
  let polls = 0
  while ((first.status === 202 || data.HttpStatusCode === 202) && polls < maxPolls) {
    await new Promise((r) => setTimeout(r, pollMs))
    const res = await fetch(`${apiBase}/v3/${customerId}/BankingServices/GetAccountsDetailAsync/${requestId}`, {
      method: 'GET', headers: headers(), signal: AbortSignal.timeout(20000),
    })
    data = await res.json().catch(() => ({})) as DetailResponse
    if (res.status === 200 && data.HttpStatusCode !== 202) break
    polls++
  }
  if (!Array.isArray(data.Accounts)) {
    throw new Error(`flinks detail not ready (${data.HttpStatusCode ?? 'n/a'}): ${data.Message || ''}`.trim())
  }
  return data
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
