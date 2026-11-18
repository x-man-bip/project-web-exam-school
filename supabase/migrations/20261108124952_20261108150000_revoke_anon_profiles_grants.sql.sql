-- The anon role still has broad UPDATE on profiles (inherited from initial grants).
-- Revoke it entirely; anon has no business updating profiles. RLS would block it
-- (auth.uid() is null for anon), but defense in depth: remove the grant.

REVOKE UPDATE ON public.profiles FROM anon;

-- Also restrict anon SELECT on profiles to prevent unauthenticated user enumeration.
-- Profiles contain full_name, identifier (NIP/NIS), role — sensitive data.
-- The profiles_select_self_or_admin policy already blocks non-authenticated reads
-- via RLS, but revoke the grant as defense in depth.
REVOKE SELECT ON public.profiles FROM anon;
