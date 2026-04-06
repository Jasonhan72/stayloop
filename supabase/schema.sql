-- Stayloop Database Schema
-- Run this in your Supabase SQL editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS landlords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  landlord_id UUID REFERENCES landlords(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  unit TEXT,
  city TEXT DEFAULT 'Toronto',
  province TEXT DEFAULT 'ON',
  monthly_rent INTEGER NOT NULL,
  bedrooms INTEGER,
  bathrooms NUMERIC(2,1),
  available_date DATE,
  slug TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  date_of_birth DATE,
  current_address TEXT,
  employment_status TEXT,
  employer_name TEXT,
  job_title TEXT,
  monthly_income INTEGER,
  employment_start_date DATE,
  employer_phone TEXT,
  employer_email TEXT,
  prev_landlord_name TEXT,
  prev_landlord_phone TEXT,
  prev_address TEXT,
  prev_rent INTEGER,
  prev_move_in DATE,
  prev_move_out DATE,
  reason_for_leaving TEXT,
  num_occupants INTEGER DEFAULT 1,
  has_pets BOOLEAN DEFAULT FALSE,
  pet_details TEXT,
  is_smoker BOOLEAN DEFAULT FALSE,
  move_in_date DATE,
  additional_notes TEXT,
  consent_screening BOOLEAN DEFAULT FALSE,
  consent_credit_check BOOLEAN DEFAULT FALSE,
  ai_score INTEGER,
  ai_summary TEXT,
  ai_income_score INTEGER,
  ai_employment_score INTEGER,
  ai_rental_history_score INTEGER,
  ai_ltb_score INTEGER,
  ai_reference_score INTEGER,
  ltb_records_found INTEGER DEFAULT 0,
  ltb_records_json JSONB,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE landlords ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
