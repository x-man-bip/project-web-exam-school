-- 1. Add feedback column if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'answers' AND column_name = 'feedback'
  ) THEN
    ALTER TABLE public.answers ADD COLUMN feedback text;
  END IF;
END $$;

-- 2. Recreate grade_essay with feedback support
CREATE OR REPLACE FUNCTION public.grade_essay(
  p_answer_id uuid,
  p_score numeric,
  p_feedback text DEFAULT null
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exam_teacher uuid;
  v_points numeric;
  v_attempt uuid;
BEGIN
  SELECT e.teacher_id, eq.points, a.attempt_id INTO v_exam_teacher, v_points, v_attempt
  FROM public.answers a
  JOIN public.exam_attempts at ON at.id = a.attempt_id
  JOIN public.exams e ON e.id = at.exam_id
  JOIN public.exam_questions eq ON eq.exam_id = e.id AND eq.question_id = a.question_id
  WHERE a.id = p_answer_id;

  IF v_exam_teacher IS NULL THEN
    RAISE EXCEPTION 'Answer not found';
  END IF;

  IF auth.uid() IS NULL OR (auth.uid() <> v_exam_teacher AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized to grade this answer';
  END IF;

  IF p_score < 0 OR p_score > v_points THEN
    RAISE EXCEPTION 'Score out of range';
  END IF;

  UPDATE public.answers
    SET score = p_score,
        graded = true,
        graded_by = auth.uid(),
        graded_at = now(),
        is_correct = (p_score >= v_points),
        feedback = COALESCE(p_feedback, feedback)
    WHERE id = p_answer_id;

  UPDATE public.exam_attempts at
    SET essay_score = sub.essay_total,
        final_score = at.auto_score + COALESCE(sub.essay_total, 0)
    FROM (
      SELECT a.attempt_id, SUM(a.score) AS essay_total
      FROM public.answers a
      JOIN public.questions q ON q.id = a.question_id
      WHERE q.type = 'uraian' AND a.attempt_id = v_attempt
      GROUP BY a.attempt_id
    ) sub
    WHERE at.id = sub.attempt_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grade_essay(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_essay(uuid, numeric, text) TO authenticated;
