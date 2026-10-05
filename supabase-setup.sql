-- V2.12.0 SQL SETUP
-- 修正 get_student_session_state() 中：
--   select s.*, p.id into v_session, v_participant_id
-- 造成 PostgreSQL 42601：
--   record variable cannot be part of multiple-item INTO list
--
-- 本檔可直接整份重新執行；既有 schema 採 IF NOT EXISTS / CREATE OR REPLACE，可安全重跑。

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
  is_hidden boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique(session_id, participant_id, task_index, stage_key)
);

-- V2.9.1：既有資料庫安全升級；必須在任何引用 is_hidden 的 RPC 建立前執行。
alter table public.student_responses
  add column if not exists is_hidden boolean not null default false;


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
  if coalesce(p_activity_mode,'') = 'layered-deliberation' then
    raise exception 'use create_deliberation_session for layered deliberation';
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
        'response_id', r.id,
        'participant_id', r.participant_id,
        'student_code', p.student_code,
        'task_index', r.task_index,
        'stage_key', r.stage_key,
        'mode', r.mode,
        'selected_elements', r.selected_elements,
        'selected_type', r.selected_type,
        'payload', r.payload,
        'is_hidden', coalesce(r.is_hidden,false),
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
  -- PostgreSQL 不允許 %ROWTYPE 變數與 scalar 變數一起放在同一個多目標 INTO。
  -- 因此分兩步取得 participant id 與完整 session row。
  select p.id into v_participant_id
  from public.session_participants p
  where p.session_id = p_session_id
    and p.participant_token = p_participant_token
  limit 1;

  select s.* into v_session
  from public.classroom_sessions s
  where s.id = p_session_id
  limit 1;

  if v_session.id is null or v_participant_id is null then
    raise exception 'invalid participant token';
  end if;

  return jsonb_build_object(
    'current_stage', v_session.current_stage,
    'stage_count', v_session.stage_count,
    'status', v_session.status,

    -- 只回傳「這位學生自己的」逐層／開放分類作答。
    'responses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stage_key', r.stage_key,
          'mode', r.mode,
          'selected_type', r.selected_type,
          'selected_elements', r.selected_elements,
          'payload', r.payload,
          'submitted_at', r.submitted_at
        )
        order by r.submitted_at
      )
      from public.student_responses r
      where r.session_id = v_session.id
        and r.participant_id = v_participant_id
        and r.mode in ('progressive-reveal','open-classification')
    ), '[]'::jsonb),

    -- V1.9：學生只取得全班「匿名聚合」結果，不取得其他學生的座號或個別作答。
    'open_stats', jsonb_build_object(
      'initial', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.selected_type,
            'name', q.type_name,
            'count', q.total
          )
          order by q.total desc, q.type_name
        )
        from (
          select
            r.selected_type,
            coalesce(nullif(r.payload->>'selectedTypeName',''), r.selected_type, '未命名類型') as type_name,
            count(*) as total
          from public.student_responses r
          where r.session_id = v_session.id
            and r.mode = 'open-classification'
            and r.stage_key = 'initial'
          group by
            r.selected_type,
            coalesce(nullif(r.payload->>'selectedTypeName',''), r.selected_type, '未命名類型')
        ) q
      ), '[]'::jsonb),

      'final', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.selected_type,
            'name', q.type_name,
            'count', q.total
          )
          order by q.total desc, q.type_name
        )
        from (
          select
            r.selected_type,
            coalesce(nullif(r.payload->>'selectedTypeName',''), r.selected_type, '未命名類型') as type_name,
            count(*) as total
          from public.student_responses r
          where r.session_id = v_session.id
            and r.mode = 'open-classification'
            and r.stage_key = 'final'
          group by
            r.selected_type,
            coalesce(nullif(r.payload->>'selectedTypeName',''), r.selected_type, '未命名類型')
        ) q
      ), '[]'::jsonb),

      'initial_total', (
        select count(*)
        from public.student_responses r
        where r.session_id = v_session.id
          and r.mode = 'open-classification'
          and r.stage_key = 'initial'
      ),

      'final_total', (
        select count(*)
        from public.student_responses r
        where r.session_id = v_session.id
          and r.mode = 'open-classification'
          and r.stage_key = 'final'
      ),

      'changed_count', (
        select count(*)
        from public.student_responses r
        where r.session_id = v_session.id
          and r.mode = 'open-classification'
          and r.stage_key = 'final'
          and coalesce(r.payload->>'changed','false') = 'true'
      ),

      'unchanged_count', (
        select count(*)
        from public.student_responses r
        where r.session_id = v_session.id
          and r.mode = 'open-classification'
          and r.stage_key = 'final'
          and coalesce(r.payload->>'changed','false') <> 'true'
      )
    )
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


-- =========================================================
-- V2.1：完整課程 Course Session
-- 可安全套用在既有 V1.7～V2.0 資料庫。
-- 執行本檔後，原本單一 Activity Session 仍可繼續使用。
-- =========================================================

alter table public.classroom_sessions
  add column if not exists session_kind text not null default 'activity';

