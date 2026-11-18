-- CRITICAL FIX: Privilege escalation via profiles.role self-update
--
-- The profiles table granted UPDATE on ALL columns to authenticated, and the
-- profiles_update_self RLS policy allowed any user to update their own row.
-- A student could simply run:
--   supabase.from('profiles').update({ role: 'super_admin' }).eq('id', <own id>)
-- and gain full admin access.
--
-- Fix: revoke the broad UPDATE grant and re-grant UPDATE only on the columns
-- a user is allowed to change about themselves (full_name, identifier, avatar_url).
-- The role, is_active, and id columns are now protected at the GRANT level,
-- which RLS policies cannot override.

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (full_name, identifier, avatar_url) ON public.profiles TO authenticated;

-- Admin still needs full UPDATE (to change roles, is_active, etc.)
GRANT UPDATE ON public.profiles TO service_role;
