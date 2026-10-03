-- 課堂互動工具 V1.7
-- 在 Supabase SQL Editor 執行一次。
-- 前端只能使用 Publishable key（或舊版 anon key），絕對不要使用 secret/service-role key。

create extension if not exists pgcrypto;

create table if not exists public.classroom_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  teacher_token text not null,
  title text not null,
  activity_encoded text not null,
  activity_mode text not null default '',
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.classroom_sessions(id) on delete cascade,
  student_code text not null,
  participant_token text not null,
  joined_at timestamptz not null default now(),
  unique(session_id, student_code)
);

create table if not exists public.student_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.classroom_sessions(id) on delete cascade,
  participant_id uuid not null references public.session_participants(id) on delete cascade,
  task_index integer not null,
  stage_key text not null default 'final',
  mode text not null,
  selected_elements jsonb not null default '[]'::jsonb,
  selected_type text,
  payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique(session_id, participant_id, task_index, stage_key)
);


-- V1.8：教師同步逐層揭露狀態（也可安全套用在既有 V1.7 資料庫）
alter table public.classroom_sessions add column if not exists current_stage integer not null default 1;
alter table public.classroom_sessions add column if not exists stage_count integer not null default 1;

alter table public.classroom_sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.student_responses enable row level security;

-- 不讓瀏覽器直接存取資料表；所有操作都經過下方 RPC。
revoke all on table public.classroom_sessions from anon, authenticated;
revoke all on table public.session_participants from anon, authenticated;
revoke all on table public.student_responses from anon, authenticated;

create or replace function public.classroom_healthcheck()
returns text
language sql
security definer
set search_path = public
as $$
  select 'ok'::text;
$$;

drop function if exists public.create_classroom_session(text,text,text,text,text);

