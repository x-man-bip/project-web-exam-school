ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS image_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question-images',
  'question-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "teachers_insert_question_images" ON storage.objects;
CREATE POLICY "teachers_insert_question_images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'question-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "teachers_update_question_images" ON storage.objects;
CREATE POLICY "teachers_update_question_images" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'question-images' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'question-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "teachers_delete_question_images" ON storage.objects;
CREATE POLICY "teachers_delete_question_images" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'question-images' AND (storage.foldername(name))[1] = auth.uid()::text);
