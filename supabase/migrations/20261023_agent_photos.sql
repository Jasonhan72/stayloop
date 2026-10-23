-- Agent profile photo (2026-10-23, the item left over from the public agent pages of
-- 2026-10-21). The agent uploads a photo of themselves on /agent/verify; it shows on
-- /agents, /agents/<slug> and the agent-picker cards. Same shape as assistant avatars:
-- a public bucket written ONLY by the route (service role) — the browser downsizes to a
-- 512px square first and never writes storage — and a short key on the profile row
-- (<uid>/<id>.webp|jpg) from which the renderer builds the URL, so only our own bucket
-- can ever be shown. The key is protected by the profile guard: a direct client update
-- cannot point it at another agent's file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agent-photos', 'agent-photos', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- No storage policy grants authenticated anything: public read by URL, writes via service role.

alter table public.agent_profiles add column if not exists photo_key text;
alter table public.agent_profiles drop constraint if exists agent_profiles_photo_key_format;
alter table public.agent_profiles add constraint agent_profiles_photo_key_format
  check (photo_key is null or photo_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9]{8,40}\.(webp|jpg)$');

-- Guard: photo_key joins the fields only the server may set (everything else as 20261001).
create or replace function public.guard_agent_profile_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_stayloop_admin() then
    new.updated_at := now();
    return new;
  end if;
  new.status      := old.status;
  new.verified_at := old.verified_at;
  new.verified_by := old.verified_by;
  new.review_note := old.review_note;
  new.photo_key   := old.photo_key;
  if (new.legal_name, new.reco_number, new.brokerage_name, new.category, coalesce(new.expires_at, date '1900-01-01'))
     is distinct from
     (old.legal_name, old.reco_number, old.brokerage_name, old.category, coalesce(old.expires_at, date '1900-01-01')) then
    new.status      := 'pending';
    new.verified_at := null;
    new.verified_by := null;
  elsif old.status in ('rejected', 'expired')
     and (new.trade_name, new.business_email, new.business_phone, new.crea_member, new.attested_at)
         is distinct from
         (old.trade_name, old.business_email, old.business_phone, old.crea_member, old.attested_at) then
    new.status      := 'pending';
    new.verified_at := null;
    new.verified_by := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.guard_agent_profile_fields() from public, anon, authenticated, service_role;

-- The directory view (picker cards) carries the photo key too; a new trailing column is fine for create or replace.
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
        case when ap.public_profile then ap.profile_slug end as profile_slug,
        ap.photo_key
   from public.agent_profiles ap
   left join public.landlords l on l.auth_id = ap.auth_id
  where ap.status = any (array['verified'::text, 'renewal_due'::text])
    and (ap.expires_at is null or ap.expires_at >= current_date);
revoke insert, update, delete, truncate on public.agent_directory from public, anon, authenticated;
grant select on public.agent_directory to anon, authenticated;
