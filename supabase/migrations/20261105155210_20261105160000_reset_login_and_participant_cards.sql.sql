-- 1. Add 'not_started' to exam_attempts status CHECK
ALTER TABLE public.exam_attempts DROP CONSTRAINT IF EXISTS exam_attempts_status_check;
ALTER TABLE public.exam_attempts ADD CONSTRAINT exam_attempts_status_check
  CHECK (status IN ('not_started', 'in_progress', 'submitted', 'auto_submitted'));

-- 2. reset_attempt_login(p_attempt_id)
CREATE OR REPLACE FUNCTION public.reset_attempt_login(p_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam_id uuid;
  v_teacher_id uuid;
BEGIN
  SELECT ea.exam_id, e.teacher_id INTO v_exam_id, v_teacher_id
  FROM public.exam_attempts ea
  JOIN public.exams e ON e.id = ea.exam_id
  WHERE ea.id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Percobaan ujian tidak ditemukan';
  END IF;

  IF NOT public.is_super_admin() AND v_teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'Anda tidak berhak mereset login siswa ini';
  END IF;

  UPDATE public.exam_attempts
    SET status = 'not_started',
        submit_time = null,
        tab_switches = 0,
        start_time = now()
  WHERE id = p_attempt_id AND status IN ('in_progress', 'auto_submitted');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_attempt_login(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_attempt_login(uuid) TO authenticated;

-- 3. reset_all_attempts(p_exam_id)
CREATE OR REPLACE FUNCTION public.reset_all_attempts(p_exam_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid;
  v_count integer;
BEGIN
  SELECT teacher_id INTO v_teacher_id FROM public.exams WHERE id = p_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ujian tidak ditemukan';
  END IF;

  IF NOT public.is_super_admin() AND v_teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'Anda tidak berhak mereset sesi ujian ini';
  END IF;

  UPDATE public.exam_attempts
    SET status = 'not_started',
        submit_time = null,
        tab_switches = 0,
        start_time = now()
  WHERE exam_id = p_exam_id AND status IN ('in_progress', 'auto_submitted');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_all_attempts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_all_attempts(uuid) TO authenticated;

-- 4. get_exam_participants(p_exam_id)
CREATE OR REPLACE FUNCTION public.get_exam_participants(p_exam_id uuid)
RETURNS TABLE (
  r_student_id uuid,
  r_full_name text,
  r_identifier text,
  r_class_name text,
  r_class_id uuid
)
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

  IF NOT public.is_super_admin() AND v_exam.teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'Anda tidak berhak melihat peserta ujian ini';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS r_student_id,
    p.full_name AS r_full_name,
    p.identifier AS r_identifier,
    c.name AS r_class_name,
    c.id AS r_class_id
  FROM public.profiles p
  JOIN public.class_enrollments ce ON ce.student_id = p.id
  JOIN public.classes c ON c.id = ce.class_id
  WHERE p.role = 'student'
    AND (
      (v_exam.class_id IS NOT NULL AND ce.class_id = v_exam.class_id)
      OR (v_exam.class_id IS NULL AND v_exam.class_level IS NOT NULL AND c.level = v_exam.class_level)
    )
  ORDER BY c.name, p.full_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_exam_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_participants(uuid) TO authenticated;

-- 5. Update fetch_student_exam to handle 'not_started' status
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
  v_attempt_status text;
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

  SELECT ea.id, ea.status INTO v_attempt_id, v_attempt_status FROM public.exam_attempts ea
    WHERE ea.exam_id = p_exam_id AND ea.student_id = v_student;
  IF v_attempt_id IS NULL THEN
    INSERT INTO public.exam_attempts (exam_id, student_id, status, start_time)
    VALUES (p_exam_id, v_student, 'in_progress', now())
    RETURNING id INTO v_attempt_id;
  ELSIF v_attempt_status = 'not_started' THEN
    -- Reactivate the attempt: flip to in_progress, keep draft answers
    UPDATE public.exam_attempts
      SET status = 'in_progress', start_time = now()
    WHERE id = v_attempt_id;
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
