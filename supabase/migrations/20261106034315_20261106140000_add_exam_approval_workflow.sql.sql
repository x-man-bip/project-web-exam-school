-- Exam approval workflow: KS (super_admin) approves exams before teachers can start them
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Index for filtering pending approvals
CREATE INDEX IF NOT EXISTS idx_exams_approval_status ON exams(approval_status);

-- SECURITY DEFINER function for KS to approve or reject an exam
CREATE OR REPLACE FUNCTION public.submit_exam_approval(
  p_exam_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ) INTO v_is_admin;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Hanya Kepala Sekolah yang dapat menyetujui ujian' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Aksi tidak valid. Gunakan approved atau rejected' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'rejected' AND COALESCE(p_note, '') = '' THEN
    RAISE EXCEPTION 'Catatan revisi wajib diisi saat menolak ujian' USING ERRCODE = 'P0001';
  END IF;

  UPDATE exams
  SET
    approval_status = p_action,
    approval_note = (CASE WHEN p_action = 'rejected' THEN p_note ELSE NULL END),
    approved_by = auth.uid(),
    approved_at = now()
  WHERE id = p_exam_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_exam_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_approval(uuid, text, text) TO authenticated;
