-- Link existing class enrollments without a period to the active academic period.
-- Creates the missing class period rows for the active year and semester first.
INSERT INTO public.class_periods (class_id, academic_year_id, semester_id)
SELECT DISTINCT ce.class_id, ay.id, s.id
FROM public.class_enrollments ce
CROSS JOIN public.academic_years ay
CROSS JOIN public.semesters s
WHERE ce.class_period_id IS NULL
  AND ay.is_active
  AND s.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.class_periods cp
    WHERE cp.class_id = ce.class_id
      AND cp.academic_year_id = ay.id
      AND cp.semester_id = s.id
  );

UPDATE public.class_enrollments ce
SET class_period_id = cp.id
FROM public.class_periods cp
JOIN public.academic_years ay ON ay.id = cp.academic_year_id AND ay.is_active
JOIN public.semesters s ON s.id = cp.semester_id AND s.is_active
WHERE ce.class_period_id IS NULL
  AND cp.class_id = ce.class_id;
