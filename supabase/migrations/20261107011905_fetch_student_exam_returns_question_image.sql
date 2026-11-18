DROP FUNCTION IF EXISTS public.fetch_student_exam(uuid, text);

CREATE FUNCTION public.fetch_student_exam(
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
  out_points numeric,
  out_question_image_url text
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
    q.type, q.content, q.options, eq.points, q.image_url
  FROM public.exam_questions eq
  JOIN public.questions q ON q.id = eq.question_id
  WHERE eq.exam_id = p_exam_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fetch_student_exam(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_student_exam(uuid, text) TO authenticated;
