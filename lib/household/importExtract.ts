// Sanitizer for the lease-import extraction — the model reads the uploaded
// lease, this module decides what is allowed into the confirm form.
//
// The extraction is an accelerator, not a source of truth: everything it
// produces is shown to the uploader for confirmation before anything is
// persisted (the project's standing rule since the screening rubric work).
// The sanitizer's job is narrower — make sure whatever the model emitted is
// shaped, clamped, and never able to smuggle surprises into the form.

export interface LeaseImportExtraction {
  address: string | null
  unit: string | null
  city: string | null
  monthly_rent: number | null
  rent_due_day: number | null
  start_date: string | null
  end_date: string | null
  tenant_names: string[]
  landlord_names: string[]
  /** Model's one-line note on anything odd (handwritten edits, missing pages). */
  note: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

const names = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 1)
    .map((x) => x.trim().slice(0, 120))
    .slice(0, 6)

export function sanitizeLeaseImportExtraction(raw: unknown): LeaseImportExtraction {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const rent = typeof r.monthly_rent === 'number' && isFinite(r.monthly_rent)
    && r.monthly_rent > 0 && r.monthly_rent < 100_000
    ? Math.round(r.monthly_rent * 100) / 100
    : null

  const dueDay = typeof r.rent_due_day === 'number' && Number.isInteger(r.rent_due_day)
    && r.rent_due_day >= 1 && r.rent_due_day <= 31
    ? r.rent_due_day
    : null

  const date = (v: unknown): string | null => {
    const s = str(v, 10)
    return s && ISO_DATE.test(s) ? s : null
  }

  const start = date(r.start_date)
  let end = date(r.end_date)
  // An end before the start is an extraction error, not a lease term.
  if (start && end && end < start) end = null

  return {
    address: str(r.address),
    unit: str(r.unit, 40),
    city: str(r.city, 80),
    monthly_rent: rent,
    rent_due_day: dueDay,
    start_date: start,
    end_date: end,
    tenant_names: names(r.tenant_names),
    landlord_names: names(r.landlord_names),
    note: str(r.note, 300),
  }
}

export const LEASE_IMPORT_PROMPT = `You are reading an ALREADY-SIGNED residential lease (Ontario Standard Lease, OREA Form 400, or similar) uploaded so the tenancy can be managed. Extract ONLY what is printed — never infer, never fill gaps.

Return ONLY this JSON, no markdown:
{
 "address": "street address of the RENTAL UNIT as printed, or null",
 "unit": "unit/apt number or null",
 "city": "city or null",
 "monthly_rent": <the recurring BASE monthly rent as a number, or null. NOT the deposit, NOT prepaid rent, NOT parking. Ontario lease PDFs are often fillable forms whose text stream still contains superseded draft values — read the value visibly rendered on the rent line.>,
 "rent_due_day": <day of month rent is due (1-31), from "payable on the X day of each month", or null>,
 "start_date": "yyyy-mm-dd tenancy start or null",
 "end_date": "yyyy-mm-dd end of the fixed term, or null if month-to-month or not stated",
 "tenant_names": ["every tenant named on the lease, as printed"],
 "landlord_names": ["every landlord named on the lease, as printed"],
 "note": "one short sentence about anything a manager should know (handwritten changes, missing signature page, illegible sections) or null"
}`