alter table public.classroom_sessions
  add column if not exists course_id text not null default '';

alter table public.classroom_sessions
  add column if not exists course_encoded text not null default '';

alter table public.classroom_sessions
  add column if not exists current_node_ref text not null default '';

alter table public.classroom_sessions
  add column if not exists revision integer not null default 1;

alter table public.student_responses
  add column if not exists node_ref text;

create table if not exists public.course_session_progress (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.classroom_sessions(id) on delete cascade,
  participant_id uuid not null references public.session_participants(id) on delete cascade,
  node_ref text not null,
  status text not null default 'in-progress' check (status in ('in-progress','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(session_id, participant_id, node_ref)
);

alter table public.course_session_progress enable row level security;
revoke all on table public.course_session_progress from anon, authenticated;

create or replace function public.create_course_session(
  p_code text,
  p_teacher_token text,
  p_title text,
  p_course_encoded text,
  p_course_id text,
  p_current_node_ref text,
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
  if length(trim(p_course_encoded)) = 0 or length(trim(p_current_node_ref)) = 0 then
    raise exception 'invalid course session data';
  end if;
  if coalesce(p_activity_mode,'') = 'layered-deliberation' then
    raise exception 'layered deliberation is not supported inside course session';
  end if;

  insert into public.classroom_sessions(
    code, teacher_token, title,
    activity_encoded, activity_mode, current_stage, stage_count,
    session_kind, course_id, course_encoded, current_node_ref, revision
  )
  values (
    upper(trim(p_code)),
    p_teacher_token,
    coalesce(nullif(trim(p_title),''),'完整課程'),
    '',
    coalesce(p_activity_mode,''),
    1,
    greatest(1,coalesce(p_stage_count,1)),
    'course',
    coalesce(p_course_id,''),
    p_course_encoded,
    p_current_node_ref,
    1
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- V2.1：加入 Session 時同時回傳 Activity / Course 所需資訊。
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
    'session_kind', v_session.session_kind,
    'activity_encoded', v_session.activity_encoded,
    'activity_mode', v_session.activity_mode,
    'current_stage', v_session.current_stage,
    'stage_count', v_session.stage_count,
    'course_id', v_session.course_id,
    'course_encoded', v_session.course_encoded,
    'current_node_ref', v_session.current_node_ref,
    'revision', v_session.revision
  );
end;
$$;

-- 移除 V1.x 的 8 參數版本，改由最後一個 node_ref 可選參數的 V2.1 版本接手。
drop function if exists public.submit_classroom_response(
  uuid,text,integer,text,text,jsonb,text,jsonb
);

create or replace function public.submit_classroom_response(
  p_session_id uuid,
  p_participant_token text,
  p_task_index integer,
  p_stage_key text,
  p_mode text,
  p_selected_elements jsonb default '[]'::jsonb,
  p_selected_type text default null,
  p_payload jsonb default '{}'::jsonb,
  p_node_ref text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id uuid;
  v_status text;
begin
  select p.id, s.status into v_participant_id, v_status
  from public.session_participants p
  join public.classroom_sessions s on s.id = p.session_id
  where p.session_id = p_session_id
    and p.participant_token = p_participant_token
  limit 1;

  if v_participant_id is null then
    raise exception 'invalid participant token';
  end if;
  if v_status <> 'active' then
    raise exception 'session closed';
  end if;

  update public.student_responses
  set mode = p_mode,
      selected_elements = coalesce(p_selected_elements,'[]'::jsonb),
      selected_type = p_selected_type,
      payload = coalesce(p_payload,'{}'::jsonb),
      submitted_at = now()
  where session_id = p_session_id
    and participant_id = v_participant_id
    and coalesce(node_ref,'') = coalesce(nullif(trim(coalesce(p_node_ref,'')),''),'')
    and task_index = p_task_index
    and stage_key = coalesce(nullif(p_stage_key,''),'final');

  if not found then
    insert into public.student_responses(
      session_id, participant_id, node_ref, task_index, stage_key, mode,
      selected_elements, selected_type, payload, submitted_at
    )
    values (
      p_session_id,
      v_participant_id,
      nullif(trim(coalesce(p_node_ref,'')),''),
      p_task_index,
      coalesce(nullif(p_stage_key,''),'final'),
      p_mode,
      coalesce(p_selected_elements,'[]'::jsonb),
      p_selected_type,
      coalesce(p_payload,'{}'::jsonb),
      now()
    );
  end if;

  return true;
end;
$$;

-- 注意：舊 unique key 不包含 node_ref。V2.1 讓同一 Activity 可在 Course 的不同 Node 重複使用。
alter table public.student_responses
  drop constraint if exists student_responses_session_id_participant_id_task_index_stage_key_key;

create unique index if not exists student_responses_v21_unique
on public.student_responses(
  session_id,
  participant_id,
  coalesce(node_ref,''),
  task_index,
  stage_key
);

create or replace function public.set_course_session_node(
  p_session_id uuid,
  p_teacher_token text,
  p_node_ref text,
  p_activity_mode text default '',
  p_stage_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision integer;
begin
  if coalesce(p_activity_mode,'') = 'layered-deliberation' then
    raise exception 'layered deliberation is not supported inside course session';
  end if;

  update public.classroom_sessions
  set current_node_ref = p_node_ref,
      revision = revision + 1,
      activity_mode = coalesce(p_activity_mode,''),
      current_stage = 1,
      stage_count = greatest(1,coalesce(p_stage_count,1))
  where id = p_session_id
    and teacher_token = p_teacher_token
    and session_kind = 'course'
    and status = 'active'
  returning revision into v_revision;

  if v_revision is null then
    raise exception 'invalid teacher token or course session';
  end if;

  return jsonb_build_object(
    'current_node_ref', p_node_ref,
    'revision', v_revision,
    'activity_mode', coalesce(p_activity_mode,''),
    'current_stage', 1,
    'stage_count', greatest(1,coalesce(p_stage_count,1))
  );
end;
$$;

create or replace function public.set_course_node_progress(
  p_session_id uuid,
  p_participant_token text,
  p_node_ref text,
  p_status text default 'completed'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id uuid;
  v_session_status text;
  v_status text;
begin
  select p.id, s.status into v_participant_id, v_session_status
  from public.session_participants p
  join public.classroom_sessions s on s.id = p.session_id
  where p.session_id = p_session_id
    and p.participant_token = p_participant_token
    and s.session_kind = 'course'
  limit 1;

  if v_participant_id is null then
    raise exception 'invalid participant token';
  end if;
  if v_session_status <> 'active' then
    raise exception 'session closed';
  end if;
  if length(trim(p_node_ref)) = 0 then
    raise exception 'node ref required';
  end if;

  v_status := case when p_status = 'in-progress' then 'in-progress' else 'completed' end;

  insert into public.course_session_progress(
    session_id, participant_id, node_ref, status, started_at, completed_at
  )
  values (
    p_session_id,
    v_participant_id,
    p_node_ref,
    v_status,
    now(),
    case when v_status = 'completed' then now() else null end
  )
  on conflict (session_id, participant_id, node_ref)
  do update set
    status = excluded.status,
    completed_at = case
      when excluded.status = 'completed' then coalesce(public.course_session_progress.completed_at, now())
      else public.course_session_progress.completed_at
    end;

  return true;
end;
$$;

create or replace function public.close_classroom_session(
  p_session_id uuid,
  p_teacher_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.classroom_sessions
  set status = 'closed'
  where id = p_session_id
    and teacher_token = p_teacher_token;

  if not found then
    raise exception 'invalid teacher token';
  end if;

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
    'session_kind', v_session.session_kind,
    'course_id', v_session.course_id,
    'course_encoded', v_session.course_encoded,
    'current_node_ref', v_session.current_node_ref,
    'revision', v_session.revision,
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
        'response_id', r.id,
        'participant_id', r.participant_id,
        'student_code', p.student_code,
        'node_ref', coalesce(r.node_ref,''),
        'task_index', r.task_index,
        'stage_key', r.stage_key,
        'mode', r.mode,
        'selected_elements', r.selected_elements,
        'selected_type', r.selected_type,
        'payload', r.payload,
        'is_hidden', coalesce(r.is_hidden,false),
        'submitted_at', r.submitted_at
      ) order by r.submitted_at)
      from public.student_responses r
      join public.session_participants p on p.id = r.participant_id
      where r.session_id = v_session.id
    ), '[]'::jsonb),

    'progress', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', cp.participant_id,
        'student_code', p.student_code,
        'node_ref', cp.node_ref,
        'status', cp.status,
        'started_at', cp.started_at,
        'completed_at', cp.completed_at
      ) order by p.student_code, cp.started_at)
      from public.course_session_progress cp
      join public.session_participants p on p.id = cp.participant_id
      where cp.session_id = v_session.id
    ), '[]'::jsonb),

    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
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
      ) order by p.student_code)
      from public.session_participants p
      where p.session_id = v_session.id
    ), '[]'::jsonb)
  );
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
  -- PostgreSQL 不允許 %ROWTYPE 變數與 scalar 變數一起放在同一個多目標 INTO。
  -- 因此分兩步取得 participant id 與完整 session row。
  select p.id into v_participant_id
  from public.session_participants p
  where p.session_id = p_session_id
    and p.participant_token = p_participant_token
  limit 1;

  select s.* into v_session
  from public.classroom_sessions s
  where s.id = p_session_id
  limit 1;

  if v_session.id is null or v_participant_id is null then
    raise exception 'invalid participant token';
  end if;

  return jsonb_build_object(
    'session_kind', v_session.session_kind,
    'current_node_ref', v_session.current_node_ref,
    'revision', v_session.revision,
    'current_stage', v_session.current_stage,
    'stage_count', v_session.stage_count,
    'status', v_session.status,

    'progress', coalesce((
      select jsonb_agg(jsonb_build_object(
        'node_ref', cp.node_ref,
        'status', cp.status,
        'started_at', cp.started_at,
        'completed_at', cp.completed_at
      ) order by cp.started_at)
      from public.course_session_progress cp
      where cp.session_id = v_session.id
        and cp.participant_id = v_participant_id
    ), '[]'::jsonb),

    'responses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'node_ref', coalesce(r.node_ref,''),
          'stage_key', r.stage_key,
          'mode', r.mode,
          'selected_type', r.selected_type,
          'selected_elements', r.selected_elements,
          'payload', r.payload,
          'submitted_at', r.submitted_at
        )
        order by r.submitted_at
      )
      from public.student_responses r
      where r.session_id = v_session.id
        and r.participant_id = v_participant_id
        and r.mode in ('progressive-reveal','open-classification')
        and (
          v_session.session_kind <> 'course'
          or coalesce(r.node_ref,'') = v_session.current_node_ref
        )
    ), '[]'::jsonb),

    'open_stats', jsonb_build_object(
      'initial', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q.selected_type,
          'name', q.type_name,
          'count', q.total
        ) order by q.total desc, q.type_name)
        from (
          select
            r.selected_type,
            coalesce(nullif(r.payload->>'selectedTypeName',''),r.selected_type,'未命名類型') as type_name,
            count(*) as total
          from public.student_responses r
          where r.session_id = v_session.id
            and r.mode = 'open-classification'
            and r.stage_key = 'initial'
            and (
              v_session.session_kind <> 'course'
              or coalesce(r.node_ref,'') = v_session.current_node_ref
            )
          group by r.selected_type,
            coalesce(nullif(r.payload->>'selectedTypeName',''),r.selected_type,'未命名類型')
        ) q
      ), '[]'::jsonb),

      'final', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q.selected_type,
          'name', q.type_name,
          'count', q.total
        ) order by q.total desc, q.type_name)
        from (
          select
            r.selected_type,
            coalesce(nullif(r.payload->>'selectedTypeName',''),r.selected_type,'未命名類型') as type_name,
            count(*) as total
          from public.student_responses r
          where r.session_id = v_session.id
            and r.mode = 'open-classification'
            and r.stage_key = 'final'
            and (
              v_session.session_kind <> 'course'
              or coalesce(r.node_ref,'') = v_session.current_node_ref
            )
          group by r.selected_type,
            coalesce(nullif(r.payload->>'selectedTypeName',''),r.selected_type,'未命名類型')
        ) q
      ), '[]'::jsonb),

      'initial_total', (
        select count(*) from public.student_responses r
        where r.session_id = v_session.id
          and r.mode = 'open-classification'
          and r.stage_key = 'initial'
          and (
            v_session.session_kind <> 'course'
            or coalesce(r.node_ref,'') = v_session.current_node_ref
          )
      ),

      'final_total', (
        select count(*) from public.student_responses r
        where r.session_id = v_session.id
          and r.mode = 'open-classification'
          and r.stage_key = 'final'
          and (
            v_session.session_kind <> 'course'
            or coalesce(r.node_ref,'') = v_session.current_node_ref
          )
      ),

      'changed_count', (
        select count(*) from public.student_responses r
        where r.session_id = v_session.id
          and r.mode = 'open-classification'
          and r.stage_key = 'final'
          and coalesce(r.payload->>'changed','false') = 'true'
          and (
            v_session.session_kind <> 'course'
            or coalesce(r.node_ref,'') = v_session.current_node_ref
          )
      ),

      'unchanged_count', (
        select count(*) from public.student_responses r
        where r.session_id = v_session.id
          and r.mode = 'open-classification'
          and r.stage_key = 'final'
          and coalesce(r.payload->>'changed','false') <> 'true'
          and (
            v_session.session_kind <> 'course'
            or coalesce(r.node_ref,'') = v_session.current_node_ref
          )
      )
    )
  );
