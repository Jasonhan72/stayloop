-- =============================================================
-- Stayloop V5.3 — Billing / monetization (handbook §09 + billing-spec).
-- Two revenue lines: subscription (free/$19/$39) + 25% post-close
-- commission (brokerage↔brokerage). ComplianceGuard enforced in the
-- settle_referral_commission RPC: receiving side must be a registered
-- brokerage; rate fixed at 25%; tenants never pay a transaction fee.
-- Additive — none of these tables existed before.
-- =============================================================

create table if not exists public.brokerages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registered boolean not null default false,
  stripe_connect_id text,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.subscription (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('tenant','landlord','agent')),
  plan text not null default 'free' check (plan in ('free','plus','pro','premium','team','portfolio')),
  stripe_sub_id text,
  status text not null default 'active' check (status in ('active','past_due','canceled','grace')),
  interval text not null default 'month' check (interval in ('month','year')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, role)
);

create table if not exists public.referral (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  listing_id uuid,
  from_brokerage_id uuid references public.brokerages(id),
  to_brokerage_id uuid references public.brokerages(id),
  status text not null default 'referred'
    check (status in ('referred','agreement_signed','showing','closed','commission_due','fee_settled','expired','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_agreement (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referral(id) on delete cascade,
  closed_at timestamptz not null default now(),
  gross_commission numeric(12,2) not null check (gross_commission >= 0),
  currency text not null default 'CAD'
);

create table if not exists public.commission (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referral(id),
  agreement_id uuid references public.referral_agreement(id),
  referral_rate numeric(4,3) not null default 0.250,
  fee_amount numeric(12,2) not null,
  payer_brokerage_id uuid references public.brokerages(id),
  payee text not null default 'stayloop_brokerage',
  stripe_transfer_id text,
  immutable boolean not null default true,
  created_at timestamptz not null default now(),
  unique (referral_id)
);

create table if not exists public.invoice (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('subscription','commission')),
  amount numeric(12,2) not null,
  hst numeric(12,2) not null default 0,
  currency text not null default 'CAD',
  pdf_url text,
  created_at timestamptz not null default now()
);

alter table public.brokerages        enable row level security;
alter table public.subscription      enable row level security;
alter table public.referral          enable row level security;
alter table public.referral_agreement enable row level security;
alter table public.commission        enable row level security;
alter table public.invoice           enable row level security;

drop policy if exists "subscription_self" on public.subscription;
create policy "subscription_self" on public.subscription for all using (account_id = auth.uid()) with check (account_id = auth.uid());
drop policy if exists "invoice_self" on public.invoice;
create policy "invoice_self" on public.invoice for select using (account_id = auth.uid());
drop policy if exists "brokerages_owner" on public.brokerages;
create policy "brokerages_owner" on public.brokerages for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "referral_party" on public.referral;
create policy "referral_party" on public.referral for select using (
  from_brokerage_id in (select id from public.brokerages where owner_id = auth.uid())
  or to_brokerage_id in (select id from public.brokerages where owner_id = auth.uid()));
drop policy if exists "agreement_party" on public.referral_agreement;
create policy "agreement_party" on public.referral_agreement for select using (
  referral_id in (select id from public.referral where
    from_brokerage_id in (select id from public.brokerages where owner_id = auth.uid())
    or to_brokerage_id in (select id from public.brokerages where owner_id = auth.uid())));
drop policy if exists "commission_party" on public.commission;
create policy "commission_party" on public.commission for select using (
  payer_brokerage_id in (select id from public.brokerages where owner_id = auth.uid()));

-- Entitlements derived from plan — business code queries this, not plan name.
create or replace function public.get_entitlements(p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_plan text;
begin
  if v_user is null then return '{}'::jsonb; end if;
  select plan into v_plan from public.subscription where account_id = v_user and role = p_role;
  v_plan := coalesce(v_plan, 'free');
  if p_role = 'tenant' then
    return jsonb_build_object('transaction_fee', 0, 'plan', v_plan,
      'proactive_alerts', v_plan in ('plus','pro'), 'cross_city', v_plan = 'pro');
  elsif p_role = 'landlord' then
    return jsonb_build_object('plan', v_plan, 'rent_collection', true,
      'full_screening', v_plan in ('pro','premium'), 'lease_drafting', v_plan in ('pro','premium'),
      'listing_limit', case v_plan when 'free' then 1 else 999 end,
      'commission_panel', v_plan = 'premium', 'next_day_payout', v_plan = 'premium');
  else
    return jsonb_build_object('plan', v_plan, 'referral_receive', true, 'referral_settle', true,
      'priority', v_plan in ('pro','team'), 'team', v_plan = 'team');
  end if;
end $$;
grant execute on function public.get_entitlements(text) to authenticated;

-- 25% commission engine + ComplianceGuard. Idempotent on referral.
create or replace function public.settle_referral_commission(p_referral_id uuid, p_gross numeric)
returns public.commission language plpgsql security definer set search_path = public as $$
declare v_ref public.referral; v_to public.brokerages; v_agr public.referral_agreement; v_com public.commission; v_fee numeric;
begin
  select * into v_com from public.commission where referral_id = p_referral_id;
  if found then return v_com; end if;
  select * into v_ref from public.referral where id = p_referral_id;
  if not found then raise exception 'referral not found'; end if;
  if p_gross is null or p_gross < 0 then raise exception 'invalid gross commission'; end if;
  select * into v_to from public.brokerages where id = v_ref.to_brokerage_id;
  if not found or v_to.registered is not true then
    raise exception 'ComplianceGuard: receiving brokerage must be a registered brokerage';
  end if;
  insert into public.referral_agreement (referral_id, gross_commission) values (p_referral_id, p_gross) returning * into v_agr;
  v_fee := round(p_gross * 0.25, 2);
  insert into public.commission (referral_id, agreement_id, referral_rate, fee_amount, payer_brokerage_id)
  values (p_referral_id, v_agr.id, 0.250, v_fee, v_ref.to_brokerage_id) returning * into v_com;
  update public.referral set status = 'commission_due', updated_at = now() where id = p_referral_id;
  insert into public.invoice (account_id, kind, amount, currency) values (v_to.owner_id, 'commission', v_fee, v_agr.currency);
  return v_com;
end $$;
grant execute on function public.settle_referral_commission(uuid, numeric) to authenticated;
