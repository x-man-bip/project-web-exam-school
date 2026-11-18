ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_status_check;
ALTER TABLE public.exams ADD CONSTRAINT exams_status_check
  CHECK (status IN ('draft', 'published', 'active'));

CREATE OR REPLACE FUNCTION public.activate_exam(p_exam_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam public.exams%rowtype;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ujian tidak ditemukan';
  END IF;

  IF NOT is_super_admin() AND v_exam.teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'Anda tidak berhak mengaktifkan ujian ini';
  END IF;

  UPDATE public.exams SET status = 'active' WHERE id = p_exam_id;

  UPDATE public.exams
    SET status = 'published'
    WHERE id <> p_exam_id
      AND status = 'active'
      AND subject_id = v_exam.subject_id
      AND (
        (class_id IS NOT NULL AND class_id = v_exam.class_id)
        OR (class_level IS NOT NULL AND class_level = v_exam.class_level)
      );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_exam(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_exam(uuid) TO authenticated;

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
    WHERE ex.id = p_exam_id
      AND ex.status = 'active'
      AND (ex.class_id = c.id OR (ex.class_level IS NOT NULL AND c.level = ex.class_level))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.exam_visible_to_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_visible_to_student(uuid) TO authenticated;

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

  IF v_exam.status <> 'active' THEN
    RAISE EXCEPTION 'Ujian belum diaktifkan.';
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
