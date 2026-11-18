-- ============================================================
-- PART 1: Helper functions — set search_path
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin');
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'teacher');
$$;

REVOKE EXECUTE ON FUNCTION public.is_teacher() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_student()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'student');
$$;

REVOKE EXECUTE ON FUNCTION public.is_student() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_student() TO authenticated;

-- ============================================================
-- PART 2: Columns
-- ============================================================
ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS session_token text;

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS seb_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS ip_allowlist text NOT NULL DEFAULT '';

ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS require_seb boolean NOT NULL DEFAULT false;

-- ============================================================
-- PART 3: school_settings — restrict security column writes to super_admin
-- ============================================================
DROP POLICY IF EXISTS "school_settings_update_admin_only" ON public.school_settings;
CREATE POLICY "school_settings_update_admin_only" ON public.school_settings
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Revoke broad authenticated UPDATE, re-grant via the policy above
REVOKE UPDATE ON public.school_settings FROM authenticated;
GRANT UPDATE ON public.school_settings TO authenticated;

-- ============================================================
-- PART 4: fetch_student_exam — add session_token + seb_verified output
-- ============================================================
DROP FUNCTION IF EXISTS public.fetch_student_exam(uuid, text);

CREATE FUNCTION public.fetch_student_exam(
  p_exam_id uuid,
  p_access_token text DEFAULT NULL,
  p_seb_verified boolean DEFAULT false
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
  out_question_image_url text,
  out_session_token text,
  out_seb_verified boolean
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
  v_session_token text;
  v_is_new boolean := false;
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
  IF v_stored_token IS NOT NULL AND COALESCE(p_access_token, '') <> v_stored_token THEN
    RAISE EXCEPTION 'Token akses salah. Masukkan token yang diberikan guru.';
  END IF;

  IF v_exam.start_time IS NOT NULL AND now() < v_exam.start_time THEN
    RAISE EXCEPTION 'Ujian belum dimulai. Mulai pada: %', to_char(v_exam.start_time AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY HH24:MI');
  END IF;

  IF v_exam.end_time IS NOT NULL AND now() > v_exam.end_time THEN
    RAISE EXCEPTION 'Waktu ujian telah berakhir.';
  END IF;

  SELECT ea.id, ea.status, ea.session_token INTO v_attempt_id, v_attempt_status, v_session_token
    FROM public.exam_attempts ea
    WHERE ea.exam_id = p_exam_id AND ea.student_id = v_student;

  IF v_attempt_id IS NULL THEN
    v_session_token := encode(gen_random_bytes(16), 'hex');
    v_is_new := true;
    INSERT INTO public.exam_attempts (exam_id, student_id, status, start_time, session_token, seb_verified)
    VALUES (p_exam_id, v_student, 'in_progress', now(), v_session_token, COALESCE(p_seb_verified, false))
    RETURNING id INTO v_attempt_id;
  ELSIF v_attempt_status = 'not_started' THEN
    v_session_token := encode(gen_random_bytes(16), 'hex');
    UPDATE public.exam_attempts
      SET status = 'in_progress', start_time = now(), session_token = v_session_token,
          seb_verified = COALESCE(p_seb_verified, seb_verified)
    WHERE id = v_attempt_id;
  ELSIF v_attempt_status = 'in_progress' AND v_session_token IS NULL THEN
    -- Backfill: existing in_progress attempt without a token gets one now
    v_session_token := encode(gen_random_bytes(16), 'hex');
    UPDATE public.exam_attempts SET session_token = v_session_token WHERE id = v_attempt_id;
  END IF;

  RETURN QUERY
  SELECT
    v_exam.id, v_exam.title, v_exam.description, v_exam.duration_minutes,
    v_exam.strict_mode, v_exam.start_time, v_exam.max_tab_switches,
    v_attempt_id,
    q.id,
    (row_number() OVER (ORDER BY md5(v_attempt_id::text || q.id::text)))::int,
    q.type, q.content, q.options, eq.points, q.image_url,
    v_session_token,
    COALESCE(p_seb_verified, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fetch_student_exam(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_student_exam(uuid, text, boolean) TO authenticated;

-- ============================================================
-- PART 5: upsert_answer — require session_token
-- ============================================================
DROP FUNCTION IF EXISTS public.upsert_answer(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.upsert_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_answer jsonb,
  p_session_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_exam_status text;
  v_end_time timestamptz;
  v_stored_token text;
  v_attempt_ok boolean;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ex.status, ex.end_time, ea.session_token,
         EXISTS (SELECT 1 FROM public.exam_attempts ea2
                  WHERE ea2.id = p_attempt_id AND ea2.student_id = v_student
                    AND ea2.status = 'in_progress')
    INTO v_exam_status, v_end_time, v_stored_token, v_attempt_ok
  FROM public.exam_attempts ea
  JOIN public.exams ex ON ex.id = ea.exam_id
  WHERE ea.id = p_attempt_id AND ea.student_id = v_student;
  IF v_exam_status IS NULL AND v_end_time IS NULL AND v_attempt_ok IS NULL THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;

  IF COALESCE(v_attempt_ok, false) = false THEN
    RAISE EXCEPTION 'Ujian sudah selesai. Jawaban tidak dapat diubah.';
  END IF;
  IF v_end_time IS NOT NULL AND now() > v_end_time THEN
    RAISE EXCEPTION 'Waktu ujian telah berakhir.';
  END IF;
  IF v_exam_status <> 'active' THEN
    RAISE EXCEPTION 'Ujian tidak aktif.';
  END IF;

  -- Session token must match the one issued at fetch time
  IF v_stored_token IS NOT NULL AND COALESCE(p_session_token, '') <> v_stored_token THEN
    RAISE EXCEPTION 'Sesi ujian tidak valid. Soal hanya dapat dijawab dari perangkat yang membuka ujian.';
  END IF;

  INSERT INTO public.answers (attempt_id, question_id, answer, graded, score)
  VALUES (p_attempt_id, p_question_id, p_answer, false, 0)
  ON CONFLICT (attempt_id, question_id) DO UPDATE
    SET answer = excluded.answer,
        updated_at = now(),
        graded = CASE WHEN public.answers.graded THEN true ELSE false END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_answer(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_answer(uuid, uuid, jsonb, text) TO authenticated;

-- ============================================================
-- PART 6: submit_exam_attempt — require session_token (idempotent for finalized)
-- ============================================================
DROP FUNCTION IF EXISTS public.submit_exam_attempt(uuid);

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  p_attempt_id uuid,
  p_session_token text DEFAULT NULL
)
RETURNS table (
  out_attempt_id uuid,
  out_auto_score numeric,
  out_max_score numeric,
  out_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_exam_id uuid;
  v_attempt_status text;
  v_exam_status text;
  v_end_time timestamptz;
  v_stored_token text;
  v_total numeric := 0;
  v_max numeric := 0;
  v_rows_updated int;
  r record;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ea.exam_id, ea.status, ex.status, ex.end_time, ea.session_token
    INTO v_exam_id, v_attempt_status, v_exam_status, v_end_time, v_stored_token
  FROM public.exam_attempts ea
  JOIN public.exams ex ON ex.id = ea.exam_id
  WHERE ea.id = p_attempt_id AND ea.student_id = v_student;
  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;

  -- Idempotent final state: already finalized attempts return existing scores
  IF v_attempt_status IN ('submitted', 'auto_submitted') THEN
    SELECT ea.auto_score, ea.max_score, ea.status
      INTO v_total, v_max, v_attempt_status
    FROM public.exam_attempts ea WHERE ea.id = p_attempt_id;
    RETURN QUERY SELECT p_attempt_id, v_total, v_max, v_attempt_status;
    RETURN;
  END IF;

  -- Session token must match (only checked for in_progress attempts)
  IF v_stored_token IS NOT NULL AND COALESCE(p_session_token, '') <> v_stored_token THEN
    RAISE EXCEPTION 'Sesi ujian tidak valid. Jawaban hanya dapat dikirim dari perangkat yang membuka ujian.';
  END IF;

  IF v_end_time IS NOT NULL AND now() > v_end_time THEN
    RAISE EXCEPTION 'Waktu ujian telah berakhir. Jawaban tidak dapat dikirim.';
  END IF;
  IF v_exam_status <> 'active' THEN
    RAISE EXCEPTION 'Ujian tidak aktif. Jawaban tidak dapat dikirim.';
  END IF;

  FOR r IN
    SELECT eq.question_id, eq.points, q.type, q.correct_answer, a.answer
    FROM public.exam_questions eq
    JOIN public.questions q ON q.id = eq.question_id
    LEFT JOIN public.answers a ON a.attempt_id = p_attempt_id AND a.question_id = eq.question_id
    WHERE eq.exam_id = v_exam_id
  LOOP
    v_max := v_max + r.points;
    IF r.type IN ('pg','pg_kompleks','mcma') AND r.answer IS NOT NULL THEN
      IF r.answer = r.correct_answer THEN
        v_total := v_total + r.points;
        UPDATE public.answers
          SET is_correct = true, score = r.points, graded = true, graded_at = now()
          WHERE attempt_id = p_attempt_id AND question_id = r.question_id;
      ELSE
        UPDATE public.answers
          SET is_correct = false, score = 0, graded = true, graded_at = now()
          WHERE attempt_id = p_attempt_id AND question_id = r.question_id;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.exam_attempts
    SET status = 'submitted',
        submit_time = now(),
        auto_score = v_total,
        max_score = v_max
    WHERE id = p_attempt_id AND status = 'in_progress';
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    SELECT ea.auto_score, ea.max_score, ea.status
      INTO v_total, v_max, v_attempt_status
    FROM public.exam_attempts ea WHERE ea.id = p_attempt_id;
    RETURN QUERY SELECT p_attempt_id, v_total, v_max, v_attempt_status;
    RETURN;
  END IF;

  RETURN QUERY SELECT p_attempt_id, v_total, v_max, 'submitted'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, text) TO authenticated;
