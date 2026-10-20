-- Classroom Interactive V2.35.9 Course parallel activity migration.
-- Requires V2.35.0, V2.35.6, V2.35.8 migrations.
-- Preserves all existing answers. Run in Supabase SQL Editor before deploying the frontend.
begin;

create table if not exists public.course_node_runtime_v2359 (
  session_id uuid not null references public.classroom_sessions(id) on delete cascade,
  node_ref text not null,
  activity_mode text not null default '',
  current_stage integer not null default 1 check (current_stage >= 1),
  stage_count integer not null default 1 check (stage_count >= 1),
  round_state text not null default 'open',
  lifecycle text not null default 'paused' check (lifecycle in ('active','paused','settled')),
  settled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (session_id,node_ref)
);
create index if not exists course_node_runtime_v2359_session_idx on public.course_node_runtime_v2359(session_id);
alter table public.course_node_runtime_v2359 enable row level security;
revoke all on public.course_node_runtime_v2359 from public, anon, authenticated;

-- Read only through a teacher-token RPC (no anonymous table access).
create or replace function public.get_course_node_runtime_v2359(
  p_session_id uuid,p_teacher_token text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session public.classroom_sessions%rowtype;
begin
  select * into v_session from public.classroom_sessions
  where id=p_session_id and teacher_token=p_teacher_token and session_kind='course';
  if not found then raise exception 'invalid course teacher token'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
     'node_ref',n.node_ref,
     'activity_mode',case when n.node_ref=v_session.current_node_ref then v_session.activity_mode else n.activity_mode end,
     'current_stage',case when n.node_ref=v_session.current_node_ref then v_session.current_stage else n.current_stage end,
     'stage_count',case when n.node_ref=v_session.current_node_ref then v_session.stage_count else n.stage_count end,
     'round_state',case when n.node_ref=v_session.current_node_ref then v_session.round_state else n.round_state end,
     'lifecycle',n.lifecycle,'settled_at',n.settled_at
   ) order by n.updated_at) from public.course_node_runtime_v2359 n
   where n.session_id=p_session_id),'[]'::jsonb);
end;
$$;

