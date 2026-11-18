CREATE OR REPLACE FUNCTION public.get_class_grade_recap(p_class_id uuid)
RETURNS TABLE (r_student_id uuid, r_subject_id uuid, r_best_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level text;
  v_allowed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ) OR EXISTS (
    SELECT 1 FROM homeroom_assignments h WHERE h.teacher_id = auth.uid() AND h.class_id = p_class_id
  ) INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Tidak punya akses ke rekap nilai kelas ini' USING ERRCODE = '42501';
  END IF;

  SELECT c.level INTO v_level FROM classes c WHERE c.id = p_class_id;

  RETURN QUERY
  SELECT a.student_id, e.subject_id, MAX(a.final_score)::numeric
  FROM exam_attempts a
  JOIN exams e ON e.id = a.exam_id
  WHERE a.status <> 'in_progress'
    AND a.final_score IS NOT NULL
    AND a.student_id IN (SELECT ce.student_id FROM class_enrollments ce WHERE ce.class_id = p_class_id)
    AND (e.class_id = p_class_id OR (v_level IS NOT NULL AND e.class_level = v_level))
  GROUP BY a.student_id, e.subject_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_class_grade_recap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_grade_recap(uuid) TO authenticated;
