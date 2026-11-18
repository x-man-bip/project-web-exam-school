-- ============================================================
-- submit_exam_attempt (hardened)
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(p_attempt_id uuid)
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
  v_total numeric := 0;
  v_max numeric := 0;
  v_rows_updated int;
  r record;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ea.exam_id, ea.status, ex.status, ex.end_time
    INTO v_exam_id, v_attempt_status, v_exam_status, v_end_time
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

  -- Reject submissions after the scheduled end time or when exam is inactive
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

  -- Constrain the final state transition to in_progress attempts so a
  -- concurrent auto-submit (status -> auto_submitted) wins the race.
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

REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid) TO authenticated;

-- ============================================================
-- upsert_answer (hardened)
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_answer jsonb
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
  v_attempt_ok boolean;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ex.status, ex.end_time,
         EXISTS (SELECT 1 FROM public.exam_attempts ea
                  WHERE ea.id = p_attempt_id AND ea.student_id = v_student
                    AND ea.status = 'in_progress')
    INTO v_exam_status, v_end_time, v_attempt_ok
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

  INSERT INTO public.answers (attempt_id, question_id, answer, graded, score)
  VALUES (p_attempt_id, p_question_id, p_answer, false, 0)
  ON CONFLICT (attempt_id, question_id) DO UPDATE
    SET answer = excluded.answer,
        updated_at = now(),
        graded = CASE WHEN public.answers.graded THEN true ELSE false END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_answer(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_answer(uuid, uuid, jsonb) TO authenticated;

-- ============================================================
-- increment_tab_switches (hardened)
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_tab_switches(p_attempt_id uuid)
RETURNS table (out_tab_switches int, out_auto_submit boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_max int;
  v_auto boolean := false;
BEGIN
  UPDATE public.exam_attempts
    SET tab_switches = tab_switches + 1
    WHERE id = p_attempt_id
      AND student_id = auth.uid()
      AND status = 'in_progress'
    RETURNING tab_switches, (SELECT ex.max_tab_switches FROM public.exams ex WHERE ex.id = exam_attempts.exam_id)
    INTO v_count, v_max;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'Attempt not found or already finished';
  END IF;

  IF v_count >= v_max THEN
    UPDATE public.exam_attempts
      SET status = 'auto_submitted', submit_time = now()
      WHERE id = p_attempt_id AND status = 'in_progress';
    v_auto := true;
  END IF;

  RETURN QUERY SELECT v_count, v_auto;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_tab_switches(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_tab_switches(uuid) TO authenticated;
