-- Add is_active column to profiles for user status management
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Grant update on is_active to authenticated (already has UPDATE grant)
-- No new policy needed: existing RLS policies on profiles cover ownership/admin access.
