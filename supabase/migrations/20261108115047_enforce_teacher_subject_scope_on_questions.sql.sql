-- Enforce that a teacher can only insert/update questions for subjects they are assigned to
-- (via teacher_assignments). Super admins bypass this check.

-- Drop and recreate the INSERT policy with subject validation
drop policy if exists "questions_insert_teacher_scope" on public.questions;

create policy "questions_insert_teacher_scope" on public.questions
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and (
      is_super_admin()
      or exists (
        select 1
        from public.teacher_assignments ta
        where ta.teacher_id = auth.uid()
          and ta.subject_id = questions.subject_id
          and (
            ta.class_id = questions.class_id
            or (questions.class_level is not null and exists (
              select 1 from public.classes c where c.id = ta.class_id and c.level = questions.class_level
            ))
          )
      )
    )
  );

-- Drop and recreate the UPDATE policy with subject validation
drop policy if exists "questions_update_teacher_scope" on public.questions;

create policy "questions_update_teacher_scope" on public.questions
  for update to authenticated
  using (teacher_id = auth.uid() or is_super_admin())
  with check (
    teacher_id = auth.uid()
    and (
      is_super_admin()
      or exists (
        select 1
        from public.teacher_assignments ta
        where ta.teacher_id = auth.uid()
          and ta.subject_id = questions.subject_id
          and (
            ta.class_id = questions.class_id
            or (questions.class_level is not null and exists (
              select 1 from public.classes c where c.id = ta.class_id and c.level = questions.class_level
            ))
          )
      )
    )
  );
