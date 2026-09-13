-- 2026-09-13 review: screenings_owner_delete matched only legacy profileId
-- rows; rows inserted since v5 carry auth.users.id in landlord_id, so a
-- landlord could not delete their own screening through RLS at all.
-- Same dual-ID rule as the select/update pair.
DROP POLICY IF EXISTS screenings_owner_delete ON public.screenings;
CREATE POLICY screenings_owner_delete ON public.screenings FOR DELETE
  USING (
    landlord_id = auth.uid()
    OR landlord_id IN (SELECT id FROM public.landlords WHERE auth_id = auth.uid())
  );