end;
$$;

revoke all on function public.create_course_session(text,text,text,text,text,text,text,integer) from public;
revoke all on function public.set_course_session_node(uuid,text,text,text,integer) from public;
revoke all on function public.set_course_node_progress(uuid,text,text,text) from public;
revoke all on function public.close_classroom_session(uuid,text) from public;
revoke all on function public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb,text) from public;

grant execute on function public.create_course_session(text,text,text,text,text,text,text,integer) to anon, authenticated;
grant execute on function public.set_course_session_node(uuid,text,text,text,integer) to anon, authenticated;
grant execute on function public.set_course_node_progress(uuid,text,text,text) to anon, authenticated;
grant execute on function public.close_classroom_session(uuid,text) to anon, authenticated;
grant execute on function public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb,text) to anon, authenticated;

-- join / teacher snapshot / student state signatures unchanged；重新授權確保 V2.1 可執行。
revoke all on function public.join_classroom_session(text,text,text) from public;
revoke all on function public.get_teacher_session(uuid,text) from public;
revoke all on function public.get_student_session_state(uuid,text) from public;

grant execute on function public.join_classroom_session(text,text,text) to anon, authenticated;
grant execute on function public.get_teacher_session(uuid,text) to anon, authenticated;
grant execute on function public.get_student_session_state(uuid,text) to anon, authenticated;


