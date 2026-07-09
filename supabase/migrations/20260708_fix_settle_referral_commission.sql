-- Repair settle_referral_commission: the 20260608_security_fixes rewrite kept the
-- auth hardening but inserted columns that never existed (commission.gross_amount/
-- platform_fee/net_amount, invoice.commission_id/status) and set referral.status to
-- 'settled', which the CHECK constraint rejects — every call raised. This version
-- keeps the security posture (auth + ownership + status gate) on the real schema.
--
-- Semantics: to_brokerage closes the deal and owes the 25% referral fee
-- (payer_brokerage_id = to_brokerage, payee = stayloop_brokerage). The payer's
-- owner records the settlement. ComplianceGuard: fees only flow between
-- RECO-registered brokerages, so both sides must be registered.

create or replace function public.settle_referral_commission(ref_id uuid, gross numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_from   record;
  v_to     record;
  v_fee    numeric;
  v_agr_id uuid;
  v_com    record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into r from referral where id = ref_id;
  if r is null then
    raise exception 'referral not found';
  end if;

  -- Idempotent: one commission per referral (unique referral_id)
  select * into v_com from commission where referral_id = ref_id;
  if v_com is not null then
    return jsonb_build_object(
      'commission_id', v_com.id,
      'fee_amount', v_com.fee_amount,
      'referral_rate', v_com.referral_rate,
      'already_settled', true
    );
  end if;

  select * into v_to from brokerages where id = r.to_brokerage_id;
  if v_to is null or v_to.owner_id <> auth.uid() then
    raise exception 'not authorized: you do not own the paying brokerage';
  end if;

  if r.status <> 'closed' then
    raise exception 'referral must be in closed status to settle';
  end if;

  if gross is null or gross <= 0 then
    raise exception 'gross commission must be positive';
  end if;

  select * into v_from from brokerages where id = r.from_brokerage_id;
  if v_from is null or not v_from.registered or not v_to.registered then
    raise exception 'ComplianceGuard: both brokerages must be RECO-registered';
  end if;

  insert into referral_agreement (referral_id, closed_at, gross_commission, currency)
  values (ref_id, now(), gross, 'CAD')
  returning id into v_agr_id;

  v_fee := round(gross * 0.25, 2);

  insert into commission (referral_id, agreement_id, referral_rate, fee_amount, payer_brokerage_id, payee)
  values (ref_id, v_agr_id, 0.250, v_fee, r.to_brokerage_id, 'stayloop_brokerage')
  returning * into v_com;

  update referral set status = 'commission_due', updated_at = now() where id = ref_id;

  insert into invoice (account_id, kind, amount, hst, currency)
  values (v_to.owner_id, 'commission', v_fee, round(v_fee * 0.13, 2), 'CAD');

  return jsonb_build_object(
    'commission_id', v_com.id,
    'gross', gross,
    'fee_amount', v_fee,
    'referral_rate', 0.250
  );
end;
$$;

revoke all on function public.settle_referral_commission(uuid, numeric) from public, anon;
grant execute on function public.settle_referral_commission(uuid, numeric) to authenticated;
