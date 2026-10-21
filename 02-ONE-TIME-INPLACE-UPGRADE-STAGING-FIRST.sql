-- Classroom Interactive v2.36.1 -> v1.0.1 / IN-PLACE DATA-PRESERVING UPGRADE
-- ONE TIME ONLY. STAGING FIRST. NOT RUN ON A LIVE PROJECT WITHOUT BACKUP AND APPROVAL.
-- IMPORTANT: Do NOT run the 178KB original v2.36.1 unified setup on current PRODUCTION.
-- Eight later migrations from v2.36.1 + SEC-001 ACL restriction, in ONE transaction.
-- No DROP TABLE, TRUNCATE, or top-level DELETE/UPDATE of historical user rows.
-- This SQL is NOT yet tested on a real PostgreSQL/Supabase project.
-- Requires: original v2.36.1 schema, no Stage2/3 migration objects, backup, freeze.
-- Stage2/3 SQL comments refer to their original independent BEGIN/COMMIT; those wrappers are removed.
-- CLASSROOM INTERACTIVE v1.0.1 | POST-v2.36.1 COMPLETE UPGRADE (ONE-TIME)
-- ============================================================================
-- This is NOT a complete clean-room schema: V2.36.1 base SQL is required FIRST.
-- Only for a BACKED-UP, TEST Supabase database where V2.36.1 is present
-- and NONE of the Stage 2/Stage 3 upgrades R3-R7 and R2-R4 have been applied.
-- Do NOT run on existing upgraded/production databases. Run READ-ONLY audit first.
-- Eight unchanged migration bodies, preserved order, with outer BEGIN/COMMIT
-- replaced by a SINGLE transaction for all-or-nothing rollback on SQL error.
-- Migration metadata/version stamping is intentionally not written to user DB.
-- NOT TESTED on a live PostgreSQL / Supabase instance. Test in an isolated DB.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

-- Fail closed if base tables missing OR any newer extension looks installed.
-- Not a replacement for backups or a full version/privilege audit.
DO $ci_v101_upgrade_guard$
DECLARE
  required text;
  existing text[] := ARRAY[]::text[];
  markers text[] := ARRAY[
    'classification_group_boards',
    'classification_course_nodes',
    'classification_course_publications',
    'evidence_judgment_nodes_r2',
    'evidence_judgment_responses_r2',
    'evidence_judgment_group_submissions_r3'
  ];
  fun text;
BEGIN
  FOREACH required IN ARRAY ARRAY[
    'classroom_sessions','session_participants','student_responses',
    'session_groups','session_group_members','course_session_progress'
  ] LOOP
    IF to_regclass(format('public.%I',required)) IS NULL THEN
      RAISE EXCEPTION 'CI v1.0.1 upgrade stopped: V2.36.1 base object public.% missing. Apply the original base SQL first.',required;
    END IF;
  END LOOP;
  FOREACH required IN ARRAY markers LOOP
    IF to_regclass(format('public.%I',required)) IS NOT NULL THEN
      existing := array_append(existing,required);
    END IF;
  END LOOP;
  FOREACH fun IN ARRAY ARRAY[
    'classification_validate_board',
    'get_classification_individual_board',
    'register_classification_course_node',
    'get_classification_course_published',
    'classification_public_board',
    'register_evidence_judgment_node_r2',
    'submit_evidence_group_r3',
    'guard_evidence_group_member_change_r4'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid=p.pronamespace
        WHERE ns.nspname='public' AND p.proname=fun) THEN
      existing := array_append(existing,fun||'()');
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND NOT t.tgisinternal
      AND t.tgname IN ('guard_evidence_group_member_change_r4','classification_response_validate')
  ) THEN
    existing := array_append(existing,'existing Stage 2/3 trigger');
  END IF;
  IF array_length(existing,1)>0 THEN
    RAISE EXCEPTION 'CI v1.0.1 upgrade stopped: Stage 2/3 items already exist (%). Do not rerun the eight migrations; inspect the existing DB first.',array_to_string(existing,', ');
  END IF;
END;
$ci_v101_upgrade_guard$;


-- Additional conservative gate for in-place migration from ACTUAL v2.36.1.
-- Run after the original Stage 2/3 reinstallation guard, before first DDL.
DO $ci_v101_v2361_inplace_guard$
DECLARE v_required text; v_tbl text; v_col text;
BEGIN
  FOREACH v_required IN ARRAY ARRAY[
    'public.get_course_node_runtime_v2359(uuid,text)',
    'public.set_course_session_node_v2350(uuid,text,text,text,integer)',
    'public.get_student_session_state(uuid,text)',
    'public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb,text)'
  ] LOOP
    IF to_regprocedure(v_required) IS NULL THEN
      RAISE EXCEPTION 'In-place v1.0.1 stopped: expected v2.36.1 RPC % absent', v_required;
    END IF;
  END LOOP;
  FOR v_tbl,v_col IN SELECT * FROM (VALUES
    ('classroom_sessions','session_kind'),('classroom_sessions','current_node_ref'),
    ('student_responses','node_ref'),('session_groups','node_ref'),
    ('session_group_members','node_ref'),('course_node_runtime_v2359','lifecycle')
  ) AS req(tbl,col) LOOP
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=v_tbl AND column_name=v_col) THEN
      RAISE EXCEPTION 'In-place v1.0.1 stopped: expected v2.36.1 column %.% absent',v_tbl,v_col;
    END IF;
  END LOOP;
  IF has_schema_privilege('anon','public','CREATE')
      OR has_schema_privilege('authenticated','public','CREATE') THEN
    RAISE EXCEPTION 'In-place v1.0.1 stopped: browser roles can CREATE in public schema; examine SECURITY DEFINER safety first';
  END IF;
END;
$ci_v101_v2361_inplace_guard$;


-- =========== [01/08] upgrade-classification-session-r3.sql ===========
-- Original SHA-256: 332e0a968872bf85484cf92d96f371f16235c475fa96bc65ecb32a5d32a1f8e7
-- Classroom Interactive | Stage 2 / Round 3
-- Additive migration for classification representative collaboration.
-- Run after the current Classroom Interactive V2.36.1 SQL; backs up recommended.
-- No existing student response data is removed or rewritten.
CREATE TABLE IF NOT EXISTS public.classification_group_boards (
  session_id uuid NOT NULL REFERENCES public.classroom_sessions(id) ON DELETE CASCADE,
  node_ref text NOT NULL DEFAULT '',
  group_id uuid NOT NULL REFERENCES public.session_groups(id) ON DELETE CASCADE,
  board jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
  submitted_by uuid NOT NULL REFERENCES public.session_participants(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,node_ref,group_id)
);
CREATE INDEX IF NOT EXISTS classification_group_boards_session_idx ON public.classification_group_boards(session_id,node_ref);
ALTER TABLE public.classification_group_boards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.classification_group_boards FROM public,anon,authenticated;

-- Shared payload validator. Restricts asset IDs, category IDs and assignment limits.
CREATE OR REPLACE FUNCTION public.classification_validate_board(
  p_activity jsonb,p_board jsonb
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE v_group jsonb;v_member jsonb;v_asset jsonb;v_count integer;v_seen text[]:=array[]::text[];
  v_gids text[]:=array[]::text[];v_aids text[]:=array[]::text[];
BEGIN
  IF jsonb_typeof(p_activity) IS DISTINCT FROM 'object' OR jsonb_typeof(p_activity->'assets') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_board) IS DISTINCT FROM 'object' OR jsonb_typeof(p_board->'groups') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_board->'memberships') IS DISTINCT FROM 'array'
    OR p_board->>'activityId' IS DISTINCT FROM p_activity->>'id'
    OR length(p_board::text)>150000 THEN RAISE EXCEPTION 'invalid classification board'; END IF;
  IF jsonb_array_length(p_board->'groups')<1 OR jsonb_array_length(p_board->'groups')>100
    OR jsonb_array_length(p_board->'memberships')>20000 THEN
    RAISE EXCEPTION 'invalid classification board size'; END IF;
  IF coalesce((p_activity->>'maxGroups')::integer,0)>0 AND
    jsonb_array_length(p_board->'groups')>(p_activity->>'maxGroups')::integer THEN
    RAISE EXCEPTION 'classification group count exceeds limit'; END IF;
  FOR v_group IN SELECT value FROM jsonb_array_elements(p_board->'groups') LOOP
    IF length(coalesce(v_group->>'id',''))<1 OR length(coalesce(v_group->>'id',''))>100
      OR length(trim(coalesce(v_group->>'name','')))<1 OR length(coalesce(v_group->>'name',''))>80
      OR length(coalesce(v_group->>'reason',''))>1000 OR v_group->>'id'=ANY(v_gids) THEN
      RAISE EXCEPTION 'invalid classification category'; END IF;
    IF coalesce((p_activity->>'requireReason')::boolean,false)
      AND length(trim(coalesce(v_group->>'reason','')))=0 THEN
      RAISE EXCEPTION 'classification reason required'; END IF;
    IF p_activity->>'mode'='assigned' AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(coalesce(p_activity->'presetGroups','[]'::jsonb)) x
        WHERE x->>'id'=v_group->>'id') THEN
      RAISE EXCEPTION 'unknown preset category'; END IF;
    v_gids:=array_append(v_gids,v_group->>'id');
  END LOOP;
  IF p_activity->>'mode'='assigned' AND array_length(v_gids,1)<>
    jsonb_array_length(coalesce(p_activity->'presetGroups','[]'::jsonb)) THEN
    RAISE EXCEPTION 'preset category mismatch'; END IF;
  FOR v_member IN SELECT value FROM jsonb_array_elements(p_board->'memberships') LOOP
    IF NOT(coalesce(v_member->>'groupId','')=ANY(v_gids)) OR NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_activity->'assets') a
        WHERE a->>'id'=v_member->>'assetId') THEN
      RAISE EXCEPTION 'invalid classification membership'; END IF;
    IF concat(v_member->>'assetId',':',v_member->>'groupId')=ANY(v_seen) THEN
      RAISE EXCEPTION 'duplicated classification membership'; END IF;
    v_seen:=array_append(v_seen,concat(v_member->>'assetId',':',v_member->>'groupId'));
  END LOOP;
  FOR v_asset IN SELECT value FROM jsonb_array_elements(p_activity->'assets') LOOP
    SELECT count(*) INTO v_count FROM jsonb_array_elements(p_board->'memberships') m
      WHERE m->>'assetId'=v_asset->>'id';
    IF v_count=0 AND coalesce((p_activity->>'requireAll')::boolean,false) THEN
      RAISE EXCEPTION 'classification has unassigned assets'; END IF;
    IF v_count>1 AND NOT coalesce((p_activity->>'allowMultiple')::boolean,false) THEN
      RAISE EXCEPTION 'classification cannot assign one asset to multiple categories'; END IF;
  END LOOP;
  RETURN true;
END;$$;

-- Guard the shared response table as well: callers must not bypass board
-- validation by calling the older generic submit_classroom_response RPC directly.
CREATE OR REPLACE FUNCTION public.classification_response_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_session public.classroom_sessions%ROWTYPE;v_activity jsonb;
BEGIN
  IF NEW.mode <> 'classification-board' THEN
    IF TG_OP='UPDATE' AND OLD.mode='classification-board' THEN
      RAISE EXCEPTION 'classification response mode cannot change';
    END IF;
    RETURN NEW;
  END IF;
  SELECT s.* INTO v_session FROM public.classroom_sessions s WHERE s.id=NEW.session_id;
  IF v_session.id IS NULL OR v_session.activity_mode<>'classification-board'
    OR v_session.session_kind='course' OR coalesce(NEW.node_ref,'')<>'' THEN
    RAISE EXCEPTION 'classification response does not match active activity'; END IF;
  v_activity:=(v_session.activity_encoded::jsonb)->'activity';
  IF v_activity->>'collaboration'='group' THEN
    RAISE EXCEPTION 'group classification must use representative RPC'; END IF;
  PERFORM public.classification_validate_board(v_activity,NEW.payload->'board');
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS classification_response_validate ON public.student_responses;
CREATE TRIGGER classification_response_validate BEFORE INSERT OR UPDATE
ON public.student_responses FOR EACH ROW
EXECUTE FUNCTION public.classification_response_guard();

