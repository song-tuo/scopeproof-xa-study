-- 恢复未完成答卷时返回平台用户编号。
-- 浏览器会先要求参与者再次填写编号，匹配后才继续答题。

create or replace function public.get_xa_session(p_session_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session public.xa_probe_sessions%rowtype;
  v_position integer;
  v_poststudy boolean;
begin
  select * into v_session from public.xa_probe_sessions
  where session_id = p_session_id and token_hash = extensions.digest(p_token, 'sha256');
  if not found then raise exception 'session not found'; end if;

  select coalesce(min(a.position) filter (where r.stimulus_id is null), 4)
    into v_position
  from public.xa_probe_assignments a
  left join public.xa_probe_responses r
    on r.session_id = a.session_id and r.stimulus_id = a.stimulus_id
  where a.session_id = p_session_id;
  select exists(select 1 from public.xa_probe_poststudy where session_id = p_session_id) into v_poststudy;

  return jsonb_build_object(
    'session_id', v_session.session_id,
    'platform_user_id', v_session.platform_user_id,
    'evidence_form', v_session.evidence_form,
    'stimulus_order', to_jsonb(array(
      select stimulus_id from public.xa_probe_assignments where session_id = p_session_id order by position
    )),
    'current_position', v_position,
    'poststudy_complete', v_poststudy,
    'status', v_session.status
  );
end;
$$;

revoke all on function public.get_xa_session(uuid, text) from public;
grant execute on function public.get_xa_session(uuid, text) to anon;