-- =========================================================
-- V2.7.3：刪除「已結束」的 Session
-- classroom_sessions 的關聯表皆使用 ON DELETE CASCADE，
-- 因此 participants / responses / course progress 會一併刪除。
-- =========================================================
create or replace function public.delete_classroom_session(
  p_session_id uuid,
  p_teacher_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.classroom_sessions
  where id = p_session_id
    and teacher_token = p_teacher_token
  limit 1;

  if v_status is null then
    raise exception 'invalid teacher token';
  end if;

  if v_status <> 'closed' then
    raise exception 'session must be closed before deletion';
  end if;

  delete from public.classroom_sessions
  where id = p_session_id
    and teacher_token = p_teacher_token
    and status = 'closed';

  if not found then
    raise exception 'session deletion failed';
  end if;

  return true;
end;
$$;

revoke all on function public.delete_classroom_session(uuid,text) from public;
grant execute on function public.delete_classroom_session(uuid,text) to anon, authenticated;


-- =========================================================
-- V2.7.4：教師跨裝置 Session 接手
-- 新裝置驗證舊 teacherToken 後，立即輪替成新的 teacherToken。
-- =========================================================
create or replace function public.claim_classroom_session(
  p_session_id uuid,
  p_teacher_token text,
  p_new_teacher_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.classroom_sessions%rowtype;
begin
  if length(trim(coalesce(p_new_teacher_token,''))) < 20 then
    raise exception 'invalid new teacher token';
  end if;

  update public.classroom_sessions
  set teacher_token = p_new_teacher_token
  where id = p_session_id
    and teacher_token = p_teacher_token
    and status = 'active'
  returning * into v_session;

  if v_session.id is null then
    raise exception 'session unavailable or teacher token invalid';
  end if;

  return jsonb_build_object(
    'id', v_session.id,
    'code', v_session.code,
    'title', v_session.title,
    'status', v_session.status,
    'session_kind', v_session.session_kind,
    'activity_mode', v_session.activity_mode,
    'stage_count', v_session.stage_count,
    'course_id', v_session.course_id,
    'course_encoded', v_session.course_encoded,
    'current_node_ref', v_session.current_node_ref,
    'revision', v_session.revision,
    'created_at', v_session.created_at
  );
end;
$$;

revoke all on function public.claim_classroom_session(uuid,text,text) from public;
grant execute on function public.claim_classroom_session(uuid,text,text) to anon, authenticated;


-- =========================================================
-- V2.8.1：逐層思辨 layered-deliberation
-- 重點：
-- 1) 完整情境層存在 deliberation_data，只供教師 RPC 讀取。
-- 2) activity_encoded 僅保存不含未公開層次的學生 shell。
-- 3) 學生只能透過 get_student_session_state 取得 current_stage 以前的層次。
-- 4) open / locked / published 由伺服器端限制提交與結果顯示。
-- =========================================================

