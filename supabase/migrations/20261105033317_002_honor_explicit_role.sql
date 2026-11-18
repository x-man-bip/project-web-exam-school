create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_name text;
  v_requested text;
begin
  v_requested := new.raw_user_meta_data->>'role';
  v_role := coalesce(
    nullif(v_requested, ''),
    case when not exists (select 1 from public.profiles p where p.role = 'super_admin') then 'super_admin' else 'student' end
  );
  v_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  insert into public.profiles (id, role, full_name, identifier)
  values (new.id, v_role, v_name, new.raw_user_meta_data->>'identifier')
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        identifier = excluded.identifier;
  return new;
end;
$$;
