CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'teacher');
$$;

CREATE OR REPLACE FUNCTION public.is_student()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'student');
$$;

CREATE OR REPLACE FUNCTION public.is_teaching_class(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT EXISTS (SELECT 1 FROM public.homeroom_assignments ha WHERE ha.class_id = p_class_id AND ha.teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.teacher_assignments ta WHERE ta.class_id = p_class_id AND ta.teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.class_periods cp WHERE cp.class_id = p_class_id AND cp.homeroom_teacher_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.is_teaching_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teaching_class(uuid) TO authenticated;

DROP POLICY IF EXISTS "enroll_read" ON public.class_enrollments;
DROP POLICY IF EXISTS "enroll_modify_admin" ON public.class_enrollments;
DROP POLICY IF EXISTS "Allow select for enrolled users and admins" ON public.class_enrollments;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.class_enrollments;
DROP POLICY IF EXISTS "Allow read access for class_enrollments" ON public.class_enrollments;
DROP POLICY IF EXISTS "enroll_select" ON public.class_enrollments;
DROP POLICY IF EXISTS "enroll_insert_admin" ON public.class_enrollments;
DROP POLICY IF EXISTS "enroll_update_admin" ON public.class_enrollments;
DROP POLICY IF EXISTS "enroll_delete_admin" ON public.class_enrollments;

DROP POLICY IF EXISTS "enroll_select" ON public.class_enrollments;
CREATE POLICY "enroll_select" ON public.class_enrollments FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()
  OR public.is_super_admin()
  OR public.is_teaching_class(class_id)
);

DROP POLICY IF EXISTS "enroll_insert_admin" ON public.class_enrollments;
CREATE POLICY "enroll_insert_admin" ON public.class_enrollments FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "enroll_update_admin" ON public.class_enrollments;
CREATE POLICY "enroll_update_admin" ON public.class_enrollments FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "enroll_delete_admin" ON public.class_enrollments;
CREATE POLICY "enroll_delete_admin" ON public.class_enrollments FOR DELETE
TO authenticated
USING (public.is_super_admin());