alter table public.classroom_sessions
  add column if not exists round_state text not null default 'open';

alter table public.classroom_sessions
  add column if not exists deliberation_data jsonb not null default '{}'::jsonb;

create or replace function public.create_deliberation_session(
  p_code text,
  p_teacher_token text,
  p_title text,
  p_activity_shell_encoded text,
  p_deliberation_data jsonb,
  p_stage_count integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_layers integer;
  v_options integer;
begin
  if length(trim(p_code)) <> 5 then
    raise exception 'invalid session code';
  end if;
  if length(trim(p_teacher_token)) < 20 then
    raise exception 'invalid teacher token';
  end if;
  if length(trim(coalesce(p_activity_shell_encoded,''))) = 0 then
    raise exception 'missing activity shell';
  end if;
  if jsonb_typeof(coalesce(p_deliberation_data->'o','[]'::jsonb)) <> 'array' then
    raise exception 'invalid deliberation options';
  end if;
  v_options := jsonb_array_length(coalesce(p_deliberation_data->'o','[]'::jsonb));
  if v_options < 2 or v_options > 10 then
    raise exception 'deliberation requires between two and ten options';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_deliberation_data->'o','[]'::jsonb)) option_item
    where length(trim(coalesce(option_item->>'i',option_item->>'id',''))) = 0
       or length(trim(coalesce(option_item->>'l',option_item->>'label',''))) = 0
  ) then
    raise exception 'invalid deliberation option';
  end if;

  if jsonb_typeof(coalesce(p_deliberation_data->'l','[]'::jsonb)) <> 'array' then
    raise exception 'invalid deliberation layers';
  end if;

  v_layers := jsonb_array_length(coalesce(p_deliberation_data->'l','[]'::jsonb));
  if v_layers < 2 then
    raise exception 'deliberation requires at least two layers';
  end if;

  insert into public.classroom_sessions(
    code, teacher_token, title, activity_encoded, activity_mode,
    current_stage, stage_count, status, session_kind,
    round_state, deliberation_data
  )
  values (
    upper(trim(p_code)),
    p_teacher_token,
    coalesce(nullif(trim(p_title),''),'逐層思辨'),
    p_activity_shell_encoded,
    'layered-deliberation',
    1,
    greatest(1,least(coalesce(p_stage_count,v_layers),v_layers)),
    'active',
    'activity',
    'open',
    coalesce(p_deliberation_data,'{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.set_deliberation_round(
  p_session_id uuid,
  p_teacher_token text,
  p_stage integer,
  p_round_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage integer;
  v_state text;
  v_total integer;
begin
  if p_round_state not in ('open','locked','published') then
    raise exception 'invalid round state';
  end if;

  update public.classroom_sessions
  set current_stage = greatest(1,least(coalesce(p_stage,current_stage),stage_count)),
      round_state = p_round_state
  where id = p_session_id
    and teacher_token = p_teacher_token
    and status = 'active'
    and activity_mode = 'layered-deliberation'
  returning current_stage, round_state, stage_count
  into v_stage, v_state, v_total;

  if v_stage is null then
    raise exception 'invalid teacher token or deliberation session';
  end if;

  return jsonb_build_object(
    'current_stage',v_stage,
    'round_state',v_state,
    'stage_count',v_total
  );
end;
$$;

-- V2.12.0：覆寫作答 RPC，伺服器端限制逐層思辨作答時機，依活動設定驗證文字必填規則與自訂選項。
create or replace function public.submit_classroom_response(
  p_session_id uuid,
  p_participant_token text,
  p_task_index integer,
  p_stage_key text,
  p_mode text,
  p_selected_elements jsonb default '[]'::jsonb,
  p_selected_type text default null,
  p_payload jsonb default '{}'::jsonb,
  p_node_ref text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id uuid;
  v_status text;
  v_activity_mode text;
  v_current_stage integer;
  v_stage_count integer;
  v_round_state text;
  v_requested_stage integer;
  v_stage_key text;
  v_deliberation_data jsonb;
begin
  select p.id, s.status, s.activity_mode, s.current_stage, s.stage_count, s.round_state, s.deliberation_data
  into v_participant_id, v_status, v_activity_mode, v_current_stage, v_stage_count, v_round_state, v_deliberation_data
  from public.session_participants p
  join public.classroom_sessions s on s.id = p.session_id
  where p.session_id = p_session_id
    and p.participant_token = p_participant_token
  limit 1;

  if v_participant_id is null then
    raise exception 'invalid participant token';
  end if;
  if v_status <> 'active' then
    raise exception 'session closed';
  end if;

  v_stage_key := coalesce(nullif(trim(coalesce(p_stage_key,'')),''),'final');

  if v_activity_mode = 'layered-deliberation' then
    if p_mode <> 'layered-deliberation' then
      raise exception 'invalid deliberation response mode';
    end if;

    if v_stage_key = 'reflection' then
      if v_current_stage <> v_stage_count or v_round_state <> 'published' then
        raise exception 'reflection not open';
      end if;
    elsif v_stage_key ~ '^layer-[0-9]+-post$' then
      v_requested_stage := split_part(v_stage_key,'-',2)::integer;
      if v_requested_stage <> v_current_stage or v_round_state <> 'published' then
        raise exception 'discussion note not open';
      end if;
    elsif v_stage_key ~ '^layer-[0-9]+$' then
      v_requested_stage := split_part(v_stage_key,'-',2)::integer;
      if v_requested_stage <> v_current_stage or v_round_state <> 'open' then
        raise exception 'deliberation response is locked';
      end if;
      if not exists (
        select 1
        from jsonb_array_elements(coalesce(v_deliberation_data->'o','[]'::jsonb)) as option_item
        where coalesce(option_item->>'i',option_item->>'id','') = coalesce(p_selected_type,'')
      ) then
        raise exception 'invalid deliberation choice';
      end if;
      if coalesce((v_deliberation_data->'req'->>'reason')::boolean,true)
         and length(trim(coalesce(p_payload->>'reason',''))) = 0 then
        raise exception 'reason required';
      end if;
      if coalesce((v_deliberation_data->'req'->>'need')::boolean,false)
         and length(trim(coalesce(p_payload->>'needToKnow',''))) = 0 then
        raise exception 'need to know required';
      end if;
    else
      raise exception 'invalid deliberation stage key';
    end if;
  end if;

  update public.student_responses
  set mode = p_mode,
      selected_elements = coalesce(p_selected_elements,'[]'::jsonb),
      selected_type = p_selected_type,
      payload = coalesce(p_payload,'{}'::jsonb),
      submitted_at = now()
  where session_id = p_session_id
    and participant_id = v_participant_id
    and coalesce(node_ref,'') = coalesce(nullif(trim(coalesce(p_node_ref,'')),''),'')
    and task_index = p_task_index
    and stage_key = v_stage_key;

  if not found then
    insert into public.student_responses(
      session_id, participant_id, node_ref, task_index, stage_key, mode,
      selected_elements, selected_type, payload, submitted_at
    )
    values (
      p_session_id,
      v_participant_id,
      nullif(trim(coalesce(p_node_ref,'')),''),
      p_task_index,
      v_stage_key,
      p_mode,
      coalesce(p_selected_elements,'[]'::jsonb),
      p_selected_type,
      coalesce(p_payload,'{}'::jsonb),
      now()
    );
  end if;

  return true;
end;
$$;

-- V2.8.1：教師快照可取得完整 deliberation_data（含教師備註）。
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
    'session_kind', v_session.session_kind,
    'course_id', v_session.course_id,
    'course_encoded', v_session.course_encoded,
    'current_node_ref', v_session.current_node_ref,
    'revision', v_session.revision,
    'activity_mode', v_session.activity_mode,
    'current_stage', v_session.current_stage,
    'stage_count', v_session.stage_count,
    'round_state', v_session.round_state,
    'deliberation_data', case
      when v_session.activity_mode = 'layered-deliberation'
      then v_session.deliberation_data
      else '{}'::jsonb
    end,

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
        'response_id', r.id,
        'participant_id', r.participant_id,
        'student_code', p.student_code,
        'node_ref', coalesce(r.node_ref,''),
        'task_index', r.task_index,
        'stage_key', r.stage_key,
        'mode', r.mode,
        'selected_elements', r.selected_elements,
        'selected_type', r.selected_type,
        'payload', r.payload,
        'is_hidden', coalesce(r.is_hidden,false),
        'submitted_at', r.submitted_at
      ) order by r.submitted_at)
      from public.student_responses r
      join public.session_participants p on p.id = r.participant_id
      where r.session_id = v_session.id
    ), '[]'::jsonb),

    'progress', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', cp.participant_id,
        'student_code', p.student_code,
        'node_ref', cp.node_ref,
        'status', cp.status,
        'started_at', cp.started_at,
        'completed_at', cp.completed_at
      ) order by p.student_code, cp.started_at)
      from public.course_session_progress cp
      join public.session_participants p on p.id = cp.participant_id
      where cp.session_id = v_session.id
    ), '[]'::jsonb),

    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
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
      ) order by p.student_code)
      from public.session_participants p
      where p.session_id = v_session.id
    ), '[]'::jsonb)
  );
