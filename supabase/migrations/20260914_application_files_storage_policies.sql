-- Full-site review 2026-09-14: the public apply flow uploads the applicant's
-- documents to tenant-files/<application_id>/<kind>/<file>, but the only
-- INSERT policy on the bucket covered screenings/<uid>/… for signed-in
-- landlords, and the only SELECT policy the same prefix — so anonymous
-- applicants could not upload and landlords could not sign URLs for the
-- files (app/api/file-url). Two SECURITY DEFINER helpers (RLS on
-- applications would hide the row from anon inside a policy) and two
-- narrow policies: upload only into a fresh, still-empty application;
-- read only for the landlord whose listing the application targets.

create or replace function public.application_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_first text := (storage.foldername(p_name))[1];
  v_kind text := (storage.foldername(p_name))[2];
begin
  if v_first is null or v_first !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if v_kind is null or v_kind !~ '^[a-z_]{1,32}$' then return false; end if;
  if array_length(storage.foldername(p_name), 1) <> 2 then return false; end if;
  return exists (
    select 1 from public.applications a
     where a.id = v_first::uuid
       and a.created_at > now() - interval '1 hour'
       and (a.files is null or a.files = '[]'::jsonb)
  );
end $$;
revoke execute on function public.application_upload_allowed(text) from public;
grant execute on function public.application_upload_allowed(text) to anon, authenticated, service_role;

create or replace function public.application_file_readable(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_first text := (storage.foldername(p_name))[1];
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if v_first is null or v_first !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return exists (
    select 1 from public.applications a
      join public.listings l on l.id = a.listing_id
      join public.landlords ld on ld.id = l.landlord_id
     where a.id = v_first::uuid
       and (ld.auth_id = v_uid or ld.id = v_uid)
  );
end $$;
revoke execute on function public.application_file_readable(text) from public;
grant execute on function public.application_file_readable(text) to anon, authenticated, service_role;

drop policy if exists tenant_files_applicant_insert on storage.objects;
create policy tenant_files_applicant_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'tenant-files' and public.application_upload_allowed(name));

drop policy if exists tenant_files_listing_landlord_select on storage.objects;
create policy tenant_files_listing_landlord_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tenant-files' and public.application_file_readable(name));

-- Permissive storage policies are OR'ed and Postgres may evaluate any of
-- them first: the tenancy-files policies call is_household_member(), which
-- anon could not EXECUTE, so an anonymous upload into tenant-files errored
-- with "permission denied for function" before our policy was consulted.
-- The helper returns false for anon (auth.uid() is null) — harmless to grant.
grant execute on function public.is_household_member(uuid) to anon;
