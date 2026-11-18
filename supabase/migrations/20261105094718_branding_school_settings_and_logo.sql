CREATE TABLE IF NOT EXISTS school_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  school_name text NOT NULL DEFAULT '',
  academic_year text NOT NULL DEFAULT '',
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO school_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON school_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON school_settings TO authenticated;

DROP POLICY IF EXISTS "school_settings_select_public" ON school_settings;
CREATE POLICY "school_settings_select_public" ON school_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "school_settings_insert_admin" ON school_settings;
CREATE POLICY "school_settings_insert_admin" ON school_settings FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "school_settings_update_admin" ON school_settings;
CREATE POLICY "school_settings_update_admin" ON school_settings FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'school-branding',
  'school-branding',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "school_branding_upload_admin" ON storage.objects;
CREATE POLICY "school_branding_upload_admin" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'school-branding' AND is_super_admin());

DROP POLICY IF EXISTS "school_branding_update_admin" ON storage.objects;
CREATE POLICY "school_branding_update_admin" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'school-branding' AND is_super_admin())
  WITH CHECK (bucket_id = 'school-branding' AND is_super_admin());

DROP POLICY IF EXISTS "school_branding_delete_admin" ON storage.objects;
CREATE POLICY "school_branding_delete_admin" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'school-branding' AND is_super_admin());
