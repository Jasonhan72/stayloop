-- Align public.listings with the Realtor.ca / CREA DDF listing data model so
-- imported external listings keep their full structure. All columns nullable —
-- purely additive. Field naming follows DDF, snake_cased.
--
-- Mapping (DDF → column):
--   Building Type            → property_type        (already added 20260707)
--   Title / OwnershipType    → ownership_title      ('condominium'|'freehold'|...)
--   Bedrooms Above/BelowGrade→ bedrooms_above_grade / bedrooms_below_grade ("3+1")
--   BathroomsHalf            → bathrooms_half
--   SizeInterior (range max) → sqft_max             (sqft keeps the lower bound)
--   Storeys                  → storeys
--   Land Size                → land_size
--   HeatingType / HeatingFuel→ heating_type / heating_fuel
--   Cooling                  → cooling
--   BasementType+Development → basement_type
--   ExteriorFinish           → exterior_finish
--   AppliancesIncluded       → appliances           (jsonb array)
--   BuildingFeatures         → building_features    (jsonb array; amenities stays)
--   PetsAllowed              → pets_allowed         ('yes'|'no'|'restricted')
--   ParkingSpacesTotal       → parking_spaces       (parking keeps the type text)
--   MaintenanceFee           → maintenance_fee      (monthly $)
--   ManagementCompany        → management_company
--   CrossStreets             → cross_streets
--   Furnished                → furnished
--   Rental: deposit / term   → deposit / lease_term
--   AlternateURL (tour)      → virtual_tour_url

alter table public.listings
  add column if not exists ownership_title text,
  add column if not exists bedrooms_above_grade integer,
  add column if not exists bedrooms_below_grade integer,
  add column if not exists bathrooms_half integer,
  add column if not exists sqft_max integer,
  add column if not exists storeys numeric,
  add column if not exists land_size text,
  add column if not exists heating_type text,
  add column if not exists heating_fuel text,
  add column if not exists cooling text,
  add column if not exists basement_type text,
  add column if not exists exterior_finish text,
  add column if not exists appliances jsonb,
  add column if not exists building_features jsonb,
  add column if not exists pets_allowed text
    check (pets_allowed in ('yes','no','restricted')),
  add column if not exists parking_spaces integer,
  add column if not exists maintenance_fee integer,
  add column if not exists management_company text,
  add column if not exists cross_streets text,
  add column if not exists furnished boolean,
  add column if not exists deposit integer,
  add column if not exists lease_term text,
  add column if not exists virtual_tour_url text;

-- Ownership follows building type for the existing rows.
update public.listings set ownership_title = 'freehold'
  where ownership_title is null and property_type in ('house','townhouse','duplex');
update public.listings set ownership_title = 'condominium'
  where ownership_title is null and property_type in ('apartment','condo');
