ALTER TABLE questions ALTER COLUMN class_id DROP NOT NULL;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS class_level text;

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_single_target;
ALTER TABLE questions ADD CONSTRAINT questions_single_target
  CHECK ((class_id IS NOT NULL) <> (class_level IS NOT NULL));

DROP POLICY IF EXISTS "questions_modify_owner" ON questions;

DROP POLICY IF EXISTS "questions_insert_teacher_scope" ON questions;
CREATE POLICY "questions_insert_teacher_scope" ON questions FOR INSERT
  TO authenticated
  WITH CHECK (
    teacher_id = auth.uid()
    AND (
      is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM teacher_assignments ta
        JOIN classes c ON c.id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND (
            ta.class_id = questions.class_id
            OR (questions.class_level IS NOT NULL AND c.level = questions.class_level)
          )
      )
    )
  );

DROP POLICY IF EXISTS "questions_update_teacher_scope" ON questions;
CREATE POLICY "questions_update_teacher_scope" ON questions FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid() OR is_super_admin())
  WITH CHECK (
    teacher_id = auth.uid()
    AND (
      is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM teacher_assignments ta
        JOIN classes c ON c.id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND (
            ta.class_id = questions.class_id
            OR (questions.class_level IS NOT NULL AND c.level = questions.class_level)
          )
      )
    )
  );

DROP POLICY IF EXISTS "questions_delete_owner" ON questions;
CREATE POLICY "questions_delete_owner" ON questions FOR DELETE
  TO authenticated
  USING (teacher_id = auth.uid() OR is_super_admin());
