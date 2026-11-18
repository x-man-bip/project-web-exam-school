/*
# Initial setup wizard: one-time lock and setup status check

1. New Tables
- `system_setup`: a single-row table (id = 1) that records whether the first-run setup has been completed and when a setup attempt is in progress.
  - `claimed_at` (timestamptz): set while a setup request is running, so two requests cannot create the Super Admin at the same time. Claims older than 5 minutes are treated as abandoned.
  - `completed_at` (timestamptz): set once the Super Admin has been created. Once set, setup is locked permanently.
  - `created_at` (timestamptz)

2. Modified Tables
- `school_settings`: new column `npsn` (text, default empty) to store the school's NPSN number.

3. New Functions
- `setup_required()`: returns true only when setup has never been completed AND no `super_admin` profile exists. Callable by the public app so the first-run redirect can run before anyone signs in. It returns a yes/no answer only and exposes no other data.

4. Security
- `system_setup` has Row Level Security enabled with no policies. Only the server-side setup function (service role) can read or change it. Anonymous and signed-in browsers have no access.
- `setup_required()` is the only object exposed to the browser. Its EXECUTE permission is revoked from PUBLIC and granted to `anon` and `authenticated` only.

5. Important Notes
- The lock is enforced by the server-side setup function, which checks this state before creating anything. This migration does not create any user accounts.
- Existing data is not changed or removed.
*/

CREATE TABLE IF NOT EXISTS public.system_setup (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.system_setup (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_setup ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.system_setup FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.system_setup TO service_role;

ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS npsn text NOT NULL DEFAULT '';

UPDATE public.system_setup
SET completed_at = now()
WHERE id = 1
  AND completed_at IS NULL
  AND EXISTS (SELECT 1 FROM public.profiles WHERE role = 'super_admin');

CREATE OR REPLACE FUNCTION public.setup_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.system_setup WHERE id = 1 AND completed_at IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE role = 'super_admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.setup_required() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_required() TO anon, authenticated;
