-- V2.35.8：逐層思辨的選項／理由必填規則可逐層獨立設定。
-- 前置：須先部署 V2.35.0 的 Course SQL（包含 node_ref 支援）及 V2.35.6 節點唯一鍵修正。
-- 不新增資料表／不刪除既有學生資料；只更新原有提交 RPC 的驗證。
-- 不同層的 l[N].o 會覆蓋全域 o；l[N].rr(boolean) 會覆蓋 req.reason。
-- 沒有設定覆蓋時沿用舊版全域規則。請使用 Supabase SQL Editor 執行。

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
  -- Course 節點由資料庫決定，禁止提交到先前或尚未開始的 Node。
  if exists(select 1 from public.classroom_sessions s where s.id=p_session_id
      and s.session_kind='course' and coalesce(s.current_node_ref,'')<>coalesce(trim(p_node_ref),'')) then
    raise exception 'course node has changed';
  end if;
  if exists(select 1 from public.classroom_sessions s where s.id=p_session_id and s.session_kind='course'
      and s.activity_mode in ('layered-deliberation','live-stance','group-consensus','question-wall')
      and p_mode<>s.activity_mode) then
    raise exception 'activity mode does not match current node';
  end if;

  v_stage_key := coalesce(nullif(trim(coalesce(p_stage_key,'')),''),'final');

  -- V2.32.1：公開時機須由資料庫把關，不能只依賴學生端 UI。
  if v_activity_mode = 'predict-reveal' then
    if p_mode <> 'predict-reveal' or not (
      (v_current_stage = 1 and v_stage_key = 'initial') or
      (v_current_stage = 2 and v_stage_key = 'final')
    ) then
      raise exception 'predict reveal response stage is closed';
    end if;
  end if;

  if v_activity_mode = 'progressive-reveal' then
    if p_mode <> 'progressive-reveal' or v_stage_key !~ '^clue-[1-9][0-9]*$' then
      raise exception 'invalid progressive reveal response stage';
    end if;
    if split_part(v_stage_key,'-',2)::integer <> v_current_stage then
      raise exception 'progressive reveal response stage is closed';
    end if;
  end if;

  if v_activity_mode = 'open-classification' then
    if p_mode <> 'open-classification' or not (
      (v_current_stage = 1 and v_stage_key = 'initial') or
      (v_current_stage = 2 and v_stage_key = 'final')
    ) then
      raise exception 'open classification response stage is closed';
    end if;
  end if;

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
        from jsonb_array_elements(
          case when jsonb_typeof(v_deliberation_data->'l'->(v_requested_stage-1)->'o')='array'
            then v_deliberation_data->'l'->(v_requested_stage-1)->'o'
            else coalesce(v_deliberation_data->'o','[]'::jsonb) end
        ) as option_item
        where coalesce(option_item->>'i',option_item->>'id','') = coalesce(p_selected_type,'')
      ) then
        raise exception 'invalid deliberation choice';
      end if;
      if (case when jsonb_typeof(v_deliberation_data->'l'->(v_requested_stage-1)->'rr')='boolean'
          then (v_deliberation_data->'l'->(v_requested_stage-1)->>'rr')::boolean
          else coalesce((v_deliberation_data->'req'->>'reason')::boolean,true) end)
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

  if v_activity_mode = 'live-stance' then
    if p_mode <> 'live-stance' then
      raise exception 'invalid live stance response mode';
    end if;
    if v_stage_key <> 'final' then
      raise exception 'invalid live stance stage key';
    end if;
    if v_round_state <> 'open' then
      raise exception 'live stance is locked';
    end if;
    if coalesce(p_selected_type,'') not in ('left','right','undecided') then
      raise exception 'invalid live stance choice';
    end if;
  end if;

  if v_activity_mode = 'group-consensus' then
    if p_mode <> 'group-consensus' then
      raise exception 'invalid group consensus response mode';
    end if;
    if v_stage_key <> 'individual' then
      raise exception 'invalid group consensus stage key';
    end if;
    if v_current_stage <> 1 then
      raise exception 'individual response stage is closed';
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

revoke all on function public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb,text) from public;
grant execute on function public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb,text) to anon,authenticated;
