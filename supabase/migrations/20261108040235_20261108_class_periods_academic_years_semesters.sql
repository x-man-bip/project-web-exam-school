-- ============================================================
-- 1. Create academic_years table
-- ============================================================
CREATE TABLE IF NOT EXISTS academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_name text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON academic_years TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON academic_years TO service_role;

DROP POLICY IF EXISTS "select_academic_years" ON academic_years;
CREATE POLICY "select_academic_years" ON academic_years FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_academic_years_admin" ON academic_years;
CREATE POLICY "insert_academic_years_admin" ON academic_years FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "update_academic_years_admin" ON academic_years;
CREATE POLICY "update_academic_years_admin" ON academic_years FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "delete_academic_years_admin" ON academic_years;
CREATE POLICY "delete_academic_years_admin" ON academic_years FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ============================================================
-- 2. Create semesters table
-- ============================================================
CREATE TABLE IF NOT EXISTS semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (semester_name)
);

ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON semesters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON semesters TO service_role;

DROP POLICY IF EXISTS "select_semesters" ON semesters;
CREATE POLICY "select_semesters" ON semesters FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_semesters_admin" ON semesters;
CREATE POLICY "insert_semesters_admin" ON semesters FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "update_semesters_admin" ON semesters;
CREATE POLICY "update_semesters_admin" ON semesters FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "delete_semesters_admin" ON semesters;
CREATE POLICY "delete_semesters_admin" ON semesters FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ============================================================
-- 3. Create class_periods table
-- ============================================================
CREATE TABLE IF NOT EXISTS class_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  homeroom_teacher_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, academic_year_id, semester_id)
);

CREATE INDEX IF NOT EXISTS idx_class_periods_period
  ON class_periods(academic_year_id, semester_id);

ALTER TABLE class_periods ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON class_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON class_periods TO service_role;

DROP POLICY IF EXISTS "select_class_periods" ON class_periods;
CREATE POLICY "select_class_periods" ON class_periods FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_class_periods_admin" ON class_periods;
CREATE POLICY "insert_class_periods_admin" ON class_periods FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "update_class_periods_admin" ON class_periods;
CREATE POLICY "update_class_periods_admin" ON class_periods FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "delete_class_periods_admin" ON class_periods;
CREATE POLICY "delete_class_periods_admin" ON class_periods FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ============================================================
-- 4. Add class_period_id to class_enrollments and teacher_assignments
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'class_enrollments' AND column_name = 'class_period_id'
  ) THEN
    ALTER TABLE class_enrollments
      ADD COLUMN class_period_id uuid REFERENCES class_periods(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teacher_assignments' AND column_name = 'class_period_id'
  ) THEN
    ALTER TABLE teacher_assignments
      ADD COLUMN class_period_id uuid REFERENCES class_periods(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 5. Seed default academic year and semesters, set active
-- ============================================================
INSERT INTO academic_years (year_name, is_active)
SELECT '2026/2027', true
WHERE NOT EXISTS (SELECT 1 FROM academic_years WHERE year_name = '2026/2027');

-- Ensure only one active academic year
UPDATE academic_years SET is_active = (year_name = '2026/2027');

INSERT INTO semesters (semester_name, is_active)
SELECT 'Ganjil', true
WHERE NOT EXISTS (SELECT 1 FROM semesters WHERE semester_name = 'Ganjil');

INSERT INTO semesters (semester_name, is_active)
SELECT 'Genap', false
WHERE NOT EXISTS (SELECT 1 FROM semesters WHERE semester_name = 'Genap');

-- Ensure only one active semester
UPDATE semesters SET is_active = (semester_name = 'Ganjil');

-- ============================================================
-- 6. Migrate existing homeroom_assignments → class_periods
-- ============================================================
INSERT INTO class_periods (class_id, academic_year_id, semester_id, homeroom_teacher_id)
SELECT DISTINCT ON (ha.class_id)
  ha.class_id,
  (SELECT id FROM academic_years WHERE year_name = '2026/2027' AND is_active LIMIT 1),
  (SELECT id FROM semesters WHERE semester_name = 'Ganjil' AND is_active LIMIT 1),
  ha.teacher_id
FROM homeroom_assignments ha
WHERE NOT EXISTS (
  SELECT 1 FROM class_periods cp
  WHERE cp.class_id = ha.class_id
    AND cp.academic_year_id = (SELECT id FROM academic_years WHERE is_active LIMIT 1)
    AND cp.semester_id = (SELECT id FROM semesters WHERE is_active LIMIT 1)
);

-- ============================================================
-- 7. Create class_periods for all classes that don't have one yet
--    (for the active year/semester)
-- ============================================================
INSERT INTO class_periods (class_id, academic_year_id, semester_id)
SELECT
  c.id,
  (SELECT id FROM academic_years WHERE is_active LIMIT 1),
  (SELECT id FROM semesters WHERE is_active LIMIT 1)
FROM classes c
WHERE NOT EXISTS (
  SELECT 1 FROM class_periods cp
  WHERE cp.class_id = c.id
    AND cp.academic_year_id = (SELECT id FROM academic_years WHERE is_active LIMIT 1)
    AND cp.semester_id = (SELECT id FROM semesters WHERE is_active LIMIT 1)
);

-- ============================================================
-- 8. Link existing class_enrollments to class_periods
-- ============================================================
UPDATE class_enrollments ce
SET class_period_id = cp.id
FROM class_periods cp
WHERE ce.class_id = cp.class_id
  AND cp.academic_year_id = (SELECT id FROM academic_years WHERE is_active LIMIT 1)
  AND cp.semester_id = (SELECT id FROM semesters WHERE is_active LIMIT 1)
  AND ce.class_period_id IS NULL;

-- ============================================================
-- 9. Link existing teacher_assignments to class_periods
-- ============================================================
UPDATE teacher_assignments ta
SET class_period_id = cp.id
FROM class_periods cp
WHERE ta.class_id = cp.class_id
  AND cp.academic_year_id = (SELECT id FROM academic_years WHERE is_active LIMIT 1)
  AND cp.semester_id = (SELECT id FROM semesters WHERE is_active LIMIT 1)
  AND ta.class_period_id IS NULL;

-- ============================================================
-- 10. Add unique constraint on class_enrollments (class_period_id, student_id)
--     to prevent duplicate enrollment within a period
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_enrollments_class_period_student_key'
  ) THEN
    ALTER TABLE class_enrollments
      ADD CONSTRAINT class_enrollments_class_period_student_key
      UNIQUE (class_period_id, student_id);
  END IF;
END $$;