-- Always save the leaving node, then restore the arriving node. No stage reset on return.
-- Keep the V2.35.0 RPC signature so existing client integrations remain compatible.
create or replace function public.set_course_session_node_v2350(
  p_session_id uuid,p_teacher_token text,p_node_ref text,
  p_activity_mode text,p_stage_count integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_session public.classroom_sessions%rowtype;
  v_target public.course_node_runtime_v2359%rowtype;
  v_private jsonb;
  v_revision integer;
  v_target_stage integer;
  v_target_count integer;
  v_target_round text;
  v_target_mode text;
begin
  select * into v_session from public.classroom_sessions
  where id=p_session_id and teacher_token=p_teacher_token
    and session_kind='course' and status='active' for update;
  if not found then raise exception 'invalid teacher token or course session'; end if;
  if length(trim(coalesce(p_node_ref,'')))=0 then raise exception 'node ref required'; end if;

  -- Flush current state atomically before switching. A settled node never reopens.
  insert into public.course_node_runtime_v2359
    (session_id,node_ref,activity_mode,current_stage,stage_count,round_state,lifecycle)
  values (p_session_id,v_session.current_node_ref,v_session.activity_mode,
    v_session.current_stage,v_session.stage_count,coalesce(v_session.round_state,'open'),'paused')
  on conflict (session_id,node_ref) do update set
    activity_mode=excluded.activity_mode,
    current_stage=excluded.current_stage,
    stage_count=excluded.stage_count,
    round_state=excluded.round_state,
    lifecycle=case when course_node_runtime_v2359.lifecycle='settled' then 'settled' else 'paused' end,
    updated_at=now();

  insert into public.course_node_runtime_v2359
    (session_id,node_ref,activity_mode,current_stage,stage_count,round_state,lifecycle)
  values (p_session_id,p_node_ref,coalesce(p_activity_mode,''),1,
    greatest(1,coalesce(p_stage_count,1)),'open','active')
  on conflict (session_id,node_ref) do update set
    lifecycle=case when course_node_runtime_v2359.lifecycle='settled' then 'settled' else 'active' end,
    updated_at=now();
  select * into v_target from public.course_node_runtime_v2359
  where session_id=p_session_id and node_ref=p_node_ref for update;
  -- Existing node metadata belongs to the saved node, not to the newly passed defaults.
  v_target_stage:=v_target.current_stage;
  v_target_count:=v_target.stage_count;
  v_target_round:=v_target.round_state;
  v_target_mode:=v_target.activity_mode;

  if v_target_mode='layered-deliberation' then
    select c.deliberation_data into v_private from public.course_private_nodes c
    where c.session_id=p_session_id and c.node_ref=p_node_ref;
    if v_private is null then raise exception 'private deliberation node not found'; end if;
  end if;

  update public.classroom_sessions set
    current_node_ref=p_node_ref,revision=revision+1,
    activity_mode=v_target_mode,current_stage=v_target_stage,
    stage_count=v_target_count,round_state=v_target_round,
    deliberation_data=case when v_target_mode='layered-deliberation' then v_private else '{}'::jsonb end
  where id=p_session_id returning revision into v_revision;
  return jsonb_build_object('current_node_ref',p_node_ref,'revision',v_revision,
    'activity_mode',v_target_mode,'current_stage',v_target_stage,
    'stage_count',v_target_count,'round_state',v_target_round,
    'lifecycle',v_target.lifecycle);
end;
$$;

-- Independently settle one node; the Course Session itself stays active.
create or replace function public.settle_course_node_v2359(
  p_session_id uuid,p_teacher_token text,p_node_ref text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session public.classroom_sessions%rowtype;
begin
  select * into v_session from public.classroom_sessions
  where id=p_session_id and teacher_token=p_teacher_token and session_kind='course' and status='active' for update;
  if not found then raise exception 'invalid teacher token or course session'; end if;
  if v_session.current_node_ref <> p_node_ref then raise exception 'switch to this node before settlement'; end if;
  insert into public.course_node_runtime_v2359
    (session_id,node_ref,activity_mode,current_stage,stage_count,round_state,lifecycle,settled_at)
  values (p_session_id,p_node_ref,v_session.activity_mode,v_session.current_stage,
    v_session.stage_count,coalesce(v_session.round_state,'open'),'settled',now())
  on conflict(session_id,node_ref) do update set
    lifecycle='settled',settled_at=coalesce(course_node_runtime_v2359.settled_at,now()),
    current_stage=excluded.current_stage,stage_count=excluded.stage_count,
    round_state=excluded.round_state,updated_at=now();
  update public.classroom_sessions set revision=revision+1 where id=p_session_id;
  return jsonb_build_object('node_ref',p_node_ref,'lifecycle','settled');
end;
$$;

-- Student can read only the currently displayed node lifecycle, never other activity data.
create or replace function public.get_course_node_lifecycle_v2359(
  p_session_id uuid,p_participant_token text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session public.classroom_sessions%rowtype; v_state text;
begin
  select s.* into v_session from public.classroom_sessions s
  join public.session_participants p on p.session_id=s.id
  where s.id=p_session_id and p.participant_token=p_participant_token
    and s.session_kind='course';
  if not found then raise exception 'invalid course participant token'; end if;
  select n.lifecycle into v_state from public.course_node_runtime_v2359 n
  where n.session_id=p_session_id and n.node_ref=v_session.current_node_ref;
  return jsonb_build_object('node_ref',v_session.current_node_ref,
    'lifecycle',coalesce(v_state,'active'),'revision',v_session.revision);
end;
$$;

-- Settled nodes cannot advance stages, even through legacy teacher RPCs.
create or replace function public.guard_course_settled_controls_v2359()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.session_kind='course' and new.current_node_ref=old.current_node_ref
     and (new.current_stage is distinct from old.current_stage
       or new.round_state is distinct from old.round_state) and exists (
    select 1 from public.course_node_runtime_v2359
    where session_id=old.id and node_ref=old.current_node_ref and lifecycle='settled'
  ) then raise exception 'course node already settled'; end if;
  return new;
end;
$$;
drop trigger if exists guard_course_settled_controls_v2359 on public.classroom_sessions;
create trigger guard_course_settled_controls_v2359 before update on public.classroom_sessions
for each row execute function public.guard_course_settled_controls_v2359();

-- Block stale or settled Course writes, including old clients that call existing RPC names.
-- BEFORE INSERT/UPDATE also protects direct writes if database privileges change in future.
create or replace function public.guard_course_node_writes_v2359()
returns trigger language plpgsql set search_path=public as $$
declare v_session_id uuid; v_node text; v_session public.classroom_sessions%rowtype;
begin
  if tg_table_name in ('question_wall_votes','question_wall_replies') then
    select q.session_id,q.node_ref into v_session_id,v_node
    from public.question_wall_posts q where q.id=new.post_id;
  elsif tg_table_name='session_group_members' then
    select g.session_id,g.node_ref into v_session_id,v_node
    from public.session_groups g where g.id=new.group_id;
  else
    v_session_id:=new.session_id;
    v_node:=coalesce(new.node_ref,'');
  end if;
  select * into v_session from public.classroom_sessions where id=v_session_id;
  if v_session.session_kind='course' then
    if coalesce(v_node,'')<>coalesce(v_session.current_node_ref,'') then
      raise exception 'course node has changed';
    end if;
    if exists (select 1 from public.course_node_runtime_v2359 n
        where n.session_id=v_session_id and n.node_ref=v_node and n.lifecycle='settled') then
      raise exception 'course node already settled';
    end if;
  end if;
  return new;
end;
$$;
-- question_wall_votes & session_group_members have no node_ref; all other listed tables do.
do $$
declare name text;
begin
  foreach name in array array[
    'student_responses','course_session_progress','question_wall_posts',
    'question_wall_replies','question_wall_votes','group_consensus_submissions',
    'session_groups','session_group_members','live_stance_events','live_stance_checkpoints'
  ] loop
    execute format('drop trigger if exists guard_course_node_writes_v2359 on public.%I',name);
    execute format('create trigger guard_course_node_writes_v2359 before insert or update on public.%I for each row execute function public.guard_course_node_writes_v2359()',name);
  end loop;
end $$;

revoke all on function public.get_course_node_lifecycle_v2359(uuid,text) from public;
grant execute on function public.get_course_node_lifecycle_v2359(uuid,text) to anon,authenticated;
revoke all on function public.get_course_node_runtime_v2359(uuid,text) from public;
revoke all on function public.settle_course_node_v2359(uuid,text,text) from public;
grant execute on function public.get_course_node_runtime_v2359(uuid,text) to anon,authenticated;
grant execute on function public.settle_course_node_v2359(uuid,text,text) to anon,authenticated;
commit;
