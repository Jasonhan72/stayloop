// What the applicant sees when the bank step fails (B7, 2026-10-19). Flinks codes from
// https://docs.flinks.com/api/authorize/error-codes, plus our own READ_TIMEOUT /
// NO_ACCOUNTS / UNAVAILABLE. The page used to print the raw "flinks detail 401 …" string.
//
// Pure — used by the routes (stored as steps.bank.error_code) and by the page.

export type BankErrorLang = 'zh' | 'en'
export type BankErrorInfo = { zh: string; en: string; retry: boolean }

const RETRY_LATER: BankErrorInfo = {
  zh: '暂时连不上你的银行，请过几分钟再试。',
  en: 'We could not reach your bank just now. Please try again in a few minutes.',
  retry: true,
}

const MESSAGES: Record<string, BankErrorInfo> = {
  INVALID_LOGIN: { zh: '银行登录没有成功，请重新连接并检查用户名和密码。', en: 'The bank sign-in did not go through. Please connect again and check your username and password.', retry: true },
  INVALID_USERNAME: { zh: '银行用户名不对，请重新连接。', en: 'The bank username was not accepted. Please connect again.', retry: true },
  INVALID_PASSWORD: { zh: '银行密码不对，请重新连接。', en: 'The bank password was not accepted. Please connect again.', retry: true },
  INVALID_SECURITY_RESPONSE: { zh: '银行的安全验证没有通过，请重新连接，按银行的提示作答。', en: 'Your bank’s security check was not passed. Please connect again and answer as your bank asks.', retry: true },
  SECURITYRESPONSES_INCOMPLETE: { zh: '银行的安全问题还没答完，请重新连接。', en: 'Not all of your bank’s security questions were answered. Please connect again.', retry: true },
  QUESTION_NOT_FOUND: { zh: '银行问了一个新的安全问题，请重新连接作答。', en: 'Your bank asked a new security question. Please connect again to answer it.', retry: true },
  UNKNOWN_CHALLENGE_KEY: { zh: '银行的安全验证没有通过，请重新连接。', en: 'Your bank’s security check was not passed. Please connect again.', retry: true },
  DISABLED_LOGIN: { zh: '银行停用了这个网银账户，请先联系你的银行。', en: 'Your bank has disabled this online banking login. Please contact your bank first.', retry: false },
  NEW_ACCOUNT: { zh: '银行要求你先在它的网站或 App 里完成一步操作（例如确认条款），完成后再来连接。', en: 'Your bank needs you to finish a step on its own website or app first (for example accepting its terms). Then connect again.', retry: true },
  DISABLED_INSTITUTION: { zh: '这家银行暂时不能连接。这一步可以跳过，不影响其他核验。', en: 'This bank cannot be connected right now. You can skip this step; it does not affect the others.', retry: false },
  NO_TRANSACTION: { zh: '这个账户近 90 天没有交易，读不出收入。可以换一个账户，或者跳过这一步。', en: 'This account has no transactions in the last 90 days, so no income can be read. Try another account or skip this step.', retry: true },
  CONCURRENT_SESSION: { zh: '这个银行账户正在别处连接，请稍等一分钟再试。', en: 'This bank login is being used in another session. Please wait a minute and try again.', retry: true },
  CARD_IN_USE: { zh: '银行数据还在处理，请稍等一分钟再试。', en: 'Your bank data is still being processed. Please wait a minute and try again.', retry: true },
  SESSION_EXPIRED: { zh: '这次连接已超时，请重新连接。', en: 'This connection timed out. Please connect again.', retry: true },
  SESSION_NONEXISTENT: { zh: '这次连接已超时，请重新连接。', en: 'This connection timed out. Please connect again.', retry: true },
  RETRY_LATER,
  TOO_MANY_REQUESTS: RETRY_LATER,
  AGGREGATION_ERROR: RETRY_LATER,
  UNAVAILABLE: RETRY_LATER,
  READ_TIMEOUT: { zh: '银行数据读取时间太长，这次没有完成。请重新连接再试一次。', en: 'Reading your bank data took too long and did not finish. Please connect again.', retry: true },
  NO_ACCOUNTS: { zh: '没有读到可用的账户。请重新连接并选择你的主要账户，或者跳过这一步。', en: 'No usable account was found. Please connect again and pick your main account, or skip this step.', retry: true },
}

/** Everything else (ACCESS_DENIED, INVALID_REQUEST, UNHANDLED, METHOD_NOT_AVAILABLE, unknown). */
const GENERIC: BankErrorInfo = {
  zh: '银行这一步没有完成。可以重新连接，也可以跳过，不影响其他核验。',
  en: 'The bank step did not finish. You can connect again or skip it; it does not affect the others.',
  retry: true,
}

export function bankErrorInfo(code: string | null | undefined): BankErrorInfo {
  return (code && MESSAGES[code]) || GENERIC
}

export function bankErrorMessage(code: string | null | undefined, lang: BankErrorLang): string {
  return bankErrorInfo(code)[lang]
}

/** The code we store: a known Flinks / internal code, else null (shown as the generic message). */
export function normalizeBankErrorCode(code: string | null | undefined): string | null {
  return code && MESSAGES[code] ? code : null
}
