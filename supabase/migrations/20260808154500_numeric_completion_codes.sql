-- 完成码只使用六位数字，避免被试页面出现英文字母。

alter table public.xa_probe_sessions
  alter column completion_code
  set default lpad(floor(random() * 1000000)::integer::text, 6, '0');

alter table public.xa_probe_sessions
  drop constraint if exists xa_probe_sessions_completion_code_check;

do $$
declare
  row_to_update record;
  new_code text;
begin
  for row_to_update in
    select session_id
    from public.xa_probe_sessions
    where completion_code !~ '^[0-9]{6}$'
  loop
    loop
      new_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
      exit when not exists (
        select 1 from public.xa_probe_sessions where completion_code = new_code
      );
    end loop;

    update public.xa_probe_sessions
    set completion_code = new_code
    where session_id = row_to_update.session_id;
  end loop;
end;
$$;

alter table public.xa_probe_sessions
  add constraint xa_probe_sessions_completion_code_check
  check (completion_code ~ '^[0-9]{6}$');
