-- Code review 2026-11-15 (design/code-review-2026-11-15.md): the database half of
-- S0-1, S1-1 and S1-2.

-- ── S0-1 · lease_documents.tenant_email must look like one email address ──────
-- /api/matters/export spliced rental_matters.tenant_email (copied from here by
-- ensure_matter) into a service-role PostgREST or=(…) string; a comma in it
-- added conditions and listed every delegation. The route now uses
-- parameterised queries; this keeps the text itself sane at the one place a
-- landlord types it. No whitespace, comma or bracket (0 existing rows fail).
-- rental_matters gets no constraint on purpose: ensure_matter also copies
-- applicants' own emails, and a violation there would break my_matters().
alter table public.lease_documents
  add constraint lease_documents_tenant_email_shape
  check (tenant_email is null or tenant_email ~ '^[^\s,()@]+@[^\s,()@]+\.[^\s,()@]+$');

-- ── S1-1 · search_ltb_orders: same people as tenant screening ─────────────────
-- The function is SECURITY DEFINER over ltb_orders (no client SELECT) and was
-- executable by every signed-in account with no identity check: a tenant-only
-- account could look anyone up by name, past the screening role gate
-- (guard_screening_role / lib/screening/roleGate.ts). Its callers run with the
-- caller's JWT, so the check lives in the body: landlord hat, a RECO agent
-- whose registration is live, or a Stayloop admin. A call without a user id
-- (service role, cron, SQL console) is unaffected — anon has no EXECUTE.
-- Raises rather than returning nothing: an empty result would read as "no LTB
-- record"; lib/ltb/search.ts reports an rpc error as "check unavailable".
create or replace function public.search_ltb_orders(p_name text, p_key text, p_postals text[] default '{}'::text[], p_street_keys text[] default '{}'::text[], p_limit integer default 25)
 returns table(file_number text, document_id text, order_date date, application_codes text[], application_type text, document_type text, party_side text, role text, person_name text, unit_address text, order_pdf_url text, match_kind text, similarity real, address_match boolean)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_tokens text[] := string_to_array(p_name, ' ');
  v_hats jsonb;
begin
  if auth.uid() is not null then
    v_hats := public.my_hats();
    -- Every term is coalesced: a tenant's agent status is NULL, and `NULL in (…)` made the
    -- whole test NULL — which an IF treats as false, letting the caller through (caught by
    -- the trial run before this was applied).
    if not coalesce((v_hats ->> 'landlord')::boolean, false)
       and coalesce(v_hats ->> 'agent', '') not in ('verified', 'renewal_due')
       and not coalesce((v_hats ->> 'admin')::boolean, false) then
      raise exception 'screening_requires_landlord_or_agent'
        using errcode = '42501',
              hint = 'The LTB order catalogue is searched as part of tenant screening: landlords and RECO agents whose registration is verified.';
    end if;
  end if;

  if length(coalesce(p_name, '')) < 5 or position(' ' in p_name) = 0 then
    return;
  end if;

  -- plpgsql rather than SQL purely so this can run: Supabase does not permit a
  -- function-level SET of pg_trgm.similarity_threshold, but set_limit() is
  -- callable. Raising it to 0.85 makes `%` mean exactly what the old fuzzy
  -- branch meant, so the trigram index returns a handful of rows instead of a
  -- thousand it then has to re-filter.
  perform set_limit(0.85);

  return query
  select o.file_number, o.document_id, o.order_date, o.application_codes,
         o.application_type, o.document_type, o.party_side, o.role, o.person_name,
         o.unit_address, o.order_pdf_url,
         case when o.person_norm = p_name then 'exact'
              when o.person_key  = p_key  then 'reordered'
              when string_to_array(o.person_norm, ' ') @> v_tokens
                or string_to_array(o.person_norm, ' ') <@ v_tokens then 'subset'
              else 'fuzzy' end,
         similarity(o.person_norm, p_name),
         (
           (o.address_postal is not null and o.address_postal = any(p_postals))
           or (o.address_norm is not null and o.address_norm = any(p_street_keys))
         )
  from public.ltb_orders o
  where
        o.person_norm = p_name                                  -- btree
     or o.person_key  = p_key                                   -- btree
     or string_to_array(o.person_norm, ' ') @> v_tokens         -- gin
     or string_to_array(o.person_norm, ' ') <@ v_tokens         -- gin
     or o.person_norm % p_name                                  -- gin_trgm, now >= 0.85
  order by
    (o.address_postal is not null and o.address_postal = any(p_postals)) desc,
    similarity(o.person_norm, p_name) desc,
    o.order_date desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$function$;
revoke execute on function public.search_ltb_orders(text, text, text[], text[], integer) from public, anon;
grant execute on function public.search_ltb_orders(text, text, text[], text[], integer) to authenticated, service_role;

-- ── S1-2 · a landlord cannot delete their own landlords row ───────────────────
-- "Landlords see own profile" was FOR ALL, so it allowed DELETE. Deleting the
-- row and claiming again minted a fresh 30-day Pro trial and one unlock credit
-- (20261012_pro_trial grants both on insert), and listings.landlord_id is
-- ON DELETE CASCADE, so the same request silently removed every listing.
-- SELECT stays with "Landlords read own row", INSERT with "Users can create own
-- landlord row", claim-by-email with its own UPDATE policy; this leaves UPDATE
-- of one's own row (billing columns are frozen by their guard trigger).
-- Account removal goes through admin_delete_user (definer).
drop policy if exists "Landlords see own profile" on public.landlords;
create policy "Landlords update own profile" on public.landlords
  for update to authenticated
  using (auth.uid() = auth_id)
  with check (auth.uid() = auth_id);
revoke delete, truncate on public.landlords from anon, authenticated;
