/*
# Single-row JSONB answer drafts for exam auto-save

## Plain-English summary
Exam auto-save used to send one request per answer change, and each answer lived in its own row. This migration adds one row per student per exam that stores all of that student's answers as a single JSONB object. The exam page now sends that whole object in one request, only when something changed.

## 1. New table: exam_answer_drafts
- `user_id` (uuid, part of primary key) - the student (profiles.id = auth user id).
- `exam_id` (uuid, part of primary key) - the exam.
- `attempt_id` (uuid) - the exam attempt the draft belongs to.
- `answers` (jsonb) - object of question id -> chosen answer.
- `updated_at` (timestamptz) - last time the draft was saved.
- Primary key (user_id, exam_id) doubles as the unique index used by the upsert.

## 2. New function: save_exam_answers(p_attempt_id, p_answers, p_session_token)
- Verifies the caller owns an in-progress attempt, the exam is active and not past its end time, and the session token matches (same rules as the existing per-answer save).
- Upserts the student's draft row for (user_id, exam_id).
- Mirrors the answers into the per-question `answers` table, only for questions that belong to this exam and only where the value actually changed. Grading (submit_exam_attempt) still reads that table, so grading is unchanged.

## 3. Security
- RLS enabled on exam_answer_drafts.
- Authenticated students can read only their own draft (select policy). No direct insert/update/delete grants: all writes go through the function.
- save_exam_answers is executable by authenticated only (PUBLIC and anon revoked).

## Notes
1. The `answers` table keeps one row per question because grading and teacher reports rely on it.
2. The unique key (user_id, exam_id) gives the single-row-per-session upsert.
3. Safe to re-run: all statements are idempotent.
*/

CREATE TABLE IF NOT EXISTS public.exam_answer_drafts (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exam_id)
);

ALTER TABLE public.exam_answer_drafts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.exam_answer_drafts TO authenticated;

DROP POLICY IF EXISTS "select_own_exam_answer_drafts" ON public.exam_answer_drafts;
CREATE POLICY "select_own_exam_answer_drafts" ON public.exam_answer_drafts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.save_exam_answers(
  p_attempt_id uuid,
  p_answers jsonb,
  p_session_token text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_exam_id uuid;
  v_attempt_status text;
  v_exam_status text;
  v_end_time timestamptz;
  v_stored_token text;
  v_now timestamptz := now();
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Format jawaban tidak valid.';
  END IF;

  SELECT ea.exam_id, ea.status, ex.status, ex.end_time, ea.session_token
  INTO v_exam_id, v_attempt_status, v_exam_status, v_end_time, v_stored_token
  FROM public.exam_attempts ea
  JOIN public.exams ex ON ex.id = ea.exam_id
  WHERE ea.id = p_attempt_id AND ea.student_id = v_student;

  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;
  IF v_attempt_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Ujian sudah selesai. Jawaban tidak dapat diubah.';
  END IF;
  IF v_end_time IS NOT NULL AND v_now > v_end_time THEN
    RAISE EXCEPTION 'Waktu ujian telah berakhir.';
  END IF;
  IF v_exam_status <> 'active' THEN
    RAISE EXCEPTION 'Ujian tidak aktif.';
  END IF;
  IF v_stored_token IS NOT NULL AND COALESCE(p_session_token, '') <> v_stored_token THEN
    RAISE EXCEPTION 'Sesi ujian tidak valid. Soal hanya dapat dijawab dari perangkat yang membuka ujian.';
  END IF;

  INSERT INTO public.exam_answer_drafts (user_id, exam_id, attempt_id, answers, updated_at)
  VALUES (v_student, v_exam_id, p_attempt_id, p_answers, v_now)
  ON CONFLICT (user_id, exam_id) DO UPDATE
  SET attempt_id = EXCLUDED.attempt_id,
      answers = EXCLUDED.answers,
      updated_at = EXCLUDED.updated_at;

  INSERT INTO public.answers (attempt_id, question_id, answer, graded, score)
  SELECT p_attempt_id, eq.question_id, p_answers -> eq.question_id::text, false, 0
  FROM (SELECT DISTINCT question_id FROM public.exam_questions WHERE exam_id = v_exam_id) eq
  WHERE p_answers ? eq.question_id::text
  ON CONFLICT (attempt_id, question_id) DO UPDATE
  SET answer = EXCLUDED.answer,
      updated_at = v_now,
      graded = CASE WHEN public.answers.graded THEN true ELSE false END
  WHERE public.answers.answer IS DISTINCT FROM EXCLUDED.answer;

  RETURN v_now;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_exam_answers(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_exam_answers(uuid, jsonb, text) TO authenticated;
