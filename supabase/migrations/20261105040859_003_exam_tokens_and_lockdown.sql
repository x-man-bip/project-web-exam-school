-- Add columns
alter table public.exams add column if not exists access_token text;
alter table public.exams add column if not exists end_time timestamptz;

-- Update handle_new_user: always 'student', no more auto-super-admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  v_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  insert into public.profiles (id, role, full_name, identifier)
  values (new.id, 'student', v_name, new.raw_user_meta_data->>'identifier')
  on conflict (id) do update
    set full_name = excluded.full_name,
        identifier = excluded.identifier;
  return new;
end;
$$;

-- Replace fetch_student_exam with token + time-window enforcement
create or replace function public.fetch_student_exam(
  p_exam_id uuid,
  p_access_token text default null
)
returns table (
  out_exam_id uuid,
  out_exam_title text,
  out_exam_description text,
  out_duration_minutes int,
  out_strict_mode boolean,
  out_start_time timestamptz,
  out_max_tab_switches int,
  out_attempt_id uuid,
  out_question_id uuid,
  out_question_order int,
  out_question_type text,
  out_question_content text,
  out_question_options jsonb,
  out_points numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := auth.uid();
  v_exam public.exams%rowtype;
  v_attempt_id uuid;
begin
  if v_student is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_exam from public.exams ex where ex.id = p_exam_id;
  if not found then
    raise exception 'Exam not found';
  end if;

  -- enrollment check
  if not exists (
    select 1 from public.class_enrollments ce
    where ce.class_id = v_exam.class_id and ce.student_id = v_student
  ) then
    raise exception 'Not enrolled in this class';
  end if;

  -- teacher assignment check
  if not exists (
    select 1 from public.teacher_assignments ta
    where ta.class_id = v_exam.class_id
      and ta.subject_id = v_exam.subject_id
      and ta.teacher_id = v_exam.teacher_id
  ) then
    raise exception 'Exam not available';
  end if;

  if v_exam.status <> 'published' then
    raise exception 'Exam not published';
  end if;

  -- access token check
  if v_exam.access_token is not null and v_exam.access_token <> '' then
    if coalesce(p_access_token, '') <> v_exam.access_token then
      raise exception 'Token akses salah. Masukkan token yang diberikan guru.';
    end if;
  end if;

  -- time window checks
  if v_exam.start_time is not null and now() < v_exam.start_time then
    raise exception 'Ujian belum dimulai. Mulai pada: %', to_char(v_exam.start_time at time zone 'Asia/Jakarta', 'DD Mon YYYY HH24:MI');
  end if;

  if v_exam.end_time is not null and now() > v_exam.end_time then
    raise exception 'Waktu ujian telah berakhir.';
  end if;

  -- get or create attempt
  select ea.id into v_attempt_id from public.exam_attempts ea
    where ea.exam_id = p_exam_id and ea.student_id = v_student;
  if v_attempt_id is null then
    insert into public.exam_attempts (exam_id, student_id, status, start_time)
    values (p_exam_id, v_student, 'in_progress', now())
    returning id into v_attempt_id;
  end if;

  return query
  select
    v_exam.id, v_exam.title, v_exam.description, v_exam.duration_minutes,
    v_exam.strict_mode, v_exam.start_time, v_exam.max_tab_switches,
    v_attempt_id,
    q.id, eq.question_order, q.type, q.content, q.options, eq.points
  from public.exam_questions eq
  join public.questions q on q.id = eq.question_id
  where eq.exam_id = p_exam_id
  order by eq.question_order;
end;
$$;

revoke execute on function public.fetch_student_exam(uuid, text) from public, anon;
grant execute on function public.fetch_student_exam(uuid, text) to authenticated;