end;
$$;

-- V2.8.1：學生只取得已公開層次；published 前不取得全班分布與匿名理由。
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
  select p.id into v_participant_id
  from public.session_participants p
  where p.session_id = p_session_id
    and p.participant_token = p_participant_token
  limit 1;

  select s.* into v_session
  from public.classroom_sessions s
  where s.id = p_session_id
  limit 1;

  if v_session.id is null or v_participant_id is null then
    raise exception 'invalid participant token';
  end if;

  return jsonb_build_object(
    'session_kind', v_session.session_kind,
    'current_node_ref', v_session.current_node_ref,
    'revision', v_session.revision,
    'current_stage', v_session.current_stage,
    'stage_count', v_session.stage_count,
    'status', v_session.status,
    'round_state', v_session.round_state,

    'progress', coalesce((
      select jsonb_agg(jsonb_build_object(
        'node_ref', cp.node_ref,
        'status', cp.status,
        'started_at', cp.started_at,
        'completed_at', cp.completed_at
      ) order by cp.started_at)
      from public.course_session_progress cp
      where cp.session_id = v_session.id
        and cp.participant_id = v_participant_id
    ), '[]'::jsonb),

    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'node_ref', coalesce(r.node_ref,''),
        'stage_key', r.stage_key,
        'mode', r.mode,
        'selected_type', r.selected_type,
        'selected_elements', r.selected_elements,
        'payload', r.payload,
        'is_hidden', coalesce(r.is_hidden,false),
        'submitted_at', r.submitted_at
      ) order by r.submitted_at)
      from public.student_responses r
      where r.session_id = v_session.id
        and r.participant_id = v_participant_id
        and r.mode in ('progressive-reveal','open-classification','layered-deliberation')
        and (
          v_session.session_kind <> 'course'
          or coalesce(r.node_ref,'') = v_session.current_node_ref
        )
    ), '[]'::jsonb),

    'open_stats', jsonb_build_object(
      'initial', coalesce((
        select jsonb_agg(jsonb_build_object('id',q.selected_type,'name',q.type_name,'count',q.total) order by q.total desc,q.type_name)
        from (
          select r.selected_type,
            coalesce(nullif(r.payload->>'selectedTypeName',''),r.selected_type,'未命名類型') as type_name,
            count(*) as total
          from public.student_responses r
          where r.session_id = v_session.id and r.mode = 'open-classification' and r.stage_key = 'initial'
            and (v_session.session_kind <> 'course' or coalesce(r.node_ref,'') = v_session.current_node_ref)
          group by r.selected_type,coalesce(nullif(r.payload->>'selectedTypeName',''),r.selected_type,'未命名類型')
        ) q
      ), '[]'::jsonb),
      'final', coalesce((
        select jsonb_agg(jsonb_build_object('id',q.selected_type,'name',q.type_name,'count',q.total) order by q.total desc,q.type_name)
        from (
          select r.selected_type,
            coalesce(nullif(r.payload->>'selectedTypeName',''),r.selected_type,'未命名類型') as type_name,
            count(*) as total
          from public.student_responses r
          where r.session_id = v_session.id and r.mode = 'open-classification' and r.stage_key = 'final'
            and (v_session.session_kind <> 'course' or coalesce(r.node_ref,'') = v_session.current_node_ref)
          group by r.selected_type,coalesce(nullif(r.payload->>'selectedTypeName',''),r.selected_type,'未命名類型')
        ) q
      ), '[]'::jsonb),
      'initial_total', (select count(*) from public.student_responses r where r.session_id=v_session.id and r.mode='open-classification' and r.stage_key='initial'),
      'final_total', (select count(*) from public.student_responses r where r.session_id=v_session.id and r.mode='open-classification' and r.stage_key='final'),
      'changed_count', (select count(*) from public.student_responses r where r.session_id=v_session.id and r.mode='open-classification' and r.stage_key='final' and coalesce(r.payload->>'changed','false')='true'),
      'unchanged_count', (select count(*) from public.student_responses r where r.session_id=v_session.id and r.mode='open-classification' and r.stage_key='final' and coalesce(r.payload->>'changed','false')<>'true')
    ),

    'deliberation', case when v_session.activity_mode = 'layered-deliberation' then
      jsonb_build_object(
        'source_note', coalesce(v_session.deliberation_data->>'src',''),
        'fixed_question', coalesce(v_session.deliberation_data->>'q',''),
        'options', coalesce(v_session.deliberation_data->'o','[]'::jsonb),
        'released_layers', coalesce((
          select jsonb_agg(x.elem - 'n' order by x.ord)
          from jsonb_array_elements(coalesce(v_session.deliberation_data->'l','[]'::jsonb))
            with ordinality as x(elem,ord)
          where x.ord <= v_session.current_stage
        ),'[]'::jsonb),
        'reflection', case
          when v_session.current_stage = v_session.stage_count and v_session.round_state = 'published'
          then coalesce(v_session.deliberation_data->'r','{}'::jsonb)
          else null
        end,
        'distribution', case when v_session.round_state = 'published' then coalesce((
          select jsonb_agg(jsonb_build_object('id',q.selected_type,'count',q.total) order by q.selected_type)
          from (
            select r.selected_type,count(*) as total
            from public.student_responses r
            where r.session_id = v_session.id
              and r.mode = 'layered-deliberation'
              and r.stage_key = ('layer-' || v_session.current_stage::text)
            group by r.selected_type
          ) q
        ),'[]'::jsonb) else '[]'::jsonb end,
        'anonymous_reasons', case when v_session.round_state = 'published' then coalesce((
          select jsonb_agg(jsonb_build_object(
            'reason',coalesce(r.payload->>'reason',''),
            'needToKnow',coalesce(r.payload->>'needToKnow','')
          ) order by r.submitted_at)
          from public.student_responses r
          where r.session_id = v_session.id
            and r.mode = 'layered-deliberation'
            and r.stage_key = ('layer-' || v_session.current_stage::text)
            and coalesce(r.is_hidden,false) = false
            and length(trim(coalesce(r.payload->>'reason',''))) > 0
        ),'[]'::jsonb) else '[]'::jsonb end
      )
    else null end
  );
