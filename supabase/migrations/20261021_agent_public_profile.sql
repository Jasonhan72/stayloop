-- 2026-10-21 — public agent profile pages (/agents, /agents/<slug>), modelled on
-- HouseSigma's agent pages but built only from Stayloop's own data (no MLS).
--
-- Opt-in: nothing is public until the agent turns public_profile on, and the pages
-- only ever show verified, live registrations (same filter as agent_directory).
-- The agent edits these columns through the existing self-update policy; none of
-- them is a trust field, so guard_agent_profile_fields leaves verification alone.
alter table public.agent_profiles
  add column if not exists public_profile boolean not null default false,
  add column if not exists profile_slug   text,
  add column if not exists bio            text,
  add column if not exists languages      text[] not null default '{}',
  add column if not exists service_areas  text[] not null default '{}',
  add column if not exists focus          text[] not null default '{}',
  add column if not exists show_activity  boolean not null default false;

alter table public.agent_profiles drop constraint if exists agent_profiles_slug_format;
alter table public.agent_profiles add constraint agent_profiles_slug_format
  check (profile_slug is null or profile_slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$');
alter table public.agent_profiles drop constraint if exists agent_profiles_public_needs_slug;
alter table public.agent_profiles add constraint agent_profiles_public_needs_slug
  check (not public_profile or profile_slug is not null);
alter table public.agent_profiles drop constraint if exists agent_profiles_bio_len;
alter table public.agent_profiles add constraint agent_profiles_bio_len
  check (bio is null or char_length(bio) <= 800);
alter table public.agent_profiles drop constraint if exists agent_profiles_list_sizes;
alter table public.agent_profiles add constraint agent_profiles_list_sizes
  check (cardinality(languages) <= 8 and cardinality(service_areas) <= 12 and cardinality(focus) <= 6);

create unique index if not exists agent_profiles_profile_slug_key on public.agent_profiles (profile_slug) where profile_slug is not null;

-- The public directory view also carries the slug — only for agents who published.
create or replace view public.agent_directory with (security_invoker = false) as
 select ap.auth_id,
        l.id as landlord_id,
        ap.legal_name,
        ap.reco_number,
        ap.category,
        ap.brokerage_name,
        ap.business_email,
        ap.business_phone,
        ap.crea_member,
        ap.verified_at,
        ap.status,
        case when ap.public_profile then ap.profile_slug end as profile_slug
   from public.agent_profiles ap
   left join public.landlords l on l.auth_id = ap.auth_id
  where ap.status = any (array['verified'::text, 'renewal_due'::text])
    and (ap.expires_at is null or ap.expires_at >= current_date);
revoke insert, update, delete, truncate on public.agent_directory from public, anon, authenticated;
grant select on public.agent_directory to anon, authenticated;
