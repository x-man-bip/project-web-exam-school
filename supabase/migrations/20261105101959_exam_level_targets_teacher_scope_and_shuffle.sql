ALTER TABLE public.exams ALTER COLUMN class_id DROP NOT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS class_level text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exams_single_target') THEN
    ALTER TABLE public.exams ADD CONSTRAINT exams_single_target
      CHECK ((class_id IS NULL) <> (class_level IS NULL));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.exam_visible_to_student(p_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams ex
    JOIN public.class_enrollments ce ON ce.student_id = auth.uid()
    JOIN public.classes c ON c.id = ce.class_id
    JOIN public.teacher_assignments ta
      ON ta.class_id = c.id
     AND ta.teacher_id = ex.teacher_id
     AND ta.subject_id = ex.subject_id
    WHERE ex.id = p_exam_id
      AND ex.status = 'published'
      AND (ex.class_id = c.id OR (ex.class_level IS NOT NULL AND c.level = ex.class_level))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.exam_visible_to_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_visible_to_student(uuid) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.exam_requires_token(p_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.exam_visible_to_student(p_exam_id) AND EXISTS (
    SELECT 1 FROM public.exam_access_tokens t WHERE t.exam_id = p_exam_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.exam_requires_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_requires_token(uuid) TO authenticated;

DROP POLICY IF EXISTS "exams_modify" ON public.exams;
DROP POLICY IF EXISTS "exams_select" ON public.exams;

DROP POLICY IF EXISTS "exams_select_scoped" ON public.exams;
CREATE POLICY "exams_select_scoped" ON public.exams FOR SELECT
TO authenticated
USING (
  is_super_admin()
  OR teacher_id = auth.uid()
  OR public.exam_visible_to_student(id)
);

DROP POLICY IF EXISTS "exams_insert_teacher_scope" ON public.exams;
CREATE POLICY "exams_insert_teacher_scope" ON public.exams FOR INSERT
TO authenticated
WITH CHECK (
  teacher_id = auth.uid()
  AND public.teacher_can_target_exam(subject_id, class_id, class_level)
);

DROP POLICY IF EXISTS "exams_update_teacher_scope" ON public.exams;
CREATE POLICY "exams_update_teacher_scope" ON public.exams FOR UPDATE
TO authenticated
USING (teacher_id = auth.uid() OR is_super_admin())
WITH CHECK (
  (teacher_id = auth.uid() OR is_super_admin())
  AND public.teacher_can_target_exam(subject_id, class_id, class_level)
);

DROP POLICY IF EXISTS "exams_delete_owner" ON public.exams;
CREATE POLICY "exams_delete_owner" ON public.exams FOR DELETE
TO authenticated
USING (teacher_id = auth.uid() OR is_super_admin());

DROP POLICY IF EXISTS "eq_select" ON public.exam_questions;
CREATE POLICY "eq_select" ON public.exam_questions FOR SELECT
TO authenticated
USING (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_questions.exam_id AND e.teacher_id = auth.uid())
  OR public.exam_visible_to_student(exam_questions.exam_id)
);

DROP FUNCTION IF EXISTS public.fetch_student_exam(uuid);

CREATE OR REPLACE FUNCTION public.fetch_student_exam(
  p_exam_id uuid,
  p_access_token text default null
)
RETURNS table (
  out_exam_id uuid,
  out_exam_title text,
  out_exam_description text,
  out_duration_minutes int,
  out_strict_mode boolean,
  out_start_time timestamptz,
  out_max_tab_switches int,
  out_attempt_id uuid,
  out_question_id uuid,
  out_question_order int,
  out_question_type text,
  out_question_content text,
  out_question_options jsonb,
  out_points numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_exam public.exams%rowtype;
  v_stored_token text;
  v_attempt_id uuid;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_exam FROM public.exams ex WHERE ex.id = p_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam not found';
  END IF;

  IF NOT public.exam_visible_to_student(p_exam_id) THEN
    RAISE EXCEPTION 'Exam not available';
  END IF;

  SELECT t.token INTO v_stored_token FROM public.exam_access_tokens t WHERE t.exam_id = p_exam_id;
  IF v_stored_token IS NOT NULL AND coalesce(p_access_token, '') <> v_stored_token THEN
    RAISE EXCEPTION 'Token akses salah. Masukkan token yang diberikan guru.';
  END IF;

  IF v_exam.start_time IS NOT NULL AND now() < v_exam.start_time THEN
    RAISE EXCEPTION 'Ujian belum dimulai. Mulai pada: %', to_char(v_exam.start_time AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY HH24:MI');
  END IF;

  IF v_exam.end_time IS NOT NULL AND now() > v_exam.end_time THEN
    RAISE EXCEPTION 'Waktu ujian telah berakhir.';
  END IF;

  SELECT ea.id INTO v_attempt_id FROM public.exam_attempts ea
    WHERE ea.exam_id = p_exam_id AND ea.student_id = v_student;
  IF v_attempt_id IS NULL THEN
    INSERT INTO public.exam_attempts (exam_id, student_id, status, start_time)
    VALUES (p_exam_id, v_student, 'in_progress', now())
    RETURNING id INTO v_attempt_id;
  END IF;

  RETURN QUERY
  SELECT
    v_exam.id, v_exam.title, v_exam.description, v_exam.duration_minutes,
    v_exam.strict_mode, v_exam.start_time, v_exam.max_tab_switches,
    v_attempt_id,
    q.id,
    (row_number() OVER (ORDER BY md5(v_attempt_id::text || q.id::text)))::int,
    q.type, q.content, q.options, eq.points
  FROM public.exam_questions eq
  JOIN public.questions q ON q.id = eq.question_id
  WHERE eq.exam_id = p_exam_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fetch_student_exam(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_student_exam(uuid, text) TO authenticated;