end;
$$;

revoke all on function public.create_deliberation_session(text,text,text,text,jsonb,integer) from public;
revoke all on function public.set_deliberation_round(uuid,text,integer,text) from public;
revoke all on function public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb,text) from public;
revoke all on function public.get_teacher_session(uuid,text) from public;
revoke all on function public.get_student_session_state(uuid,text) from public;

grant execute on function public.create_deliberation_session(text,text,text,text,jsonb,integer) to anon, authenticated;
grant execute on function public.set_deliberation_round(uuid,text,integer,text) to anon, authenticated;
grant execute on function public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb,text) to anon, authenticated;
grant execute on function public.get_teacher_session(uuid,text) to anon, authenticated;
grant execute on function public.get_student_session_state(uuid,text) to anon, authenticated;


-- =========================================================
-- V2.9.1：教師匿名理由顯示／隱藏
-- 只影響理由是否送往學生結果與投影；選項分布不受影響。
-- =========================================================
create or replace function public.set_deliberation_reason_visibility(
  p_session_id uuid,
  p_teacher_token text,
  p_response_id uuid,
  p_hidden boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.classroom_sessions s
    where s.id = p_session_id
      and s.teacher_token = p_teacher_token
      and s.activity_mode = 'layered-deliberation'
  ) then
    raise exception 'invalid teacher token or deliberation session';
  end if;

  update public.student_responses r
  set is_hidden = coalesce(p_hidden,false)
  where r.id = p_response_id
    and r.session_id = p_session_id
    and r.mode = 'layered-deliberation'
    and r.stage_key ~ '^layer-[0-9]+$';

  if not found then
    raise exception 'deliberation response not found';
  end if;

  return true;
end;
$$;

revoke all on function public.set_deliberation_reason_visibility(uuid,text,uuid,boolean) from public;
grant execute on function public.set_deliberation_reason_visibility(uuid,text,uuid,boolean) to anon, authenticated;
