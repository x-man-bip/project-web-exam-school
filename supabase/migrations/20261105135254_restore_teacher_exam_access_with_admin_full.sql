CREATE OR REPLACE FUNCTION public.teacher_can_target_exam(p_subject_id uuid, p_class_id uuid, p_class_level text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.teacher_assignments ta
    JOIN public.classes c ON c.id = ta.class_id
    WHERE ta.teacher_id = auth.uid()
      AND ta.subject_id = p_subject_id
      AND (
        (p_class_id IS NOT NULL AND ta.class_id = p_class_id)
        OR (p_class_level IS NOT NULL AND c.level = p_class_level)
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.teacher_can_target_exam(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_can_target_exam(uuid, uuid, text) TO authenticated;

DROP POLICY IF EXISTS "exams_insert_admin" ON public.exams;
DROP POLICY IF EXISTS "exams_insert_exam_owner" ON public.exams;
CREATE POLICY "exams_insert_exam_owner" ON public.exams FOR INSERT
TO authenticated
WITH CHECK (
  teacher_id = auth.uid()
  AND public.teacher_can_target_exam(subject_id, class_id, class_level)
);

DROP POLICY IF EXISTS "exams_update_admin" ON public.exams;
DROP POLICY IF EXISTS "exams_update_exam_owner" ON public.exams;
CREATE POLICY "exams_update_exam_owner" ON public.exams FOR UPDATE
TO authenticated
USING (teacher_id = auth.uid() OR is_super_admin())
WITH CHECK (
  (teacher_id = auth.uid() OR is_super_admin())
  AND (is_super_admin() OR public.teacher_can_target_exam(subject_id, class_id, class_level))
);

DROP POLICY IF EXISTS "exams_delete_admin" ON public.exams;
DROP POLICY IF EXISTS "exams_delete_exam_owner" ON public.exams;
CREATE POLICY "exams_delete_exam_owner" ON public.exams FOR DELETE
TO authenticated
USING (teacher_id = auth.uid() OR is_super_admin());

DROP POLICY IF EXISTS "eq_insert_admin" ON public.exam_questions;
DROP POLICY IF EXISTS "eq_insert_exam_owner" ON public.exam_questions;
CREATE POLICY "eq_insert_exam_owner" ON public.exam_questions FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_questions.exam_id AND e.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "eq_update_admin" ON public.exam_questions;
DROP POLICY IF EXISTS "eq_update_exam_owner" ON public.exam_questions;
CREATE POLICY "eq_update_exam_owner" ON public.exam_questions FOR UPDATE
TO authenticated
USING (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_questions.exam_id AND e.teacher_id = auth.uid())
)
WITH CHECK (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_questions.exam_id AND e.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "eq_delete_admin" ON public.exam_questions;
DROP POLICY IF EXISTS "eq_delete_exam_owner" ON public.exam_questions;
CREATE POLICY "eq_delete_exam_owner" ON public.exam_questions FOR DELETE
TO authenticated
USING (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_questions.exam_id AND e.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_tokens_insert_admin" ON public.exam_access_tokens;
DROP POLICY IF EXISTS "exam_tokens_insert_owner" ON public.exam_access_tokens;
CREATE POLICY "exam_tokens_insert_owner" ON public.exam_access_tokens FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_access_tokens.exam_id AND e.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_tokens_update_admin" ON public.exam_access_tokens;
DROP POLICY IF EXISTS "exam_tokens_update_owner" ON public.exam_access_tokens;
CREATE POLICY "exam_tokens_update_owner" ON public.exam_access_tokens FOR UPDATE
TO authenticated
USING (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_access_tokens.exam_id AND e.teacher_id = auth.uid())
)
WITH CHECK (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_access_tokens.exam_id AND e.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_tokens_delete_admin" ON public.exam_access_tokens;
DROP POLICY IF EXISTS "exam_tokens_delete_owner" ON public.exam_access_tokens;
CREATE POLICY "exam_tokens_delete_owner" ON public.exam_access_tokens FOR DELETE
TO authenticated
USING (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_access_tokens.exam_id AND e.teacher_id = auth.uid())
);
