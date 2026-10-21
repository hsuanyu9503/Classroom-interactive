-- Classroom Interactive: PRODUCTION v2.36.1 -> v1.0.1 PRE-FLIGHT (READ ONLY)
-- NO CREATE / DROP / UPDATE / GRANT. Verify this points at the correct project.
-- PASS = structural indicator, not proof of precise version or functional security.
WITH
base_tables(name) AS (VALUES
 ('classroom_sessions'),('session_participants'),('student_responses'),
 ('session_groups'),('session_group_members'),('course_node_runtime_v2359'),
 ('course_session_progress'),('course_private_nodes')
),
base_columns(tbl,col) AS (VALUES
 ('classroom_sessions','session_kind'),('classroom_sessions','current_node_ref'),
 ('student_responses','node_ref'),('session_groups','node_ref'),
 ('session_group_members','node_ref'),('course_node_runtime_v2359','lifecycle')
),
base_rpcs(sig) AS (VALUES
 ('public.get_course_node_runtime_v2359(uuid,text)'),
 ('public.set_course_session_node_v2350(uuid,text,text,text,integer)'),
 ('public.get_student_session_state(uuid,text)'),
 ('public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb,text)')
),
new_tables(name) AS (VALUES
 ('classification_group_boards'),('classification_course_nodes'),
 ('classification_course_publications'),('evidence_judgment_nodes_r2'),
 ('evidence_judgment_responses_r2'),('evidence_judgment_group_submissions_r3')
),
new_funcs(name) AS (VALUES
 ('classification_validate_board'),('classification_active_course_activity'),
 ('register_classification_course_node'),('get_classification_course_published'),
 ('register_evidence_judgment_node_r2'),('submit_evidence_group_r3'),
 ('guard_evidence_group_member_change_r4')
),
checks AS (
 SELECT 'BASE_TABLE'::text AS category, 'public.'||name AS item,
   CASE WHEN to_regclass(format('public.%I',name)) IS NULL THEN 'BLOCK_MISSING' ELSE 'PASS' END AS state,
   'Must be present in the existing v2.36.1 database'::text AS note
 FROM base_tables
 UNION ALL
 SELECT 'BASE_COLUMN', 'public.'||tbl||'.'||col,
   CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=tbl AND column_name=col)
      THEN 'PASS' ELSE 'BLOCK_MISSING' END,
   'Expected v2.36.1 structural indicator'
 FROM base_columns
 UNION ALL
 SELECT 'BASE_RPC',sig,
   CASE WHEN to_regprocedure(sig) IS NULL THEN 'BLOCK_MISSING' ELSE 'PASS' END,
   'Signature should exist before migration'
 FROM base_rpcs
 UNION ALL
 SELECT 'NO_STAGE2_3_TABLE','public.'||name,
   CASE WHEN to_regclass(format('public.%I',name)) IS NULL THEN 'PASS' ELSE 'BLOCK_ALREADY_INSTALLED' END,
   'New tables must NOT exist before this one-time upgrade'
 FROM new_tables
 UNION ALL
 SELECT 'NO_STAGE2_3_FUNC','public.'||name,
   CASE WHEN EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=name) THEN 'BLOCK_ALREADY_INSTALLED' ELSE 'PASS' END,
   'New RPC/helper must NOT exist before this one-time upgrade'
 FROM new_funcs
 UNION ALL
 SELECT 'PUBLIC_SCHEMA_CREATE','anon / authenticated',
   CASE WHEN has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE')
        THEN 'BLOCK_REVIEW' ELSE 'PASS' END,
   'A writable public schema undermines SECURITY DEFINER search_path=public'
 UNION ALL
 SELECT 'BASE_TABLE_RLS','public.'||t.name,
   CASE WHEN c.oid IS NULL THEN 'BLOCK_MISSING'
        WHEN NOT c.relrowsecurity THEN 'BLOCK_RLS_DISABLED'
        ELSE 'PASS' END,
   'Base tables should have RLS enabled'
 FROM base_tables t LEFT JOIN pg_class c ON c.oid=to_regclass(format('public.%I',t.name))
)
SELECT category AS 類別,item AS 物件,state AS 狀態,note AS 備註
FROM checks ORDER BY category,item;
-- Proceed only when EVERY row says PASS. If any BLOCK, STOP; do not bypass migration guards.
