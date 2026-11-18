CREATE TABLE IF NOT EXISTS public.exam_access_tokens (
  exam_id uuid PRIMARY KEY REFERENCES public.exams(id) ON DELETE CASCADE,
  token text NOT NULL CHECK (char_length(token) BETWEEN 4 AND 20)
);

ALTER TABLE public.exam_access_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_access_tokens TO authenticated;

INSERT INTO public.exam_access_tokens (exam_id, token)
SELECT id, access_token FROM public.exams
WHERE access_token IS NOT NULL AND access_token <> ''
ON CONFLICT (exam_id) DO NOTHING;

UPDATE public.exams SET access_token = NULL WHERE access_token IS NOT NULL;

DROP POLICY IF EXISTS "exam_tokens_select_owner" ON public.exam_access_tokens;
CREATE POLICY "exam_tokens_select_owner" ON public.exam_access_tokens FOR SELECT
TO authenticated
USING (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_access_tokens.exam_id AND e.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_tokens_insert_owner" ON public.exam_access_tokens;
CREATE POLICY "exam_tokens_insert_owner" ON public.exam_access_tokens FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_access_tokens.exam_id AND e.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_tokens_update_owner" ON public.exam_access_tokens;
CREATE POLICY "exam_tokens_update_owner" ON public.exam_access_tokens FOR UPDATE
TO authenticated
USING (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_access_tokens.exam_id AND e.teacher_id = auth.uid())
)
WITH CHECK (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_access_tokens.exam_id AND e.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_tokens_delete_owner" ON public.exam_access_tokens;
CREATE POLICY "exam_tokens_delete_owner" ON public.exam_access_tokens FOR DELETE
TO authenticated
USING (
  is_super_admin()
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_access_tokens.exam_id AND e.teacher_id = auth.uid())
);
