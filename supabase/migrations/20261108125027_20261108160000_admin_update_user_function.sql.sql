-- Admin-only user profile update function
--
-- After fixing the critical profiles.role privilege escalation, the authenticated
-- role can only UPDATE (full_name, identifier, avatar_url) on profiles. Admins
-- need to update role and is_active for other users. This SECURITY DEFINER
-- function allows super_admin to update any user's full_name, identifier, role,
-- and is_active. It validates the role value and prevents self-demotion of the
-- last remaining super_admin.

CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_identifier text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role text;
  v_admin_count int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Kepala Sekolah yang dapat mengubah data user' USING ERRCODE = '42501';
  END IF;

  IF p_role IS NOT NULL AND p_role NOT IN ('super_admin', 'teacher', 'student') THEN
    RAISE EXCEPTION 'Peran tidak valid' USING ERRCODE = 'P0001';
  END IF;

  -- Prevent demoting the last super_admin
  IF p_role IS NOT NULL AND p_role <> 'super_admin' THEN
    SELECT role INTO v_current_role FROM public.profiles WHERE id = p_user_id;
    IF v_current_role = 'super_admin' THEN
      SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'super_admin';
      IF v_admin_count <= 1 THEN
        RAISE EXCEPTION 'Tidak dapat menurunkan peran Kepala Sekolah terakhir' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- Prevent self-deactivation
  IF p_is_active = false AND p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Anda tidak dapat menonaktifkan akun sendiri' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles
    SET full_name = COALESCE(p_full_name, full_name),
        identifier = COALESCE(p_identifier, identifier),
        role = COALESCE(p_role, role),
        is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text, text, boolean) TO authenticated;
