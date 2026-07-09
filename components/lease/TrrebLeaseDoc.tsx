'use client'

// Renderer for the TRREB Agreement to Lease — Residential (Form 400
// structure). Pure display, mirroring OntarioLeaseDoc: give it terms +
// signatures and it renders the document — used by the drafting preview,
// the tenant signing page, the landlord detail page, and the print/PDF
// backup (window.print with print styles). The printed document is clean
// English; on-screen chrome may add zh hints with `print:hidden`.
import type { LeaseSignature } from '@/lib/lease/ontario'
import type { TrrebLeaseTerms } from '@/lib/lease/trreb'

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h3 className="border-b border-neutral-300 pb-1 text-[13px] font-bold tracking-tight">
        {n}. {title}
      </h3>
      <div className="mt-2 text-[12.5px] leading-relaxed text-neutral-800">{children}</div>
    </section>
  )
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-[190px] flex-none text-neutral-500">{k}</span>
      <span className="font-medium">{v || '—'}</span>
    </div>
  )
}

export default function TrrebLeaseDoc({
  terms,
  landlordSignature,
  tenantSignature,
  status,
}: {
  terms: TrrebLeaseTerms
  landlordSignature?: LeaseSignature | null
  tenantSignature?: LeaseSignature | null
  status?: string
}) {
  const t = terms
  const money = (n?: number | null) =>
    typeof n === 'number' && isFinite(n) ? `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2 })}` : '—'
  const fullySigned = !!landlordSignature && !!tenantSignature
  const includedServices = [
    t.services.gas && 'Gas',
    t.services.hydro && 'Hydro (electricity)',
    t.services.water && 'Water',
    t.services.heat && 'Heat',
    t.services.air_conditioning && 'Air conditioning',
    t.services.cable_tv && 'Cable TV',
    t.services.internet && 'Internet',
    t.services.laundry && 'Laundry',
    t.services.snow_removal && 'Snow removal',
    t.services.landscaping && 'Landscaping',
    t.services.other,
  ].filter(Boolean).join(', ')

  return (
    <div className="mx-auto max-w-[820px] bg-white p-8 text-neutral-900 print:p-0" id="lease-doc">
      {/* Header */}
      <div className="border-b-2 border-neutral-900 pb-4">
        <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">
          Agreement to Lease — Residential (TRREB Form 400 style)
        </div>
        <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">Agreement to Lease — Residential</h1>
        <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-600">
          This Agreement to Lease follows the structure of the Toronto Regional Real Estate Board's Form 400.
          The resulting tenancy is governed by the <i>Residential Tenancies Act, 2006</i> (Ontario); any term
          that conflicts with the Act is void and unenforceable. 本租赁协议采用 TRREB Form 400 结构；由此产生的
          租赁关系受安省《住宅租赁法》约束，与该法冲突的条款无效。
        </p>
        {fullySigned && (
          <div className="mt-2 inline-block rounded border border-green-700 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-green-700">
            ✓ Fully executed{' '}
            {landlordSignature && tenantSignature
              ? `· ${new Date(Math.max(new Date(landlordSignature.signed_at).getTime(), new Date(tenantSignature.signed_at).getTime())).toISOString().slice(0, 10)}`
              : ''}
          </div>
        )}
        {!fullySigned && status && status !== 'draft' && (
          <div className="mt-2 inline-block rounded border border-amber-600 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-amber-700 print:hidden">
            {status === 'sent' ? 'Awaiting tenant signature · 等待租客签字' : status === 'signed_tenant' ? 'Awaiting landlord signature · 等待房东回签' : status}
          </div>
        )}
      </div>

      <Section n={1} title="Parties to this Agreement">
        <Field k="Landlord (Lessor)" v={t.landlord_legal_name} />
        <Field k="Tenant(s) (Lessee)" v={t.tenant_names.filter(Boolean).join(', ')} />
      </Section>

      <Section n={2} title="Premises">
        <Field k="Address" v={[t.premises.street, t.premises.unit ? `Unit ${t.premises.unit}` : null, t.premises.city, 'Ontario', t.premises.postal].filter(Boolean).join(', ')} />
        <Field k="Parking" v={t.parking || 'None included'} />
        <Field k="Locker" v={t.locker || 'None included'} />
      </Section>

      <Section n={3} title="Term">
        <p>
          The Tenant hereby offers to lease the premises
          {t.term.duration_text ? ` for a term of ${t.term.duration_text},` : ''} commencing{' '}
          <b>{t.term.start_date || '—'}</b> and ending <b>{t.term.end_date || '—'}</b>.
        </p>
      </Section>

      <Section n={4} title="Rent">
        <Field k="Rent" v={`${money(t.rent.amount)} per month, payable in advance on the first day of each month`} />
        <Field k="First rental payment due" v={t.rent.first_payment_date || t.term.start_date} />
        <Field k="Payable to" v={t.rent.payable_to} />
        <Field k="Payment method" v={t.rent.methods} />
      </Section>

      <Section n={5} title="Deposit">
        {t.deposit.amount ? (
          <p>
            The Tenant submits a deposit of {money(t.deposit.amount)}
            {t.deposit.holder ? <> to be held by <b>{t.deposit.holder}</b> (Deposit Holder)</> : null}
            {t.deposit.applied_to_first_last !== false
              ? ', to be credited toward the first and last month\'s rent.'
              : '.'}{' '}
            Under the Residential Tenancies Act, a deposit may not exceed one month's rent and may only be
            applied to the rent for the last rental period (RTA s.105-106).
          </p>
        ) : (
          <p>No deposit is submitted with this offer.</p>
        )}
      </Section>

      <Section n={6} title="Use of Premises">
        <p>
          {t.use.residential_only !== false
            ? 'The premises shall be used for residential purposes only, '
            : 'The premises shall be used '}
          and only by the following occupant(s):{' '}
          <b>{t.use.occupant_names || t.tenant_names.filter(Boolean).join(', ') || '—'}</b>
          {typeof t.use.occupant_count === 'number' && t.use.occupant_count > 0 ? ` (${t.use.occupant_count} occupant${t.use.occupant_count > 1 ? 's' : ''})` : ''}.
        </p>
      </Section>

      <Section n={7} title="Services and Utilities Included in Rent">
        <p>
          <span className="text-neutral-500">Included (paid by the Landlord): </span>
          <span className="font-medium">{includedServices || 'None — all services and utilities are the Tenant\'s responsibility'}</span>
        </p>
        <p className="mt-1 text-[11px] text-neutral-500">
          Any service or utility not listed above is the responsibility of the Tenant.
        </p>
      </Section>

      <Section n={8} title="Chattels Included and Fixtures Rented">
        <Field k="Chattels included" v={t.chattels_included} />
        <Field k="Fixtures rented (e.g. hot water tank)" v={t.fixtures_rented} />
      </Section>

      <Section n={9} title="References and Credit Check">
        <p>
          {t.references_credit_ack !== false
            ? 'The Tenant consents to the Landlord obtaining references and conducting credit and personal information checks as permitted by law, and acknowledges this Agreement is conditional upon the Landlord\'s approval of the same.'
            : 'No references or credit check condition forms part of this Agreement.'}
        </p>
      </Section>

      <Section n={10} title="Irrevocability">
        <p>
          {t.irrevocability_date
            ? <>This offer is irrevocable until <b>{t.irrevocability_date}</b>, after which time, if not accepted, it becomes null and void and the deposit shall be returned in full without interest or deduction.</>
            : 'No irrevocability date is specified.'}
        </p>
      </Section>

      <Section n={11} title="Schedule A — Additional Terms">
        {t.schedule_a ? (
          <p className="whitespace-pre-wrap">{t.schedule_a}</p>
        ) : (
          <p>None.</p>
        )}
        <p className="mt-2 text-[11px] text-neutral-500">
          Any additional term that conflicts with the Residential Tenancies Act, 2006 or takes away a right or
          responsibility under it is void.
        </p>
      </Section>

      <Section n={12} title="Signatures">
        <div className="mt-2 grid grid-cols-2 gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">Landlord (Lessor)</div>
            {landlordSignature ? (
              <>
                <div className="mt-3 border-b border-neutral-800 pb-1 font-serif text-[19px] italic">{landlordSignature.name}</div>
                <div className="mt-1 text-[11px] text-neutral-600">
                  Signed electronically · {new Date(landlordSignature.signed_at).toISOString().replace('T', ' ').slice(0, 16)} UTC
                </div>
              </>
            ) : (
              <div className="mt-3 border-b border-neutral-400 pb-1 text-[13px] text-neutral-400">（待签字 / not yet signed）</div>
            )}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">Tenant (Lessee)</div>
            {tenantSignature ? (
              <>
                <div className="mt-3 border-b border-neutral-800 pb-1 font-serif text-[19px] italic">{tenantSignature.name}</div>
                <div className="mt-1 text-[11px] text-neutral-600">
                  Signed electronically · {new Date(tenantSignature.signed_at).toISOString().replace('T', ' ').slice(0, 16)} UTC
                </div>
              </>
            ) : (
              <div className="mt-3 border-b border-neutral-400 pb-1 text-[13px] text-neutral-400">（待签字 / not yet signed）</div>
            )}
          </div>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-neutral-500">
          The parties agree that electronic signatures on this document are valid under the Electronic Commerce
          Act, 2000 (Ontario). Upon acceptance, this Agreement forms a binding agreement to lease between the
          parties. A copy of this agreement must be provided to the tenant within 21 days after signing. This
          document is retained online permanently and can be viewed or downloaded by either party at any time.
        </p>
      </Section>
    </div>
  )
}
