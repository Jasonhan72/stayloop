'use client'

// Renderer for the Ontario Standard Form of Lease (2229E structure).
// Pure display: give it terms + signatures and it renders the document —
// used by the drafting preview, the tenant signing page, the landlord
// detail page, and the print/PDF backup (window.print with print styles).
// The printed document is clean English (the official form's language);
// on-screen chrome may add zh hints with `print:hidden`.
import type { OntarioLeaseTerms, LeaseSignature } from '@/lib/lease/ontario'

const utilLabel = (v: 'landlord' | 'tenant') => (v === 'landlord' ? 'Landlord' : 'Tenant')

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

export default function OntarioLeaseDoc({
  terms,
  landlordSignature,
  tenantSignature,
  status,
}: {
  terms: OntarioLeaseTerms
  landlordSignature?: LeaseSignature | null
  tenantSignature?: LeaseSignature | null
  status?: string
}) {
  const t = terms
  const money = (n?: number | null) =>
    typeof n === 'number' && isFinite(n) ? `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2 })}` : '—'
  const fullySigned = !!landlordSignature && !!tenantSignature

  return (
    <div className="mx-auto max-w-[820px] bg-white p-8 text-neutral-900 print:p-0" id="lease-doc">
      {/* Header */}
      <div className="border-b-2 border-neutral-900 pb-4">
        <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">
          Ontario — Residential Tenancy Agreement (Standard Form of Lease)
        </div>
        <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">Residential Tenancy Agreement</h1>
        <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-600">
          This tenancy agreement is governed by the <i>Residential Tenancies Act, 2006</i> (Ontario). Any term
          that conflicts with the Act or is inconsistent with this mandatory standard form is void and
          unenforceable. 本租约受安省《住宅租赁法》约束；与该法冲突的条款无效。
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
        <Field k="Landlord (legal name)" v={t.landlord_legal_name} />
        <Field k="Tenant(s)" v={t.tenant_names.filter(Boolean).join(', ')} />
      </Section>

      <Section n={2} title="Rental Unit">
        <Field k="Address" v={[t.unit.street, t.unit.unit ? `Unit ${t.unit.unit}` : null, t.unit.city, 'Ontario', t.unit.postal].filter(Boolean).join(', ')} />
        <Field k="Parking" v={t.unit.parking || 'None included'} />
        <Field k="Condominium" v={t.unit.is_condo ? 'Yes — tenant agrees to comply with the condominium declaration, by-laws and rules' : 'No'} />
      </Section>

      <Section n={3} title="Contact Information">
        <Field k="Address for notices to landlord" v={t.contact.landlord_notice_address} />
        <Field k="Landlord email" v={t.contact.landlord_email} />
        <Field k="Email for notices" v={t.contact.email_consent ? 'Both parties agree to receive notices and documents by email where the Act allows' : 'Not agreed'} />
      </Section>

      <Section n={4} title="Term of Tenancy Agreement">
        <Field k="Start date" v={t.term.start_date} />
        <Field
          k="Term"
          v={t.term.type === 'fixed' ? `Fixed term ending ${t.term.end_date || '—'} (continues month-to-month after unless renewed or properly ended)` : 'Month-to-month'}
        />
      </Section>

      <Section n={5} title="Rent">
        <Field k="Base rent" v={`${money(t.rent.amount)} per month`} />
        {typeof t.rent.parking_amount === 'number' && t.rent.parking_amount > 0 && <Field k="Parking" v={`${money(t.rent.parking_amount)} per month`} />}
        <Field k="Rent is due on" v={t.rent.due_day} />
        <Field k="Payable to" v={t.rent.payable_to} />
        <Field k="Payment method" v={t.rent.methods} />
        {typeof t.rent.nsf_charge === 'number' && t.rent.nsf_charge > 0 && (
          <Field k="NSF administration charge" v={`${money(t.rent.nsf_charge)} plus bank charges (max $20 admin under the Act)`} />
        )}
      </Section>

      <Section n={6} title="Services and Utilities">
        <div className="grid grid-cols-2 gap-x-6">
          <Field k="Electricity paid by" v={utilLabel(t.utilities.electricity)} />
          <Field k="Heat paid by" v={utilLabel(t.utilities.heat)} />
          <Field k="Water paid by" v={utilLabel(t.utilities.water)} />
        </div>
        <div className="mt-2">
          <span className="text-neutral-500">Included services: </span>
          <span className="font-medium">
            {[
              t.services.gas && 'Gas',
              t.services.air_conditioning && 'Air conditioning',
              t.services.storage && 'Storage',
              t.services.laundry_in_unit && 'In-unit laundry',
              t.services.guest_parking && 'Guest parking',
              t.services.other,
            ].filter(Boolean).join(', ') || 'None specified'}
          </span>
        </div>
      </Section>

      <Section n={7} title="Rent Discounts">
        {t.rent_discounts ? <p>{t.rent_discounts}</p> : <p>No rent discount.</p>}
      </Section>

      <Section n={8} title="Rent Deposit (Last Month's Rent)">
        {t.rent_deposit ? (
          <p>
            The tenant will pay a rent deposit of {money(t.rent_deposit)}. It may only be applied to the rent
            for the last rental period, and the landlord must pay the tenant interest on it every 12 months at
            the guideline rate (RTA s.106).
          </p>
        ) : (
          <p>No rent deposit is required.</p>
        )}
      </Section>

      <Section n={9} title="Key Deposit">
        {t.key_deposit ? (
          <p>
            Refundable key deposit of {money(t.key_deposit)} — refunded when the tenant returns the keys; it
            cannot exceed the actual replacement cost (RTA s.105).
          </p>
        ) : (
          <p>No key deposit.</p>
        )}
      </Section>

      <Section n={10} title="Smoking">
        <p>{t.smoking_rules || 'No additional smoking rules. Smoking rules under other laws (e.g. Smoke-Free Ontario Act) still apply.'}</p>
      </Section>

      <Section n={11} title="Tenant's Insurance">
        <p>
          {t.tenant_insurance_required
            ? 'The tenant must have liability insurance and provide proof when the landlord asks.'
            : 'The tenant is not required to have tenant insurance under this agreement.'}
        </p>
      </Section>

      <Section n={12} title="Changes to the Rental Unit, Maintenance, and Rights (Statutory)">
        <ul className="list-disc space-y-1 pl-5">
          <li>The landlord must keep the unit in a good state of repair and comply with health, safety and maintenance standards (RTA s.20), even if the tenant knew of problems before moving in.</li>
          <li>The tenant may install decorative items and must repair damage beyond normal wear and tear.</li>
          <li>The landlord may only enter the unit as the Act allows — generally with 24 hours' written notice.</li>
          <li>Rent may only be increased once every 12 months, with 90 days' written notice, within the provincial guideline unless the unit is exempt or the Board orders otherwise.</li>
          <li>Subletting or assignment requires the landlord's consent, which cannot be arbitrarily or unreasonably withheld (RTA s.95-97).</li>
        </ul>
      </Section>

      <Section n={13} title="Additional Terms">
        {t.additional_terms ? (
          <p className="whitespace-pre-wrap">{t.additional_terms}</p>
        ) : (
          <p>None.</p>
        )}
        <p className="mt-2 text-[11px] text-neutral-500">
          Any additional term that conflicts with the Residential Tenancies Act, 2006 or takes away a right or
          responsibility under it is void.
        </p>
      </Section>

      <Section n={14} title="Signatures">
        <div className="mt-2 grid grid-cols-2 gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">Landlord</div>
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
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">Tenant</div>
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
          Act, 2000 (Ontario). All of the terms above form the tenancy agreement between the parties. A copy of
          this agreement must be provided to the tenant within 21 days after signing. This document is retained
          online permanently and can be viewed or downloaded by either party at any time.
        </p>
      </Section>
    </div>
  )
}
