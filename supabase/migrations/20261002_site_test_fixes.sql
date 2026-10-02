-- 2026-10-02 — site-wide test (design/test-plan-2026-09-22.md), data layer (L5).
--
-- L5-D1  attach_household_lease_file (20260803_households.sql) only checked
--        membership and a path prefix. It is SECURITY DEFINER, so the
--        lease_documents field guard (is_direct_client_write) never ran: any
--        member — e.g. the tenant of a verified, e-signed tenancy — could point
--        the lease's pdf_path at a file they uploaded into the household folder,
--        and the landlord lease page shows that as "the imported lease file".
--        The RPC exists for the import flow only (importer attaches the file
--        right after create_household_import, or while correcting it). It now
--        has the same lock as update_household_import: the caller is the
--        importer, the household is still an unverified import, the other side
--        has not joined, and the current lease is still an unsent, unsigned
--        'imported' row. Success writes an audit event. The import page ignores
--        this RPC's error, so a rejected attach just leaves the upload in the
--        household folder unlinked.
--
-- L5-D2  A screening abandoned by the browser (tab closed, upload failed before
--        /api/screen-score) stays in 'uploading' forever — screen-score's own
--        catch only marks rows it loaded. Daily sweep: rows still 'uploading' or
--        'scoring' 24 h after their last update become status 'error' with a
--        reason. Service role / pg_cron only.

-- ── L5-D1 ────────────────────────────────────────────────────────────────────
create or replace function public.attach_household_lease_file(p_household uuid, p_path text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  h record;
  v_lease uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_household_member(p_household) then raise exception 'not a member'; end if;
  if p_path is null or p_path !~ ('^' || p_household::text || '/') then raise exception 'path outside household'; end if;

  select * into h from public.households where id = p_household for update;
  if not found then raise exception 'not found'; end if;
  if h.created_by is distinct from v_uid then raise exception 'not_importer'; end if;
  if h.verified then raise exception 'household_verified'; end if;
  if h.source <> 'imported' then raise exception 'not_imported'; end if;
  if exists (select 1 from public.household_members m
              where m.household_id = p_household and m.user_id <> v_uid and m.status = 'active') then
    raise exception 'counterparty_joined';
  end if;

  update public.lease_documents
     set pdf_path = p_path
   where id = h.current_lease_id
     and status = 'imported'
     and sent_at is null and landlord_signature is null and tenant_signature is null
  returning id into v_lease;
  if v_lease is null then raise exception 'lease_not_editable'; end if;

  insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (v_uid, 'user', 'household_lease_file_attached', 'household', p_household,
          jsonb_build_object('lease_id', v_lease, 'path', p_path));
end $$;
revoke all on function public.attach_household_lease_file(uuid, text) from public, anon;
grant execute on function public.attach_household_lease_file(uuid, text) to authenticated;

-- ── L5-D2 ────────────────────────────────────────────────────────────────────
create or replace function public.screening_stuck_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_upload int := 0;
  n_score int := 0;
begin
  with x as (
    update public.screenings
       set status = 'error',
           error = 'abandoned_upload: no scoring request arrived within 24 h (auto sweep)'
     where status = 'uploading'
       and coalesce(updated_at, created_at) < now() - interval '24 hours'
    returning 1
  ) select count(*) into n_upload from x;

  with x as (
    update public.screenings
       set status = 'error',
           error = 'scoring_timeout: still scoring 24 h after the last update (auto sweep)'
     where status = 'scoring'
       and coalesce(updated_at, created_at) < now() - interval '24 hours'
    returning 1
  ) select count(*) into n_score from x;

  return jsonb_build_object('abandoned_upload', n_upload, 'scoring_timeout', n_score);
end $$;
revoke all on function public.screening_stuck_sweep() from public, anon, authenticated;
grant execute on function public.screening_stuck_sweep() to service_role;

select cron.unschedule('screening-stuck-sweep') where exists (select 1 from cron.job where jobname = 'screening-stuck-sweep');
select cron.schedule('screening-stuck-sweep', '25 13 * * *', $$select public.screening_stuck_sweep()$$);