create or replace function public.create_classroom_session(
  p_code text,
  p_teacher_token text,
  p_title text,
  p_activity_encoded text,
  p_activity_mode text default '',
  p_stage_count integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if length(trim(p_code)) <> 5 then
    raise exception 'invalid session code';
  end if;
  if length(trim(p_teacher_token)) < 20 then
    raise exception 'invalid teacher token';
  end if;

  insert into public.classroom_sessions(code, teacher_token, title, activity_encoded, activity_mode, current_stage, stage_count)
  values (upper(trim(p_code)), p_teacher_token, coalesce(nullif(trim(p_title),''),'課堂活動'), p_activity_encoded, coalesce(p_activity_mode,''), 1, greatest(1, coalesce(p_stage_count,1)))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.join_classroom_session(
  p_code text,
  p_student_code text,
  p_participant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.classroom_sessions%rowtype;
  v_participant_id uuid;
begin
  select * into v_session
  from public.classroom_sessions
  where code = upper(trim(p_code))
    and status = 'active'
  limit 1;

  if v_session.id is null then
    raise exception 'session not found';
  end if;

  if length(trim(p_student_code)) = 0 then
    raise exception 'student code required';
  end if;

  insert into public.session_participants(session_id, student_code, participant_token)
  values (v_session.id, trim(p_student_code), p_participant_token)
  on conflict (session_id, student_code)
  do update set participant_token = excluded.participant_token
  returning id into v_participant_id;

  return jsonb_build_object(
    'session_id', v_session.id,
    'participant_id', v_participant_id,
    'title', v_session.title,
    'activity_encoded', v_session.activity_encoded,
    'activity_mode', v_session.activity_mode,
    'current_stage', v_session.current_stage,
    'stage_count', v_session.stage_count
  );
end;
$$;

create or replace function public.submit_classroom_response(
  p_session_id uuid,
  p_participant_token text,
  p_task_index integer,
  p_stage_key text,
  p_mode text,
  p_selected_elements jsonb default '[]'::jsonb,
  p_selected_type text default null,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id uuid;
begin
  select id into v_participant_id
  from public.session_participants
  where session_id = p_session_id
    and participant_token = p_participant_token
  limit 1;

  if v_participant_id is null then
    raise exception 'invalid participant token';
  end if;

  insert into public.student_responses(
    session_id, participant_id, task_index, stage_key, mode,
    selected_elements, selected_type, payload, submitted_at
  )
  values (
    p_session_id, v_participant_id, p_task_index, coalesce(nullif(p_stage_key,''),'final'),
    p_mode, coalesce(p_selected_elements,'[]'::jsonb), p_selected_type,
    coalesce(p_payload,'{}'::jsonb), now()
  )
  on conflict (session_id, participant_id, task_index, stage_key)
  do update set
    mode = excluded.mode,
    selected_elements = excluded.selected_elements,
    selected_type = excluded.selected_type,
    payload = excluded.payload,
    submitted_at = now();

  return true;
end;
$$;

create or replace function public.get_teacher_session(
  p_session_id uuid,
  p_teacher_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.classroom_sessions%rowtype;
begin
  select * into v_session
  from public.classroom_sessions
  where id = p_session_id
    and teacher_token = p_teacher_token
  limit 1;

  if v_session.id is null then
    raise exception 'invalid teacher token';
  end if;

  return jsonb_build_object(
    'id', v_session.id,
    'code', v_session.code,
    'title', v_session.title,
    'status', v_session.status,
    'activity_mode', v_session.activity_mode,
    'current_stage', v_session.current_stage,
    'stage_count', v_session.stage_count,
    'participant_count', (
      select count(*) from public.session_participants p
      where p.session_id = v_session.id
    ),
    'response_count', (
      select count(*) from public.student_responses r
      where r.session_id = v_session.id
    ),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', r.participant_id,
        'student_code', p.student_code,
        'task_index', r.task_index,
        'stage_key', r.stage_key,
        'mode', r.mode,
        'selected_elements', r.selected_elements,
        'selected_type', r.selected_type,
        'payload', r.payload,
        'submitted_at', r.submitted_at
      ) order by r.submitted_at)
      from public.student_responses r
      join public.session_participants p on p.id = r.participant_id
      where r.session_id = v_session.id
    ), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'student_code', p.student_code,
          'joined_at', p.joined_at,
          'response_count', (
            select count(*) from public.student_responses r
            where r.participant_id = p.id
          ),
          'last_submitted_at', (
            select max(r.submitted_at) from public.student_responses r
            where r.participant_id = p.id
          )
        )
        order by p.student_code
      )
      from public.session_participants p
      where p.session_id = v_session.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_classroom_stage(
  p_session_id uuid,
  p_teacher_token text,
  p_stage integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage integer;
begin
  update public.classroom_sessions
  set current_stage = greatest(1, least(coalesce(p_stage,1), stage_count))
  where id = p_session_id and teacher_token = p_teacher_token
  returning current_stage into v_stage;
  if v_stage is null then raise exception 'invalid teacher token'; end if;
  return v_stage;
end;
$$;

create or replace function public.get_student_session_state(
  p_session_id uuid,
  p_participant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.classroom_sessions%rowtype;
  v_participant_id uuid;
begin
  select s.*, p.id into v_session, v_participant_id
  from public.classroom_sessions s
  join public.session_participants p on p.session_id = s.id
  where s.id = p_session_id and p.participant_token = p_participant_token
  limit 1;
  if v_session.id is null or v_participant_id is null then raise exception 'invalid participant token'; end if;
  return jsonb_build_object(
    'current_stage',v_session.current_stage,
    'stage_count',v_session.stage_count,
    'status',v_session.status,
    'responses',coalesce((
      select jsonb_agg(jsonb_build_object(
        'stage_key',r.stage_key,
        'selected_type',r.selected_type,
        'payload',r.payload,
        'submitted_at',r.submitted_at
      ) order by r.submitted_at)
      from public.student_responses r
      where r.session_id = v_session.id
        and r.participant_id = v_participant_id
        and r.mode = 'progressive-reveal'
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.classroom_healthcheck() from public;
revoke all on function public.create_classroom_session(text,text,text,text,text,integer) from public;
revoke all on function public.join_classroom_session(text,text,text) from public;
revoke all on function public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb) from public;
revoke all on function public.get_teacher_session(uuid,text) from public;
revoke all on function public.set_classroom_stage(uuid,text,integer) from public;
revoke all on function public.get_student_session_state(uuid,text) from public;

grant execute on function public.classroom_healthcheck() to anon, authenticated;
grant execute on function public.create_classroom_session(text,text,text,text,text,integer) to anon, authenticated;
grant execute on function public.join_classroom_session(text,text,text) to anon, authenticated;
grant execute on function public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb) to anon, authenticated;
grant execute on function public.get_teacher_session(uuid,text) to anon, authenticated;
grant execute on function public.set_classroom_stage(uuid,text,integer) to anon, authenticated;
grant execute on function public.get_student_session_state(uuid,text) to anon, authenticated;
