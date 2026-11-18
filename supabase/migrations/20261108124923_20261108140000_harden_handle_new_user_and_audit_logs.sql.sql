-- HARDENING FIX 2: handle_new_user trigger function callable by anon via REST API
--
-- handle_new_user is a SECURITY DEFINER trigger that runs on auth.users insert.
-- It should only fire via the database trigger, never via a direct REST RPC call.
-- The advisor flagged it as callable by anon. Revoke from anon and authenticated;
-- triggers run with the function's own privileges regardless of EXECUTE grants.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- HARDENING FIX 3: audit_logs allows UPDATE/DELETE but has no UPDATE/DELETE policy
--
-- The initial migration only granted SELECT+INSERT on audit_logs, but a later
-- broad grant migration may have added UPDATE/DELETE. Revoke them so students
-- cannot tamper with their own anti-cheat audit trail.

REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated, anon;
