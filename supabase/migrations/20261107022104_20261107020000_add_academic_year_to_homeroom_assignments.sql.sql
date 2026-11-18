ALTER TABLE homeroom_assignments
  ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT '2026/2027';

-- Backfill any pre-existing rows to the default active year.
UPDATE homeroom_assignments SET academic_year = '2026/2027' WHERE academic_year IS NULL;

-- Replace the single-column unique constraint with a composite one scoped per year.
ALTER TABLE homeroom_assignments DROP CONSTRAINT IF EXISTS homeroom_assignments_class_id_key;
ALTER TABLE homeroom_assignments DROP CONSTRAINT IF EXISTS homeroom_assignments_class_id_academic_year_key;
ALTER TABLE homeroom_assignments
  ADD CONSTRAINT homeroom_assignments_class_id_academic_year_key UNIQUE (class_id, academic_year);
