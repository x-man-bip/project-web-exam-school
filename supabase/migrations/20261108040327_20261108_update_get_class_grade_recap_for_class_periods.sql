DROP FUNCTION IF EXISTS public.get_class_grade_recap(uuid);
DROP FUNCTION IF EXISTS public.get_class_grade_recap(uuid, text, text);

CREATE OR REPLACE FUNCTION public.get_class_grade_recap(
  p_class_id uuid,
  p_semester text DEFAULT NULL,
  p_academic_year text DEFAULT NULL
)
RETURNS TABLE(r_student_id uuid, r_subject_id uuid, r_best_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_level text;
  v_allowed boolean;
  v_student_ids uuid[];
BEGIN
  -- Authorization: super_admin OR homeroom teacher of this class in any period
  SELECT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ) OR EXISTS (
    SELECT 1 FROM class_periods cp
    WHERE cp.homeroom_teacher_id = auth.uid() AND cp.class_id = p_class_id
  ) INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Tidak punya akses ke rekap nilai kelas ini' USING ERRCODE = '42501';
  END IF;

  SELECT c.level INTO v_level FROM classes c WHERE c.id = p_class_id;

  -- Get enrolled student IDs: prefer class_period_id, fall back to class_id
  SELECT array_agg(ce.student_id) INTO v_student_ids
  FROM class_enrollments ce
  WHERE ce.class_id = p_class_id
     OR ce.class_period_id IN (
      SELECT cp.id FROM class_periods cp WHERE cp.class_id = p_class_id
    );

  IF v_student_ids IS NULL THEN
    v_student_ids := ARRAY[]::uuid[];
  END IF;

  RETURN QUERY
  SELECT a.student_id, e.subject_id, MAX(a.final_score)::numeric
  FROM exam_attempts a
  JOIN exams e ON e.id = a.exam_id
  WHERE a.status <> 'in_progress'
  AND a.final_score IS NOT NULL
  AND a.student_id = ANY(v_student_ids)
  AND (e.class_id = p_class_id OR (v_level IS NOT NULL AND e.class_level = v_level))
  AND (p_semester IS NULL OR e.semester = p_semester)
  AND (p_academic_year IS NULL OR e.academic_year = p_academic_year)
  GROUP BY a.student_id, e.subject_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_class_grade_recap(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_grade_recap(uuid, text, text) TO authenticated;
