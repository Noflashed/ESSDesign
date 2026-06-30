-- Add editable profile fields for the My Profile page.
ALTER TABLE public.user_names
    ADD COLUMN IF NOT EXISTS preferred_name TEXT,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS personal_address TEXT,
    ADD COLUMN IF NOT EXISTS address_street TEXT,
    ADD COLUMN IF NOT EXISTS address_city TEXT,
    ADD COLUMN IF NOT EXISTS address_state TEXT,
    ADD COLUMN IF NOT EXISTS address_postal_code TEXT,
    ADD COLUMN IF NOT EXISTS address_country TEXT,
    ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
    ADD COLUMN IF NOT EXISTS emergency_relationship TEXT,
    ADD COLUMN IF NOT EXISTS emergency_phone_number TEXT,
    ADD COLUMN IF NOT EXISTS emergency_email TEXT,
    ADD COLUMN IF NOT EXISTS emergency_address TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.user_preferences
    ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS sms_notifications BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS system_announcements BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS marketing_updates BOOLEAN DEFAULT FALSE;
