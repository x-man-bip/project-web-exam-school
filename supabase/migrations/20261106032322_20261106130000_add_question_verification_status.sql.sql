-- Add question verification status & review feedback fields
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_questions_verification_status ON questions(verification_status);

-- Add review note to questions table RLS already exists; add a SECURITY DEFINER function
-- for KS to submit review (approve/reject with note) and optionally notify teacher.

CREATE OR REPLACE FUNCTION public.submit_question_review(
  p_question_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_teacher_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ) INTO v_is_admin;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Hanya Kepala Sekolah yang dapat memberikan review soal' USING ERRCODE = '42501';
  END IF;

  SELECT teacher_id INTO v_teacher_id FROM questions WHERE id = p_question_id;
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Soal tidak ditemukan' USING ERRCODE = '404';
  END IF;

  IF p_status NOT IN ('draft', 'pending_review', 'approved') THEN
    RAISE EXCEPTION 'Status tidak valid' USING ERRCODE = '400';
  END IF;

  UPDATE questions
  SET
    verification_status = p_status,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = p_note
  WHERE id = p_question_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_question_review(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_question_review(uuid, text, text) TO authenticated;
