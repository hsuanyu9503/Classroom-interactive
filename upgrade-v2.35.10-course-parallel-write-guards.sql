-- Classroom Interactive V2.35.10: Course parallel node write guards.
-- Prerequisite: V2.35.9 migration applied successfully.
-- Fix: V2.35.9 guarded INSERT/UPDATE, but DELETE could still change
--       a paused/settled Course activity (e.g. a removed vote or checkpoint).
-- Does not delete or rewrite existing records.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_course_node_writes_v2359()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  v_session_id uuid;
  v_node text;
  v_session public.classroom_sessions%rowtype;
BEGIN
  -- Rows may be deleted explicitly or as part of a parent/session cascade.
  -- OLD must be read for DELETE; NEW is only available for INSERT/UPDATE.
  IF TG_OP='DELETE' THEN
    IF TG_TABLE_NAME IN ('question_wall_votes','question_wall_replies') THEN
      SELECT q.session_id,q.node_ref INTO v_session_id,v_node
      FROM public.question_wall_posts q WHERE q.id=OLD.post_id;
    ELSIF TG_TABLE_NAME='session_group_members' THEN
      SELECT g.session_id,g.node_ref INTO v_session_id,v_node
      FROM public.session_groups g WHERE g.id=OLD.group_id;
    ELSE
      v_session_id:=OLD.session_id;
      v_node:=COALESCE(OLD.node_ref,'');
    END IF;
  ELSE
    IF TG_TABLE_NAME IN ('question_wall_votes','question_wall_replies') THEN
      SELECT q.session_id,q.node_ref INTO v_session_id,v_node
      FROM public.question_wall_posts q WHERE q.id=NEW.post_id;
    ELSIF TG_TABLE_NAME='session_group_members' THEN
      SELECT g.session_id,g.node_ref INTO v_session_id,v_node
      FROM public.session_groups g WHERE g.id=NEW.group_id;
    ELSE
      v_session_id:=NEW.session_id;
      v_node:=COALESCE(NEW.node_ref,'');
    END IF;
  END IF;

  SELECT * INTO v_session FROM public.classroom_sessions WHERE id=v_session_id;
  IF FOUND AND v_session.session_kind='course' THEN
    IF COALESCE(v_node,'')<>COALESCE(v_session.current_node_ref,'') THEN
      RAISE EXCEPTION 'course node has changed';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.course_node_runtime_v2359 n
      WHERE n.session_id=v_session_id AND n.node_ref=v_node
        AND n.lifecycle='settled'
    ) THEN
      RAISE EXCEPTION 'course node already settled';
    END IF;
  END IF;

  -- UPDATE must also protect the source node. A caller should not be able
  -- to move a row out of a settled/paused node by changing its node_ref,
  -- post_id or group_id to point at an active node.
  IF TG_OP='UPDATE' THEN
    IF TG_TABLE_NAME IN ('question_wall_votes','question_wall_replies') THEN
      SELECT q.session_id,q.node_ref INTO v_session_id,v_node
      FROM public.question_wall_posts q WHERE q.id=OLD.post_id;
    ELSIF TG_TABLE_NAME='session_group_members' THEN
      SELECT g.session_id,g.node_ref INTO v_session_id,v_node
      FROM public.session_groups g WHERE g.id=OLD.group_id;
    ELSE
      v_session_id:=OLD.session_id;
      v_node:=COALESCE(OLD.node_ref,'');
    END IF;
    SELECT * INTO v_session FROM public.classroom_sessions WHERE id=v_session_id;
    IF FOUND AND v_session.session_kind='course' THEN
      IF COALESCE(v_node,'')<>COALESCE(v_session.current_node_ref,'') THEN
        RAISE EXCEPTION 'course source node has changed';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.course_node_runtime_v2359 n
        WHERE n.session_id=v_session_id AND n.node_ref=v_node
          AND n.lifecycle='settled'
      ) THEN
        RAISE EXCEPTION 'course source node already settled';
      END IF;
    END IF;
  END IF;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'student_responses','course_session_progress','question_wall_posts',
    'question_wall_replies','question_wall_votes','group_consensus_submissions',
    'session_groups','session_group_members','live_stance_events',
    'live_stance_checkpoints'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_course_node_writes_v2359 ON public.%I',tbl);
    EXECUTE format('CREATE TRIGGER guard_course_node_writes_v2359 BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_course_node_writes_v2359()',tbl);
  END LOOP;
END;
$$;
COMMIT;
