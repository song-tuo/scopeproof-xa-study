-- ScopeProof X/A 独立预试：全新 Supabase 项目初始化脚本
-- 直接表访问全部关闭；网页只能调用下方带会话令牌校验的 RPC。

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.xa_probe_sessions (
  session_id uuid primary key default extensions.gen_random_uuid(),
  token_hash bytea not null,
  platform_user_id text not null unique
    check (char_length(btrim(platform_user_id)) >= 1 and platform_user_id !~ '[[:space:]]'),
  completion_code text not null unique
    default lpad(floor(random() * 1000000)::integer::text, 6, '0')
    check (completion_code ~ '^[0-9]{6}$'),
  evidence_form text not null check (evidence_form in ('X', 'A')),
  consent_version text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'active' check (status in ('active', 'complete', 'withdrawn')),
  user_agent text
);

create table if not exists public.xa_probe_assignments (
  session_id uuid not null references public.xa_probe_sessions(session_id) on delete cascade,
  position smallint not null check (position between 0 and 3),
  stimulus_id text not null check (stimulus_id in ('P01', 'S02', 'C05', 'D08')),
  evidence_viewed_at timestamptz,
  response_saved_at timestamptz,
  report_id text,
  evidence_signature text,
  primary key (session_id, position),
  unique (session_id, stimulus_id)
);

create table if not exists public.xa_probe_responses (
  session_id uuid not null references public.xa_probe_sessions(session_id) on delete cascade,
  stimulus_id text not null,
  judgment text not null check (judgment in ('supports', 'contradicts', 'cannot_determine')),
  confidence smallint not null check (confidence between 0 and 100),
  evidence_strength smallint not null check (evidence_strength between 1 and 7),
  inspect_ms integer not null check (inspect_ms between 0 and 3600000),
  response_ms integer not null check (response_ms between 0 and 3600000),
  details_opened boolean not null,
  received_at timestamptz not null default now(),
  primary key (session_id, stimulus_id),
  foreign key (session_id, stimulus_id)
    references public.xa_probe_assignments(session_id, stimulus_id) on delete cascade
);

create table if not exists public.xa_probe_poststudy (
  session_id uuid primary key references public.xa_probe_sessions(session_id) on delete cascade,
  source_identity text not null check (source_identity in ('independent_verifier', 'publisher', 'browser', 'unsure')),
  evidence_timing text not null check (evidence_timing in ('during_session', 'before_session', 'mixed', 'unsure')),
  operations_recall text not null check (operations_recall in ('read_generate_compare', 'signature_only', 'visual_only', 'unsure')),
  original_production_observed text not null check (original_production_observed in ('yes', 'no', 'unsure')),
  source_confidence smallint not null check (source_confidence between 1 and 7),
  explanation text not null check (char_length(btrim(explanation)) between 1 and 1200),
  received_at timestamptz not null default now()
);

