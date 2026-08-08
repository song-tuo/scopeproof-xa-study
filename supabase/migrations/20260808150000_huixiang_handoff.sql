-- 回眸数据衔接：保存不定长的平台用户 ID，并生成唯一 6 位完成码。
-- 迁移执行时实验入口处于暂停状态，数据库无正式会话。

alter table public.xa_probe_sessions
  add column platform_user_id text not null unique
    check (char_length(btrim(platform_user_id)) >= 1 and platform_user_id !~ '[[:space:]]'),
  add column completion_code text not null unique
    default upper(encode(extensions.gen_random_bytes(3), 'hex'))
    check (completion_code ~ '^[0-9A-F]{6}$');

revoke all on function public.create_xa_session(text, text, text) from anon, authenticated, public;
drop function public.create_xa_session(text, text, text);

create function public.create_xa_session(
  p_token text,
  p_platform_user_id text,
  p_consent_version text,
  p_user_agent text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session_id uuid := extensions.gen_random_uuid();
  v_form text;
  v_x integer;
  v_a integer;
  v_offset integer := floor(random() * 4)::integer;
  v_ids text[] := array['P01', 'S02', 'C05', 'D08'];
  i integer;
begin
  if p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid session token'; end if;
  if char_length(btrim(p_platform_user_id)) < 1 or p_platform_user_id ~ '[[:space:]]'
    then raise exception 'invalid platform user id'; end if;
  if char_length(p_consent_version) not between 1 and 80 then raise exception 'invalid consent version'; end if;

  perform pg_advisory_xact_lock(hashtext('scopeproof-xa-form-balance'));
  select count(*) filter (where evidence_form = 'X'), count(*) filter (where evidence_form = 'A')
    into v_x, v_a from public.xa_probe_sessions;
  if v_x < v_a then v_form := 'X';
  elsif v_a < v_x then v_form := 'A';
  else v_form := case when random() < 0.5 then 'X' else 'A' end;
  end if;

  insert into public.xa_probe_sessions(
    session_id, token_hash, platform_user_id, evidence_form, consent_version, user_agent
  ) values (
    v_session_id,
    extensions.digest(p_token, 'sha256'),
    p_platform_user_id,
    v_form,
    left(p_consent_version, 80),
    left(coalesce(p_user_agent, ''), 400)
  );

  for i in 0..3 loop
    insert into public.xa_probe_assignments(session_id, position, stimulus_id)
    values (v_session_id, i, v_ids[((v_offset + i) % 4) + 1]);
  end loop;

  return jsonb_build_object(
    'session_id', v_session_id,
    'evidence_form', v_form,
    'stimulus_order', to_jsonb(array(
      select stimulus_id from public.xa_probe_assignments where session_id = v_session_id order by position
    )),
    'current_position', 0,
    'poststudy_complete', false,
    'status', 'active'
  );
end;
$$;

revoke all on function public.create_xa_session(text, text, text, text) from public;
grant execute on function public.create_xa_session(text, text, text, text) to anon;

create or replace function public.complete_xa_session(p_session_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_completion_code text;
begin
  if not exists (
    select 1 from public.xa_probe_sessions
    where session_id = p_session_id and token_hash = extensions.digest(p_token, 'sha256')
  ) then raise exception 'session not found'; end if;
  if (select count(*) from public.xa_probe_responses where session_id = p_session_id) <> 4
    or not exists (select 1 from public.xa_probe_poststudy where session_id = p_session_id)
  then raise exception 'probe incomplete'; end if;
  update public.xa_probe_sessions
  set status = 'complete', completed_at = coalesce(completed_at, now())
  where session_id = p_session_id
  returning completion_code into v_completion_code;
  return jsonb_build_object('complete', true, 'completion_code', v_completion_code);
end;
$$;

revoke all on function public.complete_xa_session(uuid, text) from public;
grant execute on function public.complete_xa_session(uuid, text) to anon;
