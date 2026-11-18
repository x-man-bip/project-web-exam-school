/*
# Exam shuffle settings & deterministic per-student shuffle

1. Plain-English summary
- Teachers can now control question/option shuffling per exam. Each student still
  gets a personal shuffled order, but the order is derived deterministically from
  the student's attempt id, so refreshing or reconnecting shows the same order.

2. Modified tables
- `exams`
  - `acak_soal` (boolean, default true): shuffle question order per student.
  - `acak_opsi` (boolean, default true): shuffle answer-option order per student
    (skipped automatically for essay questions, which have no options).
  - `shuffle_mode` (text, default 'all'): 'all' = shuffle all questions together;
    'per_subject' = keep subjects in sequence, shuffle question numbers inside
    each subject group.

3. Modified functions
- `fetch_student_exam(uuid, text, boolean)`:
  - Question ordering now respects `acak_soal` / `shuffle_mode`. When shuffling
    is on, order is md5(attempt_id + question_id) — stable per student session.
  - Options are returned with an added `oi` key (the option's original index in
    the question's stored array) and, when `acak_opsi` is on, in an order derived
    from md5(attempt_id + question_id + original index) — stable per session.
  - The student client stores answers using ORIGINAL option indices, so automatic
    grading (which compares against the stored correct answer) stays accurate.
  - Essay (`uraian`) questions never have options shuffled and use a textarea.

4. Security
- No RLS changes. Function keeps SECURITY DEFINER with locked search_path and
  the existing EXECUTE grants (revoked from PUBLIC/anon, granted to authenticated).
*/

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS acak_soal boolean NOT NULL DEFAULT true;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS acak_opsi boolean NOT NULL DEFAULT true;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS shuffle_mode text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exams_shuffle_mode_check') THEN
    ALTER TABLE public.exams ADD CONSTRAINT exams_shuffle_mode_check
      CHECK (shuffle_mode IN ('all', 'per_subject'));
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.fetch_student_exam(uuid, text, boolean);

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
    (row_number() OVER (
      ORDER BY
        CASE WHEN v_exam.acak_soal AND v_exam.shuffle_mode = 'per_subject' THEN COALESCE(s.name, '') ELSE '' END,
        CASE
          WHEN v_exam.acak_soal THEN md5(v_attempt_id::text || q.id::text)
          ELSE lpad(eq.question_order::text, 32, '0')
        END
    ))::int,
    q.type, q.content,
    CASE
      WHEN jsonb_typeof(q.options) = 'array' AND jsonb_array_length(q.options) > 0
           AND v_exam.acak_opsi AND q.type <> 'uraian' THEN (
        SELECT jsonb_agg(
          jsonb_build_object(
            'text', CASE WHEN jsonb_typeof(elem) = 'object' THEN elem->>'text' ELSE elem #>> '{}' END,
            'image_url', CASE WHEN jsonb_typeof(elem) = 'object' THEN elem->'image_url' ELSE NULL END,
            'oi', ord - 1
          ) ORDER BY md5(v_attempt_id::text || q.id::text || ':' || (ord - 1)::text)
        )
        FROM jsonb_array_elements(q.options) WITH ORDINALITY AS t(elem, ord)
      )
      WHEN jsonb_typeof(q.options) = 'array' THEN (
        SELECT jsonb_agg(
          jsonb_build_object(
            'text', CASE WHEN jsonb_typeof(elem) = 'object' THEN elem->>'text' ELSE elem #>> '{}' END,
            'image_url', CASE WHEN jsonb_typeof(elem) = 'object' THEN elem->'image_url' ELSE NULL END,
            'oi', ord - 1
          ) ORDER BY ord
        )
        FROM jsonb_array_elements(q.options) WITH ORDINALITY AS t(elem, ord)
      )
      ELSE q.options
    END,
    eq.points, q.image_url,
    v_session_token,
    COALESCE(p_seb_verified, false)
  FROM public.exam_questions eq
  JOIN public.questions q ON q.id = eq.question_id
  LEFT JOIN public.subjects s ON s.id = q.subject_id
  WHERE eq.exam_id = p_exam_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fetch_student_exam(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_student_exam(uuid, text, boolean) TO authenticated;
