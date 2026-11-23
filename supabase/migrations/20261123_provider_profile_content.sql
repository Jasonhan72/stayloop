-- 2026-11-23 · A provider's page gets a face and a few words.
--
-- The provider page (/providers/<id>, 2026-11-22) showed facts only: trades, cities, credentials.
-- The agent page beside it has a photo, an introduction and languages. This adds the same three to
-- a provider's record, entered by the provider on /provider/onboard:
--   • bio        — an introduction, up to 800 characters (the agent limit)
--   • languages  — the same language codes the agent profile uses, up to 8
--   • photo_key  — a photo or logo in the public bucket `provider-photos`, key
--                  <provider id>/<id>.webp|jpg. Written ONLY by POST /api/providers/photo with the
--                  service role (the browser crops a 512px square first and never writes storage);
--                  the guard below stops a direct client write, so a row can never be pointed at
--                  another provider's file. The renderer builds the URL from the key, so only our
--                  own bucket is ever shown.
-- None of the three is a registered fact: changing them does not send the record back to pending.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provider-photos', 'provider-photos', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- No storage policy grants authenticated anything: public read by URL, writes via service role.

alter table public.service_providers
  add column if not exists bio text,
  add column if not exists languages text[] not null default '{}',
  add column if not exists photo_key text;

alter table public.service_providers drop constraint if exists service_providers_bio_len;
alter table public.service_providers add constraint service_providers_bio_len
  check (bio is null or char_length(bio) <= 800);
alter table public.service_providers drop constraint if exists service_providers_languages_size;
alter table public.service_providers add constraint service_providers_languages_size
  check (cardinality(languages) <= 8);
alter table public.service_providers drop constraint if exists service_providers_photo_key_format;
alter table public.service_providers add constraint service_providers_photo_key_format
  check (photo_key is null or photo_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9]{8,40}\.(webp|jpg)$');

-- Guard: photo_key joins the fields a direct client write cannot set (the rest as before).
CREATE OR REPLACE FUNCTION public.guard_service_provider_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if public.is_direct_client_write() and not public.is_stayloop_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pending'; new.verified_at := null; new.verified_by := null; new.review_note := null;
      new.photo_key := null;
    else
      new.status := old.status; new.verified_at := old.verified_at; new.verified_by := old.verified_by; new.review_note := old.review_note;
      new.auth_id := old.auth_id;
      new.photo_key := old.photo_key;
      if new.legal_name is distinct from old.legal_name or new.business_number is distinct from old.business_number or new.trades is distinct from old.trades then
        new.status := 'pending'; new.verified_at := null; new.verified_by := null;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $function$
;

-- The directory view carries the three new columns; trailing columns are fine for create or replace,
-- and its privileges (signed-in accounts: select only; anonymous: nothing) are kept.
create or replace view public.provider_directory with (security_invoker = false) as
 select id,
        legal_name,
        trade_name,
        service_cities,
        trades,
        pricing_mode,
        call_out_fee,
        hourly_rate,
        contact_email,
        contact_phone,
        website,
        verified_at,
        status,
        bio,
        languages,
        photo_key
   from public.service_providers
  where status = 'verified'::text;
revoke all on public.provider_directory from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.provider_directory from authenticated;
grant select on public.provider_directory to authenticated, service_role;
