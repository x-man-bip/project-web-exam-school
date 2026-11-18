CREATE OR REPLACE FUNCTION public.activate_exam(p_exam_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam public.exams%rowtype;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ujian tidak ditemukan' USING ERRCODE = 'P0001';
  END IF;

  IF NOT is_super_admin() AND v_exam.teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'Anda tidak berhak mengaktifkan ujian ini' USING ERRCODE = 'P0001';
  END IF;

  IF v_exam.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Ujian belum disetujui oleh Kepala Sekolah' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.exams SET status = 'active' WHERE id = p_exam_id;

  UPDATE public.exams
  SET status = 'published'
  WHERE id <> p_exam_id
    AND status = 'active'
    AND subject_id = v_exam.subject_id
    AND (
      (class_id IS NOT NULL AND class_id = v_exam.class_id)
      OR (class_level IS NOT NULL AND class_level = v_exam.class_level)
    );
END;
$$;
