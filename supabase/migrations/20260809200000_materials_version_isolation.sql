-- 材料版本隔离（服务端）。
--
-- 背景：R1（判断题选项措辞）与 R2（D08 指涉）改变了被试所见内容，客户端已把
-- MATERIALS_VERSION 写进 storageKey 与 consent_version。但仅有客户端隔离不够：
--
--   1. get_xa_session 不返回 consent_version，客户端的跨版本恢复防护是死代码，永不触发。
--   2. create_xa_session 统计 X/A 人数时全表扫描，旧版会话会持续影响新版随机分配，
--      导致新版子样本内部的分配不再由本版自身决定。
--
-- 本迁移修复这两点。不改表结构，只改两个函数。

-- 1) 恢复会话时返回 consent_version，让客户端能拒绝跨版本恢复。
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
    -- 新增：客户端据此拒绝跨材料版本恢复，避免同一被试前后题看到不同版本的材料。
    'consent_version', v_session.consent_version,
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

-- 2) X/A 分配只在同一 consent_version 内平衡。
--    旧版样本不再影响新版分配；每个材料版本各自是一个独立的随机化池。
create or replace function public.create_xa_session(
  p_token text,
  p_platform_user_id text,
  p_consent_version text,
  p_user_agent text default ''
)
returns jsonb
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
  v_consent text;
  i integer;
begin
  if p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid session token'; end if;
  if char_length(btrim(p_platform_user_id)) < 1 or p_platform_user_id ~ '[[:space:]]'
    then raise exception 'invalid platform user id'; end if;
  if char_length(p_consent_version) not between 1 and 80 then raise exception 'invalid consent version'; end if;
  v_consent := left(p_consent_version, 80);

  -- 锁按版本细分，不同版本之间不再互相阻塞。
  perform pg_advisory_xact_lock(hashtext('scopeproof-xa-form-balance-' || v_consent));
  select count(*) filter (where evidence_form = 'X'), count(*) filter (where evidence_form = 'A')
    into v_x, v_a
    from public.xa_probe_sessions
   where consent_version = v_consent;   -- 关键：只在本版本内平衡
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
    v_consent,
    left(coalesce(p_user_agent, ''), 400)
  );

  for i in 0 .. 3 loop
    insert into public.xa_probe_assignments(session_id, position, stimulus_id)
    values (v_session_id, i, v_ids[((v_offset + i) % 4) + 1]);
  end loop;

  return jsonb_build_object(
    'session_id', v_session_id,
    'evidence_form', v_form,
    'consent_version', v_consent,
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