-- Individual work goes through the established participant/session response writer.
CREATE OR REPLACE FUNCTION public.submit_classification_individual(
  p_session_id uuid,p_participant_token text,p_board jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_activity jsonb;
BEGIN
  SELECT s.* INTO v_s FROM public.classroom_sessions s WHERE s.id=p_session_id;
  IF v_s.id IS NULL OR v_s.status<>'active' OR v_s.session_kind='course'
      OR v_s.activity_mode<>'classification-board' THEN
    RAISE EXCEPTION 'classification session not active'; END IF;
  v_activity:=(v_s.activity_encoded::jsonb)->'activity';
  IF v_activity->>'collaboration'='group' THEN RAISE EXCEPTION 'group classification requires representative'; END IF;
  PERFORM public.classification_validate_board(v_activity,p_board);
  PERFORM public.submit_classroom_response(p_session_id,p_participant_token,0,'final',
    'classification-board','[]'::jsonb,NULL,jsonb_build_object('board',p_board),NULL);
  RETURN true;
END;$$;

-- Only the member's own group's board can be read. No other group or teacher token disclosed.
CREATE OR REPLACE FUNCTION public.get_classification_group_state(
  p_session_id uuid,p_participant_token text,p_node_ref text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_p uuid;v_group uuid;v_label text;v_rep uuid;v_board jsonb;v_rev bigint;v_node text;
BEGIN
  v_node:=coalesce(p_node_ref,'');
  SELECT p.id INTO v_p FROM public.session_participants p
    WHERE p.session_id=p_session_id AND p.participant_token=p_participant_token LIMIT 1;
  IF v_p IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
  SELECT gm.group_id,g.label INTO v_group,v_label
    FROM public.session_group_members gm JOIN public.session_groups g ON g.id=gm.group_id
    WHERE gm.session_id=p_session_id AND gm.participant_id=v_p AND gm.node_ref=v_node AND g.node_ref=v_node LIMIT 1;
  IF v_group IS NULL THEN RETURN jsonb_build_object('assigned',false,'revision',0,'can_edit',false); END IF;
  SELECT p.id INTO v_rep FROM public.session_group_members gm
    JOIN public.session_participants p ON p.id=gm.participant_id
    WHERE gm.session_id=p_session_id AND gm.group_id=v_group AND gm.node_ref=v_node
    ORDER BY p.joined_at,p.id LIMIT 1;
  SELECT b.board,b.revision INTO v_board,v_rev FROM public.classification_group_boards b
    WHERE b.session_id=p_session_id AND b.node_ref=v_node AND b.group_id=v_group;
  RETURN jsonb_build_object('assigned',true,'group_id',v_group,'group_label',v_label,
     'can_edit',v_rep=v_p,'revision',coalesce(v_rev,0),'board',v_board);
END;$$;

CREATE OR REPLACE FUNCTION public.submit_classification_group_board(
 p_session_id uuid,p_participant_token text,p_node_ref text,p_expected_revision bigint,p_board jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_p uuid;v_group uuid;v_rep uuid;v_node text;v_revision bigint;v_session public.classroom_sessions%ROWTYPE;
  v_activity jsonb;v_assets jsonb;v_groups jsonb;v_m jsonb;v_asset jsonb;
BEGIN
  v_node:=coalesce(p_node_ref,'');
  SELECT s.* INTO v_session FROM public.classroom_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF v_session.id IS NULL OR v_session.status<>'active' THEN RAISE EXCEPTION 'session closed'; END IF;
  IF coalesce(v_session.activity_mode,'')<>'classification-board' THEN
    RAISE EXCEPTION 'classification activity is not active'; END IF;
  IF v_session.session_kind='course' THEN
    IF coalesce(v_session.current_node_ref,'')<>v_node THEN RAISE EXCEPTION 'course node has changed'; END IF;
    IF EXISTS(SELECT 1 FROM public.course_node_runtime_v2359 n
      WHERE n.session_id=p_session_id AND n.node_ref=v_node AND n.lifecycle='settled') THEN
      RAISE EXCEPTION 'course node settled'; END IF;
    -- A future Course-enabled version must resolve activity config from that Node snapshot.
    RAISE EXCEPTION 'classification Course runtime not enabled in this migration';
  END IF;
  IF v_node<>'' THEN RAISE EXCEPTION 'invalid classification node'; END IF;
  SELECT p.id INTO v_p FROM public.session_participants p
    WHERE p.session_id=p_session_id AND p.participant_token=p_participant_token LIMIT 1;
  IF v_p IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
  SELECT gm.group_id INTO v_group FROM public.session_group_members gm
    WHERE gm.session_id=p_session_id AND gm.node_ref=v_node AND gm.participant_id=v_p LIMIT 1;
  IF v_group IS NULL THEN RAISE EXCEPTION 'not assigned to a group'; END IF;
  SELECT p.id INTO v_rep FROM public.session_group_members gm
    JOIN public.session_participants p ON p.id=gm.participant_id
    WHERE gm.session_id=p_session_id AND gm.group_id=v_group AND gm.node_ref=v_node
    ORDER BY p.joined_at,p.id LIMIT 1;
  IF v_p<>v_rep THEN RAISE EXCEPTION 'only the group representative may submit'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'invalid expected revision'; END IF;
  v_activity:=(v_session.activity_encoded::jsonb)->'activity';
  IF v_activity IS NULL OR v_activity->>'collaboration'<>'group' THEN
    RAISE EXCEPTION 'activity does not allow group submission'; END IF;
  PERFORM public.classification_validate_board(v_activity,p_board);
  IF p_expected_revision>0 AND NOT EXISTS (SELECT 1 FROM public.classification_group_boards b
    WHERE b.session_id=p_session_id AND b.node_ref=v_node AND b.group_id=v_group) THEN
    RAISE EXCEPTION 'classification revision conflict, please reload';
  END IF;
  INSERT INTO public.classification_group_boards AS b
    (session_id,node_ref,group_id,board,revision,submitted_by)
  VALUES(p_session_id,v_node,v_group,p_board,1,v_p)
  ON CONFLICT(session_id,node_ref,group_id) DO UPDATE SET
    board=excluded.board,revision=b.revision+1,submitted_by=excluded.submitted_by,updated_at=now()
    WHERE b.revision=p_expected_revision
  RETURNING revision INTO v_revision;
  IF v_revision IS NULL THEN
    RAISE EXCEPTION 'classification revision conflict, please reload'; END IF;
  RETURN jsonb_build_object('ok',true,'revision',v_revision);
END;$$;

CREATE OR REPLACE FUNCTION public.get_classification_teacher_boards(
 p_session_id uuid,p_teacher_token text,p_node_ref text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_json jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.classroom_sessions s
    WHERE s.id=p_session_id AND s.teacher_token=p_teacher_token) THEN
    RAISE EXCEPTION 'invalid teacher token'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('group_id',g.id,'group_label',g.label,
    'revision',coalesce(b.revision,0),'board',b.board,'updated_at',b.updated_at)
    ORDER BY g.group_index),'[]'::jsonb) INTO v_json
    FROM public.session_groups g LEFT JOIN public.classification_group_boards b
      ON b.session_id=g.session_id AND b.node_ref=g.node_ref AND b.group_id=g.id
    WHERE g.session_id=p_session_id AND g.node_ref=coalesce(p_node_ref,'');
  RETURN v_json;
END;$$;

REVOKE ALL ON FUNCTION public.classification_validate_board(jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_classification_individual(uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_classification_group_state(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_classification_group_board(uuid,text,text,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_classification_teacher_boards(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_classification_individual(uuid,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_classification_group_state(uuid,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_classification_group_board(uuid,text,text,bigint,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_classification_teacher_boards(uuid,text,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';

-- =========== END [01/08] upgrade-classification-session-r3.sql ===========

-- =========== [02/08] upgrade-classification-session-r4.sql ===========
-- Original SHA-256: 54ebf511b6781b2eb5a65f2e844e9c1e6294788fd6b722aa152a2299bd14c14c
-- Classroom Interactive / Stage 2 R4: additive hardening and scoped restore RPCs.
-- Apply AFTER the existing V2.36.1 schema and upgrade-classification-session-r3.sql.
-- No DROP TABLE, DELETE, TRUNCATE, or rewriting any existing student response.
-- Back up first; verify on a test Supabase project before production deployment.
-- The shared legacy student-state RPC intentionally does not include classification-board
-- in its response filter. Provide a dedicated student-only restore instead of replacing
-- the long-lived RPC used by all older teaching modules.
CREATE OR REPLACE FUNCTION public.get_classification_individual_board(
  p_session_id uuid,p_participant_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_p uuid;v_activity jsonb;v_s public.classroom_sessions%ROWTYPE;
        v_board jsonb;v_submitted timestamptz;
BEGIN
  SELECT s.* INTO v_s FROM public.classroom_sessions s WHERE s.id=p_session_id;
  IF v_s.id IS NULL OR v_s.activity_mode<>'classification-board'
     OR v_s.session_kind='course' THEN
    RAISE EXCEPTION 'classification session unavailable'; END IF;
  SELECT p.id INTO v_p FROM public.session_participants p
    WHERE p.session_id=p_session_id AND p.participant_token=p_participant_token LIMIT 1;
  IF v_p IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
  v_activity:=(v_s.activity_encoded::jsonb)->'activity';
  IF v_activity->>'collaboration'<>'individual' THEN
    RAISE EXCEPTION 'not an individual classification session'; END IF;
  SELECT r.payload->'board',r.submitted_at INTO v_board,v_submitted
    FROM public.student_responses r
    WHERE r.session_id=p_session_id AND r.participant_id=v_p
      AND coalesce(r.node_ref,'')='' AND r.task_index=0
      AND r.stage_key='final' AND r.mode='classification-board'
    LIMIT 1;
  RETURN jsonb_build_object('board',v_board,'submitted',v_board IS NOT NULL,
    'submitted_at',v_submitted,'allow_revise',coalesce((v_activity->>'allowRevise')::boolean,true));
END;$$;

-- The saved activity is returned to the authorized teacher so an older session
-- is rendered with the *original* assets, not whichever activity is being edited locally.
CREATE OR REPLACE FUNCTION public.get_classification_teacher_activity(
  p_session_id uuid,p_teacher_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_activity jsonb;
BEGIN
  SELECT s.* INTO v_s FROM public.classroom_sessions s
    WHERE s.id=p_session_id AND s.teacher_token=p_teacher_token;
  IF v_s.id IS NULL OR v_s.activity_mode<>'classification-board'
    OR v_s.session_kind='course' THEN RAISE EXCEPTION 'invalid classification teacher session'; END IF;
  v_activity:=(v_s.activity_encoded::jsonb)->'activity';
  IF jsonb_typeof(v_activity)<>'object' THEN RAISE EXCEPTION 'classification activity unavailable'; END IF;
  RETURN v_activity;
END;$$;

-- Harden the shared response table for classification Sessions. Other Session modes
-- retain their existing behavior; all their stored rows are left untouched.
CREATE OR REPLACE FUNCTION public.classification_response_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_activity jsonb;
BEGIN
  IF TG_OP='UPDATE' AND OLD.mode='classification-board' AND NEW.mode<>'classification-board' THEN
    RAISE EXCEPTION 'classification response mode cannot change'; END IF;
  IF NEW.mode<>'classification-board' THEN
    SELECT s.* INTO v_s FROM public.classroom_sessions s WHERE s.id=NEW.session_id;
    IF v_s.activity_mode='classification-board' THEN
      RAISE EXCEPTION 'classification responses must use classification mode'; END IF;
    RETURN NEW;
  END IF;
  SELECT s.* INTO v_s FROM public.classroom_sessions s WHERE s.id=NEW.session_id;
  IF v_s.id IS NULL OR v_s.status<>'active' OR v_s.activity_mode<>'classification-board'
    OR v_s.session_kind='course' OR coalesce(NEW.node_ref,'')<>''
    OR NEW.task_index<>0 OR NEW.stage_key<>'final' THEN
    RAISE EXCEPTION 'classification response does not match active activity'; END IF;
  v_activity:=(v_s.activity_encoded::jsonb)->'activity';
  IF v_activity->>'collaboration'<>'individual' THEN
    RAISE EXCEPTION 'individual classification must use individual RPC'; END IF;
  IF TG_OP='UPDATE' AND NOT coalesce((v_activity->>'allowRevise')::boolean,true) THEN
    RAISE EXCEPTION 'classification revision is disabled'; END IF;
  PERFORM public.classification_validate_board(v_activity,NEW.payload->'board');
  RETURN NEW;
END;$$;

-- Group boards have no direct anon/table write grants. This trigger also protects
-- group edits through any existing SECURITY DEFINER functions, including R3 RPCs.
CREATE OR REPLACE FUNCTION public.classification_group_revision_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_activity jsonb;
BEGIN
  SELECT s.* INTO v_s FROM public.classroom_sessions s WHERE s.id=NEW.session_id;
  IF v_s.id IS NULL OR v_s.status<>'active' OR v_s.activity_mode<>'classification-board'
    OR v_s.session_kind='course' OR coalesce(NEW.node_ref,'')<>'' THEN
    RAISE EXCEPTION 'classification session unavailable'; END IF;
  v_activity:=(v_s.activity_encoded::jsonb)->'activity';
  IF v_activity->>'collaboration'<>'group' THEN
    RAISE EXCEPTION 'not a group classification session'; END IF;
  IF TG_OP='UPDATE' AND NOT coalesce((v_activity->>'allowRevise')::boolean,true) THEN
    RAISE EXCEPTION 'classification revision is disabled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.session_groups g
    WHERE g.id=NEW.group_id AND g.session_id=NEW.session_id
      AND coalesce(g.node_ref,'')=coalesce(NEW.node_ref,'')) THEN
    RAISE EXCEPTION 'group/session mismatch'; END IF;
  PERFORM public.classification_validate_board(v_activity,NEW.board);
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS classification_group_revision_guard ON public.classification_group_boards;
CREATE TRIGGER classification_group_revision_guard BEFORE INSERT OR UPDATE
  ON public.classification_group_boards FOR EACH ROW
  EXECUTE FUNCTION public.classification_group_revision_guard();

REVOKE ALL ON FUNCTION public.get_classification_individual_board(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_classification_teacher_activity(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classification_response_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classification_group_revision_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_classification_individual_board(uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_classification_teacher_activity(uuid,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';

-- =========== END [02/08] upgrade-classification-session-r4.sql ===========

-- =========== [03/08] upgrade-classification-session-r5.sql ===========
-- Original SHA-256: 94b8bbade1a31f198c6c94c242bf9199e3b02c9fcb0b2b560795ecd6dde65694
-- Stage 2 R5 | Classification Board Course Node: additive migration.
-- Required order: V2.36.1 unified -> R3 -> R4 -> R5. Backup/test first.
-- Never truncate historical student responses; avoid altering any legacy function signatures.
CREATE TABLE IF NOT EXISTS public.classification_course_nodes (
 session_id uuid NOT NULL REFERENCES public.classroom_sessions(id) ON DELETE CASCADE,
 node_ref text NOT NULL,
 activity jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,node_ref),
 CHECK(length(trim(node_ref))>0)
);
ALTER TABLE public.classification_course_nodes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.classification_course_nodes FROM public,anon,authenticated;

-- Teacher-controlled registration is immutable (even after Session changes).
CREATE OR REPLACE FUNCTION public.register_classification_course_node(
 p_session_id uuid,p_teacher_token text,p_node_ref text,p_activity jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;
BEGIN
 SELECT * INTO v_s FROM public.classroom_sessions WHERE id=p_session_id AND teacher_token=p_teacher_token FOR UPDATE;
 IF NOT FOUND OR v_s.session_kind<>'course' OR v_s.status<>'active' THEN RAISE EXCEPTION 'invalid active course teacher'; END IF;
 IF length(trim(coalesce(p_node_ref,'')))<1 OR length(p_node_ref)>160 THEN RAISE EXCEPTION 'invalid course node'; END IF;
 IF jsonb_typeof(p_activity)<>'object' OR jsonb_typeof(p_activity->'assets')<>'array'
   OR jsonb_array_length(p_activity->'assets')<1 OR length(p_activity::text)>100000
   OR length(coalesce(p_activity->>'id',''))<1
   OR coalesce(p_activity->>'collaboration','') NOT IN ('individual','group')
   OR coalesce(p_activity->>'mode','') NOT IN ('free','assigned') THEN
   RAISE EXCEPTION 'invalid classification activity'; END IF;
 -- ON CONFLICT does not rewrite a previously registered course/node configuration.
 INSERT INTO public.classification_course_nodes(session_id,node_ref,activity)
 VALUES(p_session_id,p_node_ref,p_activity) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.classification_course_nodes
    WHERE session_id=p_session_id AND node_ref=p_node_ref AND activity=p_activity) THEN
    RAISE EXCEPTION 'classification course node configuration is immutable'; END IF;
 RETURN true;
END;$$;

-- Resolve the immutable configuration of the currently active Course node.
CREATE OR REPLACE FUNCTION public.classification_active_course_activity(
 p_session_id uuid,p_node_ref text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_activity jsonb;
BEGIN
 SELECT * INTO v_s FROM public.classroom_sessions WHERE id=p_session_id;
 IF NOT FOUND OR v_s.status<>'active' OR v_s.session_kind<>'course'
    OR v_s.activity_mode<>'classification-board'
    OR coalesce(v_s.current_node_ref,'')<>coalesce(p_node_ref,'') THEN
    RAISE EXCEPTION 'classification course node is not active'; END IF;
 IF EXISTS(SELECT 1 FROM public.course_node_runtime_v2359
    WHERE session_id=p_session_id AND node_ref=p_node_ref AND lifecycle='settled') THEN
    RAISE EXCEPTION 'classification course node has settled'; END IF;
 SELECT activity INTO v_activity FROM public.classification_course_nodes
   WHERE session_id=p_session_id AND node_ref=p_node_ref;
 IF v_activity IS NULL THEN RAISE EXCEPTION 'classification course node is not registered'; END IF;
 RETURN v_activity;
END;$$;

CREATE OR REPLACE FUNCTION public.get_classification_course_student_activity(
 p_session_id uuid,p_participant_token text,p_node_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_p uuid;
BEGIN
 SELECT id INTO v_p FROM public.session_participants WHERE session_id=p_session_id
   AND participant_token=p_participant_token;
 IF v_p IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
 RETURN public.classification_active_course_activity(p_session_id,p_node_ref);
END;$$;

CREATE OR REPLACE FUNCTION public.get_classification_course_individual(
 p_session_id uuid,p_participant_token text,p_node_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_p uuid;v_activity jsonb;v_board jsonb;v_ts timestamptz;
BEGIN
 SELECT id INTO v_p FROM public.session_participants WHERE session_id=p_session_id
   AND participant_token=p_participant_token;
 IF v_p IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
 v_activity:=public.classification_active_course_activity(p_session_id,p_node_ref);
 IF v_activity->>'collaboration'<>'individual' THEN RAISE EXCEPTION 'not an individual classification'; END IF;
 SELECT payload->'board',submitted_at INTO v_board,v_ts FROM public.student_responses
 WHERE session_id=p_session_id AND participant_id=v_p AND node_ref=p_node_ref
   AND task_index=0 AND mode='classification-board' AND stage_key='final' LIMIT 1;
 RETURN jsonb_build_object('board',v_board,'submitted',v_board IS NOT NULL,'submitted_at',v_ts,
   'allow_revise',coalesce((v_activity->>'allowRevise')::boolean,true));
END;$$;

-- Rewrite the existing classification trigger to accept both legacy independent Sessions
-- and Course Nodes while preserving all old-mode responses unchanged.
CREATE OR REPLACE FUNCTION public.classification_response_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_activity jsonb;
BEGIN
 IF TG_OP='UPDATE' AND OLD.mode='classification-board' AND NEW.mode<>'classification-board'
   THEN RAISE EXCEPTION 'classification response mode cannot change'; END IF;
 SELECT * INTO v_s FROM public.classroom_sessions WHERE id=NEW.session_id;
 IF NEW.mode<>'classification-board' THEN
   IF v_s.activity_mode='classification-board' THEN
     RAISE EXCEPTION 'classification response mode required'; END IF;
   RETURN NEW;
 END IF;
 IF v_s.id IS NULL OR v_s.status<>'active' OR v_s.activity_mode<>'classification-board'
   OR NEW.task_index<>0 OR NEW.stage_key<>'final' THEN
   RAISE EXCEPTION 'classification response does not match active activity'; END IF;
 IF v_s.session_kind='course' THEN
   v_activity:=public.classification_active_course_activity(NEW.session_id,coalesce(NEW.node_ref,''));
 ELSE
   IF coalesce(NEW.node_ref,'')<>'' THEN RAISE EXCEPTION 'invalid standalone classification node'; END IF;
   v_activity:=(v_s.activity_encoded::jsonb)->'activity';
 END IF;
 IF v_activity->>'collaboration'<>'individual' THEN RAISE EXCEPTION 'individual classification required'; END IF;
 IF TG_OP='UPDATE' AND NOT coalesce((v_activity->>'allowRevise')::boolean,true)
   THEN RAISE EXCEPTION 'classification revision is disabled'; END IF;
 PERFORM public.classification_validate_board(v_activity,NEW.payload->'board');
 RETURN NEW;
END;$$;

-- The insert/update takes a row lock on the Session, serializing against Node switches.
CREATE OR REPLACE FUNCTION public.submit_classification_course_individual(
 p_session_id uuid,p_participant_token text,p_node_ref text,p_board jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_p uuid;v_activity jsonb;
BEGIN
 SELECT * INTO v_s FROM public.classroom_sessions WHERE id=p_session_id FOR UPDATE;
 v_activity:=public.classification_active_course_activity(p_session_id,p_node_ref);
 IF v_activity->>'collaboration'<>'individual' THEN RAISE EXCEPTION 'this is a group classification'; END IF;
 SELECT id INTO v_p FROM public.session_participants WHERE session_id=p_session_id
   AND participant_token=p_participant_token;
 IF v_p IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
 PERFORM public.classification_validate_board(v_activity,p_board);
 UPDATE public.student_responses SET payload=jsonb_build_object('board',p_board),
   submitted_at=now(),mode='classification-board',selected_elements='[]'::jsonb,selected_type=NULL
 WHERE session_id=p_session_id AND participant_id=v_p AND node_ref=p_node_ref
  AND task_index=0 AND stage_key='final' AND mode='classification-board';
 IF NOT FOUND THEN
   INSERT INTO public.student_responses(session_id,participant_id,node_ref,task_index,stage_key,mode,payload)
   VALUES(p_session_id,v_p,p_node_ref,0,'final','classification-board',jsonb_build_object('board',p_board));
 END IF;
 RETURN true;
END;$$;

-- Keep R4 group's allowRevise guard, now node-scoped for Course.
CREATE OR REPLACE FUNCTION public.classification_group_revision_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_activity jsonb;
BEGIN
 SELECT * INTO v_s FROM public.classroom_sessions WHERE id=NEW.session_id;
 IF v_s.id IS NULL OR v_s.status<>'active' OR v_s.activity_mode<>'classification-board' THEN
    RAISE EXCEPTION 'classification session unavailable'; END IF;
 IF v_s.session_kind='course' THEN
   v_activity:=public.classification_active_course_activity(NEW.session_id,NEW.node_ref);
 ELSE
   IF coalesce(NEW.node_ref,'')<>'' THEN RAISE EXCEPTION 'invalid classification node'; END IF;
   v_activity:=(v_s.activity_encoded::jsonb)->'activity';
 END IF;
 IF v_activity->>'collaboration'<>'group' THEN RAISE EXCEPTION 'not a group classification'; END IF;
 IF TG_OP='UPDATE' AND NOT coalesce((v_activity->>'allowRevise')::boolean,true)
   THEN RAISE EXCEPTION 'classification revision is disabled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.session_groups g WHERE g.id=NEW.group_id
   AND g.session_id=NEW.session_id AND coalesce(g.node_ref,'')=coalesce(NEW.node_ref,'')) THEN
   RAISE EXCEPTION 'group/session/node mismatch'; END IF;
 PERFORM public.classification_validate_board(v_activity,NEW.board);
 RETURN NEW;
END;$$;
CREATE OR REPLACE FUNCTION public.submit_classification_group_board(
 p_session_id uuid,p_participant_token text,p_node_ref text,p_expected_revision bigint,p_board jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_p uuid;v_group uuid;v_rep uuid;v_node text;v_revision bigint;v_session public.classroom_sessions%ROWTYPE;
  v_activity jsonb;v_assets jsonb;v_groups jsonb;v_m jsonb;v_asset jsonb;
BEGIN
  v_node:=coalesce(p_node_ref,'');
  SELECT s.* INTO v_session FROM public.classroom_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF v_session.id IS NULL OR v_session.status<>'active' THEN RAISE EXCEPTION 'session closed'; END IF;
  IF coalesce(v_session.activity_mode,'')<>'classification-board' THEN
    RAISE EXCEPTION 'classification activity is not active'; END IF;
  IF v_session.session_kind='course' THEN
    IF coalesce(v_session.current_node_ref,'')<>v_node THEN RAISE EXCEPTION 'course node has changed'; END IF;
    IF EXISTS(SELECT 1 FROM public.course_node_runtime_v2359 n
      WHERE n.session_id=p_session_id AND n.node_ref=v_node AND n.lifecycle='settled') THEN
      RAISE EXCEPTION 'course node settled'; END IF;
    v_activity:=public.classification_active_course_activity(p_session_id,v_node);
  END IF;
  IF v_session.session_kind<>'course' AND v_node<>'' THEN RAISE EXCEPTION 'invalid classification node'; END IF;
  SELECT p.id INTO v_p FROM public.session_participants p
    WHERE p.session_id=p_session_id AND p.participant_token=p_participant_token LIMIT 1;
  IF v_p IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
  SELECT gm.group_id INTO v_group FROM public.session_group_members gm
    WHERE gm.session_id=p_session_id AND gm.node_ref=v_node AND gm.participant_id=v_p LIMIT 1;
  IF v_group IS NULL THEN RAISE EXCEPTION 'not assigned to a group'; END IF;
  SELECT p.id INTO v_rep FROM public.session_group_members gm
    JOIN public.session_participants p ON p.id=gm.participant_id
    WHERE gm.session_id=p_session_id AND gm.group_id=v_group AND gm.node_ref=v_node
    ORDER BY p.joined_at,p.id LIMIT 1;
  IF v_p<>v_rep THEN RAISE EXCEPTION 'only the group representative may submit'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'invalid expected revision'; END IF;
  IF v_session.session_kind<>'course' THEN
    v_activity:=(v_session.activity_encoded::jsonb)->'activity';
  END IF;
  IF v_activity IS NULL OR v_activity->>'collaboration'<>'group' THEN
    RAISE EXCEPTION 'activity does not allow group submission'; END IF;
  PERFORM public.classification_validate_board(v_activity,p_board);
  IF p_expected_revision>0 AND NOT EXISTS (SELECT 1 FROM public.classification_group_boards b
    WHERE b.session_id=p_session_id AND b.node_ref=v_node AND b.group_id=v_group) THEN
    RAISE EXCEPTION 'classification revision conflict, please reload';
  END IF;
  INSERT INTO public.classification_group_boards AS b
    (session_id,node_ref,group_id,board,revision,submitted_by)
  VALUES(p_session_id,v_node,v_group,p_board,1,v_p)
  ON CONFLICT(session_id,node_ref,group_id) DO UPDATE SET
    board=excluded.board,revision=b.revision+1,submitted_by=excluded.submitted_by,updated_at=now()
    WHERE b.revision=p_expected_revision
  RETURNING revision INTO v_revision;
  IF v_revision IS NULL THEN
    RAISE EXCEPTION 'classification revision conflict, please reload'; END IF;
  RETURN jsonb_build_object('ok',true,'revision',v_revision);
END;$$;


-- A Session group cannot be deleted or moved once its submitted board exists.
-- This guards the older assign_session_groups RPC, which deletes its previous groups.
CREATE OR REPLACE FUNCTION public.classification_preserve_submitted_group()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.classification_group_boards b WHERE b.group_id=OLD.id) THEN
   RAISE EXCEPTION 'classification group has submitted results; cannot reassign'; END IF;
 RETURN OLD;
END;$$;
DROP TRIGGER IF EXISTS classification_preserve_submitted_group ON public.session_groups;
CREATE TRIGGER classification_preserve_submitted_group BEFORE DELETE OR UPDATE
 ON public.session_groups FOR EACH ROW EXECUTE FUNCTION public.classification_preserve_submitted_group();

-- Do not expose direct table access to participant tokens.
REVOKE ALL ON FUNCTION public.classification_active_course_activity(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_classification_course_node(uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_classification_course_student_activity(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_classification_course_individual(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_classification_course_individual(uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classification_preserve_submitted_group() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_classification_course_node(uuid,text,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_classification_course_student_activity(uuid,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_classification_course_individual(uuid,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_classification_course_individual(uuid,text,text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';

-- =========== END [03/08] upgrade-classification-session-r5.sql ===========

-- =========== [04/08] upgrade-classification-session-r6.sql ===========
-- Original SHA-256: 0340df5d1ef61e8aaa35c128e205d4ee0bac26f6b9db4772e65caf99715c853c
-- Classroom Interactive Stage 2 R6 | Course classification controlled publication
-- ADDITIVE ONLY. Prerequisites: V2.36.1 -> R3 -> R4 -> R5.
-- Back up the database; validate with a TEST Supabase project first.
CREATE TABLE IF NOT EXISTS public.classification_course_publications (
 session_id uuid NOT NULL,
 node_ref text NOT NULL,
 published boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (session_id,node_ref),
 FOREIGN KEY (session_id,node_ref) REFERENCES public.classification_course_nodes(session_id,node_ref) ON DELETE CASCADE
);
ALTER TABLE public.classification_course_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.classification_course_publications FROM PUBLIC,anon,authenticated;

-- Only a teacher holding the token may publish/withdraw results for the CURRENT Node.
-- The Session row lock ensures that concurrent switches cannot publish an old Node.
CREATE OR REPLACE FUNCTION public.set_classification_course_publication(
 p_session_id uuid, p_teacher_token text, p_node_ref text,
 p_published boolean, p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_revision bigint;
BEGIN
 SELECT * INTO v_s FROM public.classroom_sessions
 WHERE id=p_session_id AND teacher_token=p_teacher_token FOR UPDATE;
 IF NOT FOUND OR v_s.status<>'active' OR v_s.session_kind<>'course'
   OR v_s.activity_mode<>'classification-board'
   OR coalesce(v_s.current_node_ref,'')<>coalesce(p_node_ref,'') THEN
   RAISE EXCEPTION 'classification publication requires current Course Node';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.classification_course_nodes
   WHERE session_id=p_session_id AND node_ref=p_node_ref) THEN
   RAISE EXCEPTION 'classification Course Node not registered';
 END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 THEN
   RAISE EXCEPTION 'invalid classification publication revision';
 END IF;
 INSERT INTO public.classification_course_publications AS c
   (session_id,node_ref,published,revision,updated_at)
 VALUES(p_session_id,p_node_ref,coalesce(p_published,false),1,now())
 ON CONFLICT (session_id,node_ref) DO UPDATE
 SET published=excluded.published,revision=c.revision+1,updated_at=now()
 WHERE c.revision=p_expected_revision
 RETURNING revision INTO v_revision;
 IF v_revision IS NULL OR (v_revision<>p_expected_revision+1) THEN
   RAISE EXCEPTION 'classification publication revision conflict; refresh first';
 END IF;
 RETURN jsonb_build_object('published',coalesce(p_published,false),'revision',v_revision);
END;$$;

CREATE OR REPLACE FUNCTION public.get_classification_course_teacher_publication(
 p_session_id uuid,p_teacher_token text,p_node_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_state public.classification_course_publications%ROWTYPE;
BEGIN
 SELECT * INTO v_s FROM public.classroom_sessions WHERE id=p_session_id AND teacher_token=p_teacher_token;
 IF NOT FOUND OR v_s.session_kind<>'course' THEN RAISE EXCEPTION 'invalid course teacher'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.classification_course_nodes
 WHERE session_id=p_session_id AND node_ref=p_node_ref) THEN RAISE EXCEPTION 'unregistered classification node'; END IF;
 SELECT * INTO v_state FROM public.classification_course_publications
 WHERE session_id=p_session_id AND node_ref=p_node_ref;
 RETURN jsonb_build_object('published',coalesce(v_state.published,false),
   'revision',coalesce(v_state.revision,0),'node_ref',p_node_ref);
END;$$;

-- Never return unpublished boards. Returned data contains NO tokens, names, student IDs,
-- participant IDs, submission times, or group IDs. Identity labels are generated afresh.
-- This RPC is the *only* student route to see classmates' work.
CREATE OR REPLACE FUNCTION public.get_classification_course_published(
 p_session_id uuid,p_participant_token text,p_node_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_activity jsonb;v_collab text;
 v_published boolean;v_rows jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.session_participants
 WHERE session_id=p_session_id AND participant_token=p_participant_token) THEN
   RAISE EXCEPTION 'invalid participant token';
 END IF;
 SELECT * INTO v_s FROM public.classroom_sessions WHERE id=p_session_id;
 IF NOT FOUND OR v_s.status<>'active' OR v_s.session_kind<>'course'
   OR v_s.activity_mode<>'classification-board'
   OR coalesce(v_s.current_node_ref,'')<>coalesce(p_node_ref,'') THEN
   RAISE EXCEPTION 'classification Course Node is not current';
 END IF;
 SELECT activity INTO v_activity FROM public.classification_course_nodes
 WHERE session_id=p_session_id AND node_ref=p_node_ref;
 IF v_activity IS NULL THEN RAISE EXCEPTION 'classification course node not registered'; END IF;
 SELECT published INTO v_published FROM public.classification_course_publications
 WHERE session_id=p_session_id AND node_ref=p_node_ref;
 IF coalesce(v_published,false)=false THEN RETURN jsonb_build_object('published',false,'results','[]'::jsonb);END IF;
 v_collab:=v_activity->>'collaboration';
 IF v_collab='group' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('label','成果 '||x.rn,'board',x.board)
     ORDER BY x.rn),'[]'::jsonb) INTO v_rows FROM (
      SELECT row_number() OVER (ORDER BY b.updated_at,b.group_id) rn,b.board
      FROM public.classification_group_boards b
      WHERE b.session_id=p_session_id AND b.node_ref=p_node_ref
        AND b.board->>'activityId'=v_activity->>'id'
      ORDER BY b.updated_at,b.group_id LIMIT 200
   ) x;
 ELSE
   SELECT coalesce(jsonb_agg(jsonb_build_object('label','成果 '||x.rn,'board',x.board)
      ORDER BY x.rn),'[]'::jsonb) INTO v_rows FROM (
     SELECT row_number() OVER (ORDER BY r.submitted_at,r.id) rn,r.payload->'board' board
     FROM public.student_responses r
     WHERE r.session_id=p_session_id AND r.node_ref=p_node_ref
       AND r.mode='classification-board' AND r.stage_key='final' AND r.task_index=0
       AND r.payload->'board'->>'activityId'=v_activity->>'id'
     ORDER BY r.submitted_at,r.id LIMIT 200
   ) x;
 END IF;
 RETURN jsonb_build_object('published',true,'results',v_rows,'node_ref',p_node_ref);
END;$$;

REVOKE ALL ON FUNCTION public.set_classification_course_publication(uuid,text,text,boolean,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_classification_course_teacher_publication(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_classification_course_published(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_classification_course_publication(uuid,text,text,boolean,bigint) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_classification_course_teacher_publication(uuid,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_classification_course_published(uuid,text,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';

-- =========== END [04/08] upgrade-classification-session-r6.sql ===========

-- =========== [05/08] upgrade-classification-session-r7.sql ===========
-- Original SHA-256: 503e59a042c3ca29d20f78b7c1fda198b5a8dc3cb36f6f621f20df9b22286b08
-- Classroom Interactive Stage 2 R7 | Public result payload hardening
-- Required: V2.36.1 + Stage 2 R3 -> R4 -> R5 -> R6.
-- ADDITIVE / REPLACE-ONLY: does not alter or remove existing student responses.
-- Apply first in a backed-up TEST Supabase database; not live-tested here.
-- Never expose the untrusted full submitted JSON as a public result. Board entries can
-- otherwise include arbitrary extra keys, even when the client never creates them.
-- Student-entered category names and reasons still require teacher moderation.
CREATE OR REPLACE FUNCTION public.classification_public_board(
  p_board jsonb,p_activity_id text
) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT jsonb_build_object(
  'activityId',p_activity_id,
  'groups',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',g.elem->>'id','name',g.elem->>'name','reason',g.elem->>'reason'
    ) ORDER BY g.ord)
    FROM jsonb_array_elements(coalesce(p_board->'groups','[]'::jsonb))
      WITH ORDINALITY AS g(elem,ord)
  ),'[]'::jsonb),
  'memberships',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'assetId',m.elem->>'assetId','groupId',m.elem->>'groupId'
    ) ORDER BY m.ord)
    FROM jsonb_array_elements(coalesce(p_board->'memberships','[]'::jsonb))
      WITH ORDINALITY AS m(elem,ord)
  ),'[]'::jsonb)
 );
$$;

-- Keep the original R6 RPC signature, teacher controls, labels and shape.
-- Prevent returning arbitrary root/group/membership fields supplied by a modified client.
CREATE OR REPLACE FUNCTION public.get_classification_course_published(
 p_session_id uuid,p_participant_token text,p_node_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.classroom_sessions%ROWTYPE;v_activity jsonb;v_collab text;
 v_published boolean;v_rows jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.session_participants
 WHERE session_id=p_session_id AND participant_token=p_participant_token) THEN
   RAISE EXCEPTION 'invalid participant token';
 END IF;
 SELECT * INTO v_s FROM public.classroom_sessions WHERE id=p_session_id;
 IF NOT FOUND OR v_s.status<>'active' OR v_s.session_kind<>'course'
   OR v_s.activity_mode<>'classification-board'
   OR coalesce(v_s.current_node_ref,'')<>coalesce(p_node_ref,'') THEN
   RAISE EXCEPTION 'classification Course Node is not current';
 END IF;
 SELECT activity INTO v_activity FROM public.classification_course_nodes
 WHERE session_id=p_session_id AND node_ref=p_node_ref;
 IF v_activity IS NULL THEN RAISE EXCEPTION 'classification course node not registered'; END IF;
 SELECT published INTO v_published FROM public.classification_course_publications
 WHERE session_id=p_session_id AND node_ref=p_node_ref;
 IF coalesce(v_published,false)=false THEN
   RETURN jsonb_build_object('published',false,'results','[]'::jsonb);
 END IF;
 v_collab:=v_activity->>'collaboration';
 IF v_collab='group' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'label','成果 '||x.rn,
     'board',public.classification_public_board(x.board,v_activity->>'id')
   ) ORDER BY x.rn),'[]'::jsonb) INTO v_rows FROM (
     SELECT row_number() OVER (ORDER BY b.updated_at,b.group_id) rn,b.board
     FROM public.classification_group_boards b
     WHERE b.session_id=p_session_id AND b.node_ref=p_node_ref
       AND b.board->>'activityId'=v_activity->>'id'
     ORDER BY b.updated_at,b.group_id LIMIT 200
   ) x;
 ELSE
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'label','成果 '||x.rn,
     'board',public.classification_public_board(x.board,v_activity->>'id')
   ) ORDER BY x.rn),'[]'::jsonb) INTO v_rows FROM (
     SELECT row_number() OVER (ORDER BY r.submitted_at,r.id) rn,
       r.payload->'board' board
     FROM public.student_responses r
     WHERE r.session_id=p_session_id AND r.node_ref=p_node_ref
       AND r.mode='classification-board' AND r.stage_key='final' AND r.task_index=0
       AND r.payload->'board'->>'activityId'=v_activity->>'id'
     ORDER BY r.submitted_at,r.id LIMIT 200
   ) x;
 END IF;
 RETURN jsonb_build_object('published',true,'results',v_rows,'node_ref',p_node_ref);
END;$$;

REVOKE ALL ON FUNCTION public.classification_public_board(jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_classification_course_published(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_classification_course_published(uuid,text,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';

-- =========== END [05/08] upgrade-classification-session-r7.sql ===========

-- =========== [06/08] upgrade-evidence-judgment-r2.sql ===========
-- Original SHA-256: 55ed28b8f5071125cacd110211e14252cb662bffa5c62f8349bb8a4841cf884f
-- Stage 3 R2: evidence-based judgment, additive-only migration.
-- Prerequisites: current V2.36.1 unified schema and Stage 2 R3–R7 migrations.
-- Execute in a TEST Supabase project before production; back up the database first.
CREATE TABLE IF NOT EXISTS public.evidence_judgment_nodes_r2 (
  session_id uuid NOT NULL REFERENCES public.classroom_sessions(id) ON DELETE CASCADE,
  node_ref text NOT NULL DEFAULT '',
  settings jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,node_ref),
  CHECK (jsonb_typeof(settings)='object')
);
CREATE TABLE IF NOT EXISTS public.evidence_judgment_responses_r2 (
  session_id uuid NOT NULL REFERENCES public.classroom_sessions(id) ON DELETE CASCADE,
  node_ref text NOT NULL DEFAULT '',
  participant_id uuid NOT NULL REFERENCES public.session_participants(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('initial','evidence','final')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,node_ref,participant_id,phase),
  FOREIGN KEY (session_id,node_ref) REFERENCES public.evidence_judgment_nodes_r2(session_id,node_ref) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS evidence_judgment_responses_student_r2_idx ON public.evidence_judgment_responses_r2(session_id,participant_id,node_ref);
ALTER TABLE public.evidence_judgment_nodes_r2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_judgment_responses_r2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evidence_judgment_nodes_r2,public.evidence_judgment_responses_r2 FROM PUBLIC, anon,authenticated;

-- Settings are immutable within a Session+Node; a course activity library edit must not change active lessons.
CREATE OR REPLACE FUNCTION public.register_evidence_judgment_node_r2(
  p_session_id uuid,p_teacher_token text,p_node_ref text,p_settings jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.classroom_sessions%ROWTYPE; v_ref text; v_old jsonb; v_steps integer; v_opt jsonb;
BEGIN
  SELECT * INTO s FROM public.classroom_sessions WHERE id=p_session_id AND teacher_token=p_teacher_token FOR UPDATE;
  IF NOT FOUND OR s.status<>'active' THEN RAISE EXCEPTION 'invalid teacher token or closed session'; END IF;
  v_ref:=CASE WHEN s.session_kind='course' THEN trim(coalesce(p_node_ref,'')) ELSE '' END;
  IF s.session_kind='course' AND (length(v_ref)<1 OR length(v_ref)>160) THEN RAISE EXCEPTION 'invalid course node reference'; END IF;
  IF s.session_kind<>'course' AND s.activity_mode<>'evidence-judgment' THEN RAISE EXCEPTION 'incorrect activity mode'; END IF;
  IF jsonb_typeof(p_settings)<>'object' OR length(trim(coalesce(p_settings->>'question','')))=0 OR
     length(trim(coalesce(p_settings->'source'->>'text','')))=0 OR
     length(coalesce(p_settings->'source'->>'text',''))>16000 OR
     coalesce(p_settings->>'responseMode','') NOT IN ('single','multiple','open') THEN
    RAISE EXCEPTION 'invalid evidence activity settings';
  END IF;
  IF coalesce(p_settings->>'responseMode','')<>'open' AND (
       jsonb_typeof(p_settings->'options') IS DISTINCT FROM 'array' OR
       jsonb_array_length(p_settings->'options')<2 OR jsonb_array_length(p_settings->'options')>20) THEN
    RAISE EXCEPTION 'invalid evidence activity choices';
  END IF;
  IF coalesce(p_settings->>'responseMode','')<>'open' THEN
    FOR v_opt IN SELECT value FROM jsonb_array_elements(p_settings->'options') LOOP
      IF length(trim(coalesce(v_opt->>'id','')))=0 OR length(trim(coalesce(v_opt->>'label','')))=0 THEN
        RAISE EXCEPTION 'invalid evidence choice';
      END IF;
    END LOOP;
    IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_settings->'options')) <> jsonb_array_length(p_settings->'options') THEN
      RAISE EXCEPTION 'duplicate choice ids';
    END IF;
  END IF;
  v_steps:=1+(CASE WHEN coalesce((p_settings->>'initialEnabled')::boolean,true) THEN 1 ELSE 0 END)
            +(CASE WHEN coalesce((p_settings->>'rejudgeEnabled')::boolean,true) THEN 1 ELSE 0 END);
  -- Active node must have correct stage_count; inactive nodes will use teacher's runtime metadata on switching.
  IF s.activity_mode='evidence-judgment' AND (s.session_kind<>'course' OR s.current_node_ref=v_ref) AND s.stage_count<>v_steps THEN
     RAISE EXCEPTION 'stage count does not match evidence settings';
  END IF;
  SELECT settings INTO v_old FROM public.evidence_judgment_nodes_r2 WHERE session_id=p_session_id AND node_ref=v_ref;
  IF FOUND THEN
    IF v_old<>p_settings THEN RAISE EXCEPTION 'existing evidence settings are immutable'; END IF;
    RETURN jsonb_build_object('registered',true,'existing',true,'node_ref',v_ref);
  END IF;
  INSERT INTO public.evidence_judgment_nodes_r2(session_id,node_ref,settings) VALUES(p_session_id,v_ref,p_settings);
  RETURN jsonb_build_object('registered',true,'existing',false,'node_ref',v_ref);
END $$;

-- Strictly verify identity, current node, phase, stage, and stale-write version, all inside a single transaction.
CREATE OR REPLACE FUNCTION public.submit_evidence_judgment_r2(
 p_session_id uuid,p_participant_token text,p_node_ref text,p_phase text,p_payload jsonb,p_expected_version integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.classroom_sessions%ROWTYPE; v_participant uuid; v_node text;
 a jsonb; v_steps text[]; v_expected_phase text; v_kind text; v_choices jsonb; v_item jsonb; v_count integer; v_clean jsonb; v_version integer; v_old integer;
BEGIN
  SELECT * INTO s FROM public.classroom_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR s.status<>'active' THEN RAISE EXCEPTION 'Session 已關閉'; END IF;
  SELECT id INTO v_participant FROM public.session_participants WHERE session_id=p_session_id AND participant_token=p_participant_token LIMIT 1;
  IF v_participant IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
  IF s.activity_mode<>'evidence-judgment' THEN RAISE EXCEPTION 'activity mode does not match'; END IF;
  v_node:=CASE WHEN s.session_kind='course' THEN trim(coalesce(p_node_ref,'')) ELSE '' END;
  IF s.session_kind='course' AND v_node<>coalesce(s.current_node_ref,'') THEN RAISE EXCEPTION 'course node has changed'; END IF;
  IF s.session_kind='course' AND EXISTS (
    SELECT 1 FROM public.course_node_runtime_v2359
    WHERE session_id=p_session_id AND node_ref=v_node AND lifecycle='settled'
  ) THEN RAISE EXCEPTION 'course node already settled'; END IF;
  SELECT settings INTO a FROM public.evidence_judgment_nodes_r2 WHERE session_id=p_session_id AND node_ref=v_node;
  IF a IS NULL THEN RAISE EXCEPTION 'evidence activity not registered'; END IF;
  v_steps:=ARRAY[]::text[];
  IF coalesce((a->>'initialEnabled')::boolean,true) THEN v_steps:=array_append(v_steps,'initial'); END IF;
  v_steps:=array_append(v_steps,'evidence');
  IF coalesce((a->>'rejudgeEnabled')::boolean,true) THEN v_steps:=array_append(v_steps,'final'); END IF;
  IF s.current_stage<1 OR s.current_stage>array_length(v_steps,1) THEN RAISE EXCEPTION 'invalid teacher stage'; END IF;
  v_expected_phase:=v_steps[s.current_stage];
  IF p_phase IS DISTINCT FROM v_expected_phase THEN RAISE EXCEPTION '此階段尚未開放，請重新同步'; END IF;
  IF jsonb_typeof(p_payload)<>'object' OR length(p_payload::text)>12000 THEN RAISE EXCEPTION 'invalid judgment payload'; END IF;
  v_kind:=coalesce(a->>'responseMode','single');
  IF p_phase IN ('initial','final') OR (p_phase='evidence' AND coalesce((a->>'initialEnabled')::boolean,true)=false) THEN
    v_item:=CASE WHEN p_phase='evidence' THEN p_payload->'judgment' ELSE p_payload END;
    IF jsonb_typeof(v_item)<>'object' THEN RAISE EXCEPTION 'judgment required'; END IF;
    v_choices:=coalesce(v_item->'choices','[]'::jsonb);
    IF jsonb_typeof(v_choices)<>'array' THEN RAISE EXCEPTION 'invalid choices'; END IF;
    IF v_kind='open' THEN
      IF length(trim(coalesce(v_item->>'open','')))=0 OR length(coalesce(v_item->>'open',''))>1000 THEN RAISE EXCEPTION 'open judgment required'; END IF;
    ELSE
      v_count:=jsonb_array_length(v_choices);
      IF v_count<1 OR (v_kind='single' AND v_count<>1) OR v_count>20 THEN RAISE EXCEPTION 'invalid choice count'; END IF;
      IF (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(v_choices))<>v_count THEN RAISE EXCEPTION 'duplicate choices'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_choices) x WHERE NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(a->'options') o WHERE o->>'id'=x.value
      )) THEN RAISE EXCEPTION 'unknown choice'; END IF;
    END IF;
    IF coalesce((a->>'reasonRequired')::boolean,true) AND length(trim(coalesce(v_item->>'reason','')))=0 THEN
      RAISE EXCEPTION 'judgment reason required';
    END IF;
    IF length(coalesce(v_item->>'reason',''))>2000 THEN RAISE EXCEPTION 'reason too long'; END IF;
  END IF;
  IF p_phase='evidence' THEN
    IF coalesce((a->>'evidenceRequired')::boolean,true) AND (
      length(trim(coalesce(p_payload->>'quote','')))=0 OR length(trim(coalesce(p_payload->>'relation','')))=0
    ) THEN RAISE EXCEPTION 'evidence and relation required'; END IF;
    IF length(coalesce(p_payload->>'quote',''))>2000 OR length(coalesce(p_payload->>'relation',''))>2000 THEN
      RAISE EXCEPTION 'evidence too long'; END IF;
  END IF;
  -- Build an allow-listed payload; never store caller-supplied arbitrary nested fields.
  IF p_phase='evidence' THEN
    v_clean:=jsonb_build_object('quote',coalesce(p_payload->>'quote',''),'relation',coalesce(p_payload->>'relation',''));
    IF coalesce((a->>'initialEnabled')::boolean,true)=false THEN
      v_clean:=v_clean||jsonb_build_object('judgment',jsonb_build_object(
        'choices',coalesce(v_item->'choices','[]'::jsonb),'open',coalesce(v_item->>'open',''),'reason',coalesce(v_item->>'reason','')));
    END IF;
  ELSE
    v_clean:=jsonb_build_object('choices',coalesce(v_item->'choices','[]'::jsonb),
      'open',coalesce(v_item->>'open',''),'reason',coalesce(v_item->>'reason',''));
  END IF;
  SELECT version INTO v_old FROM public.evidence_judgment_responses_r2
   WHERE session_id=p_session_id AND node_ref=v_node AND participant_id=v_participant AND phase=p_phase FOR UPDATE;
  IF FOUND THEN
    IF coalesce(p_expected_version,-1)<>v_old THEN RAISE EXCEPTION '版本衝突，請重新載入已保存的答案'; END IF;
    UPDATE public.evidence_judgment_responses_r2 SET payload=v_clean,version=version+1,submitted_at=now()
    WHERE session_id=p_session_id AND node_ref=v_node AND participant_id=v_participant AND phase=p_phase RETURNING version INTO v_version;
  ELSE
    IF coalesce(p_expected_version,-1)<>0 THEN RAISE EXCEPTION '版本衝突，請重新載入已保存的答案'; END IF;
    INSERT INTO public.evidence_judgment_responses_r2(session_id,node_ref,participant_id,phase,payload)
    VALUES(p_session_id,v_node,v_participant,p_phase,v_clean) RETURNING version INTO v_version;
  END IF;
  RETURN jsonb_build_object('phase',p_phase,'version',v_version,'node_ref',v_node);
END $$;

CREATE OR REPLACE FUNCTION public.get_student_evidence_judgment_r2(
 p_session_id uuid,p_participant_token text,p_node_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.classroom_sessions%ROWTYPE; v_participant uuid; v_ref text; a jsonb; v_settled boolean;
BEGIN
  SELECT * INTO s FROM public.classroom_sessions WHERE id=p_session_id;
  SELECT id INTO v_participant FROM public.session_participants WHERE session_id=p_session_id AND participant_token=p_participant_token LIMIT 1;
  IF s.id IS NULL OR v_participant IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
  v_ref:=CASE WHEN s.session_kind='course' THEN coalesce(s.current_node_ref,'') ELSE '' END;
  IF s.session_kind='course' AND trim(coalesce(p_node_ref,''))<>v_ref THEN RAISE EXCEPTION 'course node has changed'; END IF;
  IF s.activity_mode<>'evidence-judgment' THEN RAISE EXCEPTION 'evidence judgment is not active'; END IF;
  SELECT settings INTO a FROM public.evidence_judgment_nodes_r2 WHERE session_id=p_session_id AND node_ref=v_ref;
  IF a IS NULL THEN RAISE EXCEPTION 'evidence activity not registered'; END IF;
  v_settled:=s.session_kind='course' AND EXISTS(SELECT 1 FROM public.course_node_runtime_v2359
    WHERE session_id=p_session_id AND node_ref=v_ref AND lifecycle='settled');
  RETURN jsonb_build_object('session_id',s.id,'node_ref',v_ref,'revision',s.revision,
    'current_stage',s.current_stage,'stage_count',s.stage_count,'status',s.status,'settled',v_settled,
    'responses',coalesce((SELECT jsonb_agg(jsonb_build_object('phase',r.phase,'payload',r.payload,'version',r.version,'submitted_at',r.submitted_at))
      FROM public.evidence_judgment_responses_r2 r
      WHERE r.session_id=s.id AND r.node_ref=v_ref AND r.participant_id=v_participant),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.get_teacher_evidence_judgment_r2(
 p_session_id uuid,p_teacher_token text,p_node_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.classroom_sessions%ROWTYPE; v_ref text;
BEGIN
  SELECT * INTO s FROM public.classroom_sessions WHERE id=p_session_id AND teacher_token=p_teacher_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid teacher token'; END IF;
  v_ref:=CASE WHEN s.session_kind='course' THEN coalesce(s.current_node_ref,'') ELSE '' END;
  IF s.session_kind='course' AND trim(coalesce(p_node_ref,''))<>v_ref THEN RAISE EXCEPTION 'course node has changed'; END IF;
  IF s.activity_mode<>'evidence-judgment' THEN RAISE EXCEPTION 'evidence judgment is not active'; END IF;
  RETURN jsonb_build_object('node_ref',v_ref,'current_stage',s.current_stage,'stage_count',s.stage_count,'revision',s.revision,
    'settings',(SELECT e.settings FROM public.evidence_judgment_nodes_r2 e WHERE e.session_id=s.id AND e.node_ref=v_ref),
    'settled',s.session_kind='course' AND EXISTS(SELECT 1 FROM public.course_node_runtime_v2359 WHERE session_id=s.id AND node_ref=v_ref AND lifecycle='settled'),
    'participant_count',(SELECT count(*) FROM public.session_participants p WHERE p.session_id=s.id),
    'responses',coalesce((SELECT jsonb_agg(jsonb_build_object('participant_id',r.participant_id,'phase',r.phase,'payload',r.payload,'version',r.version,'submitted_at',r.submitted_at))
      FROM public.evidence_judgment_responses_r2 r WHERE r.session_id=s.id AND r.node_ref=v_ref),'[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.register_evidence_judgment_node_r2(uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_evidence_judgment_r2(uuid,text,text,text,jsonb,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_evidence_judgment_r2(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_evidence_judgment_r2(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_evidence_judgment_node_r2(uuid,text,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_evidence_judgment_r2(uuid,text,text,text,jsonb,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_evidence_judgment_r2(uuid,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_evidence_judgment_r2(uuid,text,text) TO anon,authenticated;

-- =========== END [06/08] upgrade-evidence-judgment-r2.sql ===========

-- =========== [07/08] upgrade-evidence-judgment-r3.sql ===========
-- Original SHA-256: 254c4343a48218cb297c73b28b0e0ccceda94f85ccd694d99c5e55722c152fa9
-- Stage 3 R3: optional representative-led group evidence + consensus.
-- Additive migration; run after R2 on a BACKED-UP TEST Supabase project.
-- R2 individual initial/evidence/final rows remain unchanged.
CREATE TABLE IF NOT EXISTS public.evidence_judgment_group_submissions_r3 (
 session_id uuid NOT NULL REFERENCES public.classroom_sessions(id) ON DELETE CASCADE,
 node_ref text NOT NULL DEFAULT '',
 group_id uuid NOT NULL REFERENCES public.session_groups(id) ON DELETE CASCADE,
 payload jsonb NOT NULL,
 submitted_by uuid NOT NULL REFERENCES public.session_participants(id),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,node_ref,group_id),
 FOREIGN KEY(session_id,node_ref) REFERENCES public.evidence_judgment_nodes_r2(session_id,node_ref) ON DELETE CASCADE,
 CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX IF NOT EXISTS evidence_group_by_node_r3_idx
 ON public.evidence_judgment_group_submissions_r3(session_id,node_ref);
ALTER TABLE public.evidence_judgment_group_submissions_r3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evidence_judgment_group_submissions_r3 FROM PUBLIC,anon,authenticated;

-- Reassigning a group after it has saved evidence is destructive; block this at DB level.
-- An explicitly closed Session can still be removed by existing administrative cleanup.
CREATE OR REPLACE FUNCTION public.guard_evidence_group_deletion_r3()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.evidence_judgment_group_submissions_r3 r
   JOIN public.classroom_sessions s ON s.id=r.session_id
   WHERE r.group_id=OLD.id AND s.status='active') THEN
   RAISE EXCEPTION '已有小組證據成果，不可重新分組；請先保留歷史資料';
 END IF;
 -- Even without a group submission, reassigning after final individual judgments
 -- would retrospectively misrepresent the membership used for teacher comparisons.
 IF EXISTS (
   SELECT 1 FROM public.classroom_sessions s
   JOIN public.evidence_judgment_nodes_r2 e ON e.session_id=s.id AND e.node_ref=OLD.node_ref
   WHERE s.id=OLD.session_id AND s.status='active'
     AND coalesce((e.settings->>'groupEnabled')::boolean,false)
     AND EXISTS (SELECT 1 FROM public.evidence_judgment_responses_r2 r
       WHERE r.session_id=s.id AND r.node_ref=OLD.node_ref AND r.phase='final')
 ) THEN
   RAISE EXCEPTION '已有個人再判結果，不能重新分組以免改寫歷程對應';
 END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS guard_evidence_group_deletion_r3 ON public.session_groups;
CREATE TRIGGER guard_evidence_group_deletion_r3 BEFORE DELETE ON public.session_groups
 FOR EACH ROW EXECUTE FUNCTION public.guard_evidence_group_deletion_r3();

CREATE OR REPLACE FUNCTION public.get_student_evidence_group_r3(
 p_session_id uuid,p_participant_token text,p_node_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.classroom_sessions%ROWTYPE; v_pid uuid; v_ref text; v_gid uuid;
 v_label text; v_rep uuid; v_submission jsonb; v_settings jsonb; v_count integer;
BEGIN
 SELECT * INTO s FROM public.classroom_sessions WHERE id=p_session_id;
 SELECT id INTO v_pid FROM public.session_participants WHERE session_id=p_session_id AND participant_token=p_participant_token;
 IF s.id IS NULL OR v_pid IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
 IF s.activity_mode <> 'evidence-judgment' THEN RAISE EXCEPTION 'evidence judgment not active'; END IF;
 v_ref:=CASE WHEN s.session_kind='course' THEN coalesce(s.current_node_ref,'') ELSE '' END;
 IF s.session_kind='course' AND trim(coalesce(p_node_ref,''))<>v_ref THEN RAISE EXCEPTION 'course node has changed'; END IF;
 SELECT settings INTO v_settings FROM public.evidence_judgment_nodes_r2 WHERE session_id=s.id AND node_ref=v_ref;
 IF v_settings IS NULL OR coalesce((v_settings->>'groupEnabled')::boolean,false)=false THEN
   RETURN jsonb_build_object('enabled',false,'node_ref',v_ref,'revision',s.revision);
 END IF;
 SELECT g.id,g.label INTO v_gid,v_label
 FROM public.session_group_members gm JOIN public.session_groups g
   ON g.id=gm.group_id AND g.session_id=gm.session_id AND g.node_ref=gm.node_ref
 WHERE gm.session_id=s.id AND gm.node_ref=v_ref AND gm.participant_id=v_pid LIMIT 1;
 IF v_gid IS NULL THEN RETURN jsonb_build_object('enabled',true,'assigned',false,'node_ref',v_ref,'revision',s.revision); END IF;
 SELECT p.id INTO v_rep FROM public.session_group_members gm JOIN public.session_participants p ON p.id=gm.participant_id
 WHERE gm.session_id=s.id AND gm.node_ref=v_ref AND gm.group_id=v_gid
 ORDER BY p.joined_at,p.id LIMIT 1;
 SELECT count(*) INTO v_count FROM public.session_group_members WHERE session_id=s.id AND node_ref=v_ref AND group_id=v_gid;
 SELECT jsonb_build_object('payload',r.payload,'version',r.version,'submitted_at',r.submitted_at)
 INTO v_submission FROM public.evidence_judgment_group_submissions_r3 r
 WHERE r.session_id=s.id AND r.node_ref=v_ref AND r.group_id=v_gid;
 RETURN jsonb_build_object('enabled',true,'assigned',true,'group_id',v_gid,'label',v_label,
  'member_count',v_count,'is_representative',v_pid=v_rep,'submission',v_submission,
  'my_evidence_submitted',EXISTS(SELECT 1 FROM public.evidence_judgment_responses_r2 x
    WHERE x.session_id=s.id AND x.node_ref=v_ref AND x.participant_id=v_pid AND x.phase='evidence'),
  'current_stage',s.current_stage,'status',s.status,'node_ref',v_ref,'revision',s.revision,
  'settled',s.session_kind='course' AND EXISTS(SELECT 1 FROM public.course_node_runtime_v2359 n
    WHERE n.session_id=s.id AND n.node_ref=v_ref AND n.lifecycle='settled'));
END $$;

CREATE OR REPLACE FUNCTION public.submit_evidence_group_r3(
 p_session_id uuid,p_participant_token text,p_node_ref text,p_payload jsonb,p_expected_version integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.classroom_sessions%ROWTYPE; v_pid uuid; v_ref text; v_settings jsonb;
 v_group uuid; v_rep uuid; v_steps text[]:=ARRAY[]::text[]; v_phase text;
 v_item jsonb; v_choices jsonb; v_count integer; v_kind text;
 v_clean jsonb; v_old integer; v_version integer;
BEGIN
 SELECT * INTO s FROM public.classroom_sessions WHERE id=p_session_id FOR UPDATE;
 IF s.id IS NULL OR s.status<>'active' THEN RAISE EXCEPTION 'Session 已關閉'; END IF;
 SELECT id INTO v_pid FROM public.session_participants WHERE session_id=s.id AND participant_token=p_participant_token;
 IF v_pid IS NULL THEN RAISE EXCEPTION 'invalid participant token'; END IF;
 IF s.activity_mode<>'evidence-judgment' THEN RAISE EXCEPTION 'incorrect activity mode'; END IF;
 v_ref:=CASE WHEN s.session_kind='course' THEN coalesce(s.current_node_ref,'') ELSE '' END;
 IF s.session_kind='course' AND trim(coalesce(p_node_ref,''))<>v_ref THEN RAISE EXCEPTION 'course node has changed'; END IF;
 IF s.session_kind='course' AND EXISTS(SELECT 1 FROM public.course_node_runtime_v2359
    WHERE session_id=s.id AND node_ref=v_ref AND lifecycle='settled') THEN RAISE EXCEPTION 'course node already settled'; END IF;
 SELECT settings INTO v_settings FROM public.evidence_judgment_nodes_r2 WHERE session_id=s.id AND node_ref=v_ref;
 IF v_settings IS NULL OR NOT coalesce((v_settings->>'groupEnabled')::boolean,false) THEN RAISE EXCEPTION 'group evidence not enabled'; END IF;
 IF coalesce((v_settings->>'initialEnabled')::boolean,true) THEN v_steps:=array_append(v_steps,'initial'); END IF;
 v_steps:=array_append(v_steps,'evidence');
 IF coalesce((v_settings->>'rejudgeEnabled')::boolean,true) THEN v_steps:=array_append(v_steps,'final'); END IF;
 IF s.current_stage<1 OR s.current_stage>array_length(v_steps,1) THEN RAISE EXCEPTION 'invalid teacher stage'; END IF;
 v_phase:=v_steps[s.current_stage];
 IF v_phase<>'evidence' THEN RAISE EXCEPTION 'group discussion stage is closed'; END IF;
 SELECT gm.group_id INTO v_group FROM public.session_group_members gm JOIN public.session_groups g
  ON g.id=gm.group_id AND g.session_id=gm.session_id AND g.node_ref=gm.node_ref
  WHERE gm.session_id=s.id AND gm.node_ref=v_ref AND gm.participant_id=v_pid LIMIT 1;
 IF v_group IS NULL THEN RAISE EXCEPTION 'participant is not assigned to a group'; END IF;
 SELECT p.id INTO v_rep FROM public.session_group_members gm JOIN public.session_participants p ON p.id=gm.participant_id
  WHERE gm.session_id=s.id AND gm.node_ref=v_ref AND gm.group_id=v_group
  ORDER BY p.joined_at,p.id LIMIT 1;
 IF v_pid IS DISTINCT FROM v_rep THEN RAISE EXCEPTION 'only group representative can submit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.evidence_judgment_responses_r2 r
  WHERE r.session_id=s.id AND r.node_ref=v_ref AND r.participant_id=v_pid AND r.phase='evidence') THEN
  RAISE EXCEPTION '請先完成個人證據提交'; END IF;
 IF jsonb_typeof(p_payload)<>'object' OR length(p_payload::text)>12000 THEN RAISE EXCEPTION 'invalid group payload'; END IF;
 v_item:=p_payload->'judgment';
 IF jsonb_typeof(v_item)<>'object' THEN RAISE EXCEPTION 'group judgment required'; END IF;
 v_kind:=coalesce(v_settings->>'responseMode','single');
 v_choices:=coalesce(v_item->'choices','[]'::jsonb);
 IF jsonb_typeof(v_choices)<>'array' THEN RAISE EXCEPTION 'invalid group choices'; END IF;
 IF v_kind='open' THEN
  IF length(trim(coalesce(v_item->>'open','')))=0 OR length(coalesce(v_item->>'open',''))>1000 THEN RAISE EXCEPTION 'group open judgment required'; END IF;
 ELSE
  v_count:=jsonb_array_length(v_choices);
  IF v_count<1 OR (v_kind='single' AND v_count<>1) OR v_count>20 THEN RAISE EXCEPTION 'invalid group choice count'; END IF;
  IF (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(v_choices))<>v_count THEN RAISE EXCEPTION 'duplicate group choices'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_choices) x WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_settings->'options') o WHERE o->>'id'=x.value)) THEN RAISE EXCEPTION 'unknown group choice'; END IF;
 END IF;
 IF coalesce((v_settings->>'reasonRequired')::boolean,true) AND length(trim(coalesce(v_item->>'reason','')))=0 THEN RAISE EXCEPTION 'group reason required'; END IF;
 IF length(coalesce(v_item->>'reason',''))>2000 THEN RAISE EXCEPTION 'group reason too long'; END IF;
 IF coalesce((v_settings->>'evidenceRequired')::boolean,true) AND
    (length(trim(coalesce(p_payload->>'quote','')))=0 OR length(trim(coalesce(p_payload->>'relation','')))=0) THEN
    RAISE EXCEPTION 'group evidence and relation required'; END IF;
 IF length(coalesce(p_payload->>'quote',''))>2000 OR length(coalesce(p_payload->>'relation',''))>2000 OR
    length(coalesce(p_payload->>'discussion',''))>2000 THEN RAISE EXCEPTION 'group evidence too long'; END IF;
 v_clean:=jsonb_build_object('judgment',jsonb_build_object('choices',v_choices,'open',coalesce(v_item->>'open',''),
  'reason',coalesce(v_item->>'reason','')),'quote',coalesce(p_payload->>'quote',''),
  'relation',coalesce(p_payload->>'relation',''),'discussion',coalesce(p_payload->>'discussion',''));
 SELECT version INTO v_old FROM public.evidence_judgment_group_submissions_r3
 WHERE session_id=s.id AND node_ref=v_ref AND group_id=v_group FOR UPDATE;
 IF FOUND THEN
  IF coalesce(p_expected_version,-1)<>v_old THEN RAISE EXCEPTION '小組版本衝突，請確認雲端成果後重新編輯'; END IF;
  UPDATE public.evidence_judgment_group_submissions_r3
    SET payload=v_clean,version=version+1,submitted_at=now(),submitted_by=v_pid
    WHERE session_id=s.id AND node_ref=v_ref AND group_id=v_group RETURNING version INTO v_version;
 ELSE
  IF coalesce(p_expected_version,-1)<>0 THEN RAISE EXCEPTION '小組版本衝突，請確認雲端成果後重新編輯'; END IF;
  INSERT INTO public.evidence_judgment_group_submissions_r3(session_id,node_ref,group_id,payload,submitted_by)
   VALUES(s.id,v_ref,v_group,v_clean,v_pid) RETURNING version INTO v_version;
 END IF;
 RETURN jsonb_build_object('node_ref',v_ref,'group_id',v_group,'version',v_version);
END $$;

CREATE OR REPLACE FUNCTION public.get_teacher_evidence_groups_r3(
 p_session_id uuid,p_teacher_token text,p_node_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.classroom_sessions%ROWTYPE; v_ref text; v_settings jsonb;
BEGIN
 SELECT * INTO s FROM public.classroom_sessions WHERE id=p_session_id AND teacher_token=p_teacher_token;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid teacher token'; END IF;
 IF s.activity_mode<>'evidence-judgment' THEN RAISE EXCEPTION 'evidence judgment is not active'; END IF;
 v_ref:=CASE WHEN s.session_kind='course' THEN coalesce(s.current_node_ref,'') ELSE '' END;
 IF s.session_kind='course' AND trim(coalesce(p_node_ref,''))<>v_ref THEN RAISE EXCEPTION 'course node has changed'; END IF;
 SELECT settings INTO v_settings FROM public.evidence_judgment_nodes_r2 WHERE session_id=s.id AND node_ref=v_ref;
 RETURN jsonb_build_object('enabled',coalesce((v_settings->>'groupEnabled')::boolean,false),
  'node_ref',v_ref,'revision',s.revision,
  'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'member_count',
    (SELECT count(*) FROM public.session_group_members gm WHERE gm.session_id=s.id AND gm.node_ref=v_ref AND gm.group_id=g.id),
    'member_ids',coalesce((SELECT jsonb_agg(gm.participant_id) FROM public.session_group_members gm WHERE gm.session_id=s.id AND gm.node_ref=v_ref AND gm.group_id=g.id),'[]'::jsonb),
    'submission',CASE WHEN r.version IS NULL THEN NULL ELSE jsonb_build_object(
      'payload',r.payload,'version',r.version,'submitted_at',r.submitted_at) END) ORDER BY g.group_index)
    FROM public.session_groups g LEFT JOIN public.evidence_judgment_group_submissions_r3 r
       ON r.group_id=g.id AND r.session_id=s.id AND r.node_ref=v_ref
    WHERE g.session_id=s.id AND g.node_ref=v_ref),'[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.get_student_evidence_group_r3(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_evidence_group_r3(uuid,text,text,jsonb,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_teacher_evidence_groups_r3(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_evidence_group_r3(uuid,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_evidence_group_r3(uuid,text,text,jsonb,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_evidence_groups_r3(uuid,text,text) TO anon,authenticated;

-- =========== END [07/08] upgrade-evidence-judgment-r3.sql ===========

-- =========== [08/08] upgrade-evidence-judgment-r4.sql ===========
-- Original SHA-256: df2855fc5deb060fc893fec88d0ee0054ee729a983aa13c960b23fc5b4a60806
-- Stage 3 R4: prevent destructive reassignment of evidence-group membership.
-- Additive migration. Apply AFTER R2 + R3 on a backed-up TEST Supabase project.
-- Does not delete or rewrite any historical Session, Node, or response rows.
CREATE OR REPLACE FUNCTION public.guard_evidence_group_member_change_r4()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  -- Allow non-identity metadata changes; only identity/group reassignment is guarded.
  IF TG_OP='UPDATE' THEN
    IF NEW.session_id IS NOT DISTINCT FROM OLD.session_id AND
       NEW.node_ref IS NOT DISTINCT FROM OLD.node_ref AND
       NEW.group_id IS NOT DISTINCT FROM OLD.group_id AND
       NEW.participant_id IS NOT DISTINCT FROM OLD.participant_id THEN
      RETURN NEW;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.classroom_sessions s
    JOIN public.evidence_judgment_nodes_r2 n
      ON n.session_id=s.id AND n.node_ref=OLD.node_ref
    WHERE s.id=OLD.session_id AND s.status='active'
      AND coalesce((n.settings->>'groupEnabled')::boolean,false)
      AND (
        EXISTS (SELECT 1 FROM public.evidence_judgment_group_submissions_r3 g
          WHERE g.session_id=OLD.session_id AND g.node_ref=OLD.node_ref AND g.group_id=OLD.group_id)
        OR EXISTS (SELECT 1 FROM public.evidence_judgment_responses_r2 r
          WHERE r.session_id=OLD.session_id AND r.node_ref=OLD.node_ref AND r.phase='final')
      )
  ) THEN
    RAISE EXCEPTION '已有小組成果或個人再判，不能變更原分組成員，請保留歷史資料';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_evidence_group_member_change_r4 ON public.session_group_members;
CREATE TRIGGER guard_evidence_group_member_change_r4
BEFORE UPDATE OR DELETE ON public.session_group_members
FOR EACH ROW EXECUTE FUNCTION public.guard_evidence_group_member_change_r4();
REVOKE ALL ON FUNCTION public.guard_evidence_group_member_change_r4() FROM PUBLIC;

-- =========== END [08/08] upgrade-evidence-judgment-r4.sql ===========

-- All eight original upgrade bodies succeeded in this transaction.
-- PostgREST notifications made by original migrations are delivered on commit.

-- ================ SEC-001 / in-same-transaction ACL FIX ================
-- Important: SEC-001 must complete BEFORE the initial Stage 2/3 DDL is committed.
-- If permissions or callers do not match, entire upgrade (all eight migrations) rolls back.
DO $preflight$
DECLARE
  v_helper oid := to_regprocedure('public.classification_active_course_activity(uuid,text)');
  v_name text;
  v_caller record;
  v_expected text[] := ARRAY[
    'get_classification_course_student_activity',
    'get_classification_course_individual',
    'classification_response_guard',
    'submit_classification_course_individual',
    'classification_group_revision_guard',
    'submit_classification_group_board'
  ];
BEGIN
  IF v_helper IS NULL THEN
    RAISE EXCEPTION 'SEC-001 preflight: target helper not found';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_helper) THEN
    RAISE EXCEPTION 'SEC-001 preflight: target helper is not SECURITY DEFINER';
  END IF;
  -- Never change grants if an unexpected implementation is installed.
  IF NOT EXISTS(
    SELECT 1 FROM pg_proc p WHERE p.oid=v_helper
      AND p.prosrc LIKE '%course_node_runtime_v2359%'
      AND p.prosrc LIKE '%classification_course_nodes%'
  ) THEN
    RAISE EXCEPTION 'SEC-001 preflight: target helper body differs; inspect manually';
  END IF;
  FOREACH v_name IN ARRAY v_expected LOOP
    SELECT p.oid,p.proowner,p.prosecdef,p.proname INTO v_caller
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND p.proname=v_name
      AND p.prosrc LIKE '%classification_active_course_activity%'
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SEC-001 preflight: expected caller % not found',v_name;
    END IF;
    IF NOT v_caller.prosecdef THEN
      RAISE EXCEPTION 'SEC-001 preflight: caller % is not SECURITY DEFINER',v_name;
    END IF;
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.oid<>v_helper
      AND p.prosrc LIKE '%classification_active_course_activity%'
      AND p.proname <> ALL(v_expected)
  ) THEN
    RAISE EXCEPTION 'SEC-001 preflight: unexpected helper callers exist; inspect first';
  END IF;
END;
$preflight$;

-- IMPORTANT: PUBLIC revocation alone was insufficient in the existing DB.
REVOKE ALL ON FUNCTION public.classification_active_course_activity(uuid,text)
  FROM PUBLIC, anon, authenticated;

DO $postcheck$
DECLARE
  v_helper oid := to_regprocedure('public.classification_active_course_activity(uuid,text)');
  v_name text;
  v_caller record;
  v_expected text[] := ARRAY[
    'get_classification_course_student_activity',
    'get_classification_course_individual',
    'classification_response_guard',
    'submit_classification_course_individual',
    'classification_group_revision_guard',
    'submit_classification_group_board'
  ];
BEGIN
  IF has_function_privilege('anon',v_helper,'EXECUTE')
    OR has_function_privilege('authenticated',v_helper,'EXECUTE') THEN
    RAISE EXCEPTION 'SEC-001 postcheck: anon/authenticated can still EXECUTE; rollback';
  END IF;
  FOREACH v_name IN ARRAY v_expected LOOP
    SELECT p.oid,p.proowner,p.prosecdef INTO v_caller FROM pg_proc p
      WHERE p.pronamespace='public'::regnamespace
        AND p.proname=v_name
        AND p.prosrc LIKE '%classification_active_course_activity%'
      LIMIT 1;
    IF NOT FOUND OR NOT v_caller.prosecdef
      OR NOT has_function_privilege(pg_get_userbyid(v_caller.proowner),v_helper,'EXECUTE') THEN
      RAISE EXCEPTION 'SEC-001 postcheck: caller % lost internal helper access; rollback',v_name;
    END IF;
  END LOOP;
END;
$postcheck$;


-- ================ ATOMIC STRUCTURE END-CHECK ================
DO $ci_v101_endcheck$
DECLARE n text;
BEGIN
  FOREACH n IN ARRAY ARRAY[
     'classification_group_boards','classification_course_nodes',
     'classification_course_publications','evidence_judgment_nodes_r2',
     'evidence_judgment_responses_r2','evidence_judgment_group_submissions_r3'
  ] LOOP
    IF to_regclass(format('public.%I',n)) IS NULL THEN
      RAISE EXCEPTION 'Upgrade must roll back: expected new table % missing',n;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_proc
      WHERE oid=to_regprocedure('public.classification_active_course_activity(uuid,text)')) THEN
    RAISE EXCEPTION 'Upgrade must roll back: critical internal helper absent';
  END IF;
END;
$ci_v101_endcheck$;
-- Notify PostgREST of function grants and signatures only when commit succeeds.
NOTIFY pgrst, 'reload schema';
COMMIT;