create table if not exists public.xa_probe_events (
  event_id bigint generated always as identity primary key,
  session_id uuid not null references public.xa_probe_sessions(session_id) on delete cascade,
  stimulus_id text,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

alter table public.xa_probe_sessions enable row level security;
alter table public.xa_probe_assignments enable row level security;
alter table public.xa_probe_responses enable row level security;
alter table public.xa_probe_poststudy enable row level security;
alter table public.xa_probe_events enable row level security;

revoke all on public.xa_probe_sessions from anon, authenticated;
revoke all on public.xa_probe_assignments from anon, authenticated;
revoke all on public.xa_probe_responses from anon, authenticated;
revoke all on public.xa_probe_poststudy from anon, authenticated;
revoke all on public.xa_probe_events from anon, authenticated;
revoke usage, select on all sequences in schema public from anon, authenticated;

create or replace function public.create_xa_session(
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

  insert into public.xa_probe_sessions(session_id, token_hash, platform_user_id, evidence_form, consent_version, user_agent)
  values (v_session_id, extensions.digest(p_token, 'sha256'), p_platform_user_id, v_form, left(p_consent_version, 80), left(coalesce(p_user_agent, ''), 400));

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

create or replace function public.mark_xa_evidence(
  p_session_id uuid,
  p_token text,
  p_stimulus_id text,
  p_report_id text,
  p_evidence_signature text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_form text;
begin
  if p_stimulus_id not in ('P01', 'S02', 'C05', 'D08') then raise exception 'invalid stimulus'; end if;
  if char_length(p_report_id) not between 1 and 80 or p_evidence_signature !~ '^[0-9a-f]{64}$' then raise exception 'invalid evidence metadata'; end if;
  select evidence_form into v_form from public.xa_probe_sessions
  where session_id = p_session_id and token_hash = extensions.digest(p_token, 'sha256') and status = 'active';
  if not found then raise exception 'active session not found'; end if;

  update public.xa_probe_assignments
  set evidence_viewed_at = now(), report_id = left(p_report_id, 80), evidence_signature = p_evidence_signature
  where session_id = p_session_id and stimulus_id = p_stimulus_id;
  if not found then raise exception 'stimulus not assigned'; end if;

  insert into public.xa_probe_events(session_id, stimulus_id, event_type, metadata)
  values (p_session_id, p_stimulus_id,
    case when v_form = 'X' then 'live_execution_completed' else 'static_report_viewed' end,
    jsonb_build_object('evidence_form', v_form, 'report_id', p_report_id, 'evidence_signature', p_evidence_signature));
  return true;
end;
$$;

create or replace function public.save_xa_response(
  p_session_id uuid,
  p_token text,
  p_stimulus_id text,
  p_judgment text,
  p_confidence integer,
  p_evidence_strength integer,
  p_inspect_ms integer,
  p_response_ms integer,
  p_details_opened boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not exists (
    select 1 from public.xa_probe_sessions
    where session_id = p_session_id and token_hash = extensions.digest(p_token, 'sha256') and status = 'active'
  ) then raise exception 'active session not found'; end if;
  if p_judgment not in ('supports', 'contradicts', 'cannot_determine')
    or p_confidence not between 0 and 100
    or p_evidence_strength not between 1 and 7
    or p_inspect_ms not between 0 and 3600000
    or p_response_ms not between 0 and 3600000
  then raise exception 'invalid response'; end if;
  if not exists (
    select 1 from public.xa_probe_assignments
    where session_id = p_session_id and stimulus_id = p_stimulus_id and evidence_viewed_at is not null
  ) then raise exception 'evidence not viewed'; end if;

  insert into public.xa_probe_responses(
    session_id, stimulus_id, judgment, confidence, evidence_strength,
    inspect_ms, response_ms, details_opened
  ) values (
    p_session_id, p_stimulus_id, p_judgment, p_confidence, p_evidence_strength,
    p_inspect_ms, p_response_ms, p_details_opened
  )
  on conflict (session_id, stimulus_id) do update set
    judgment = excluded.judgment,
    confidence = excluded.confidence,
    evidence_strength = excluded.evidence_strength,
    inspect_ms = excluded.inspect_ms,
    response_ms = excluded.response_ms,
    details_opened = excluded.details_opened,
    received_at = now();

  update public.xa_probe_assignments set response_saved_at = now()
  where session_id = p_session_id and stimulus_id = p_stimulus_id;
  return public.get_xa_session(p_session_id, p_token);
end;
$$;

create or replace function public.save_xa_poststudy(
  p_session_id uuid,
  p_token text,
  p_source_identity text,
  p_evidence_timing text,
  p_operations_recall text,
  p_original_production_observed text,
  p_source_confidence integer,
  p_explanation text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not exists (
    select 1 from public.xa_probe_sessions
    where session_id = p_session_id and token_hash = extensions.digest(p_token, 'sha256') and status = 'active'
  ) then raise exception 'active session not found'; end if;
  if (select count(*) from public.xa_probe_responses where session_id = p_session_id) <> 4 then raise exception 'trials incomplete'; end if;
  if p_source_identity not in ('independent_verifier', 'publisher', 'browser', 'unsure')
    or p_evidence_timing not in ('during_session', 'before_session', 'mixed', 'unsure')
    or p_operations_recall not in ('read_generate_compare', 'signature_only', 'visual_only', 'unsure')
    or p_original_production_observed not in ('yes', 'no', 'unsure')
    or p_source_confidence not between 1 and 7
    or char_length(btrim(p_explanation)) not between 1 and 1200
  then raise exception 'invalid poststudy response'; end if;

  insert into public.xa_probe_poststudy(
    session_id, source_identity, evidence_timing, operations_recall,
    original_production_observed, source_confidence, explanation
  ) values (
    p_session_id, p_source_identity, p_evidence_timing, p_operations_recall,
    p_original_production_observed, p_source_confidence, btrim(p_explanation)
  )
  on conflict (session_id) do update set
    source_identity = excluded.source_identity,
    evidence_timing = excluded.evidence_timing,
    operations_recall = excluded.operations_recall,
    original_production_observed = excluded.original_production_observed,
    source_confidence = excluded.source_confidence,
    explanation = excluded.explanation,
    received_at = now();
  return true;
end;
$$;

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

revoke all on function public.create_xa_session(text, text, text, text) from public;
revoke all on function public.get_xa_session(uuid, text) from public;
revoke all on function public.mark_xa_evidence(uuid, text, text, text, text) from public;
revoke all on function public.save_xa_response(uuid, text, text, text, integer, integer, integer, integer, boolean) from public;
revoke all on function public.save_xa_poststudy(uuid, text, text, text, text, text, integer, text) from public;
revoke all on function public.complete_xa_session(uuid, text) from public;

grant execute on function public.create_xa_session(text, text, text, text) to anon;
grant execute on function public.get_xa_session(uuid, text) to anon;
grant execute on function public.mark_xa_evidence(uuid, text, text, text, text) to anon;
grant execute on function public.save_xa_response(uuid, text, text, text, integer, integer, integer, integer, boolean) to anon;
grant execute on function public.save_xa_poststudy(uuid, text, text, text, text, text, integer, text) to anon;
grant execute on function public.complete_xa_session(uuid, text) to anon;

create or replace view public.xa_probe_researcher_status as
select
  evidence_form,
  count(*) as started,
  count(*) filter (where status = 'complete') as completed,
  count(*) filter (where status = 'active') as active,
  min(created_at) as first_start,
  max(created_at) as latest_start
from public.xa_probe_sessions
group by evidence_form;

revoke all on public.xa_probe_researcher_status from anon, authenticated;
