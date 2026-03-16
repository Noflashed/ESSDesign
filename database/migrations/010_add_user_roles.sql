-- Migration: add admin/viewer user roles
-- Date: 2026-03-17
-- Description: Adds a persistent user_roles table, defaults new users to viewer,
--   and seeds the initial admin account.

CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')) DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read roles" ON public.user_roles;
CREATE POLICY "Authenticated users can read roles"
    ON public.user_roles FOR SELECT
    TO authenticated
    USING (true);

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'viewer'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('dccf9acd-cb29-4a64-8ded-8b58da6bca74', 'admin')
ON CONFLICT (user_id) DO UPDATE SET
    role = EXCLUDED.role,
    updated_at = timezone('utc', now());

CREATE OR REPLACE FUNCTION public.handle_auth_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'viewer')
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_role_created ON auth.users;
CREATE TRIGGER on_auth_user_role_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_role();
