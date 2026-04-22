-- Add phone_number to user_names for app-only users
ALTER TABLE user_names ADD COLUMN IF NOT EXISTS phone_number TEXT;
