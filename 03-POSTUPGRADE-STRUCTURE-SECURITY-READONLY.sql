-- Classroom Interactive v1.0.1 post-upgrade STATIC security & schema acceptance (READ ONLY)
-- All PASS is necessary but NOT sufficient: also check counts, browser app behavior and token isolation.
-- Note: SECURITY DEFINER search_path=public requires public schema not writable by browser roles.
WITH
new_tables(name) AS (VALUES
 ('classification_group_boards'),
 ('classification_course_nodes'),
 ('classification_course_publications'),
 ('evidence_judgment_nodes_r2'),
 ('evidence_judgment_responses_r2'),
 ('evidence_judgment_group_submissions_r3')
),
new_rpcs(sig) AS (VALUES
 ('public.submit_classification_individual(uuid,text,jsonb)'),
 ('public.get_classification_group_state(uuid,text,text)'),
 ('public.submit_classification_group_board(uuid,text,text,bigint,jsonb)'),
 ('public.get_classification_teacher_boards(uuid,text,text)'),
 ('public.get_classification_individual_board(uuid,text)'),
 ('public.get_classification_teacher_activity(uuid,text)'),
 ('public.register_classification_course_node(uuid,text,text,jsonb)'),
 ('public.get_classification_course_student_activity(uuid,text,text)'),
 ('public.get_classification_course_individual(uuid,text,text)'),
 ('public.submit_classification_course_individual(uuid,text,text,jsonb)'),
 ('public.set_classification_course_publication(uuid,text,text,boolean,bigint)'),
 ('public.get_classification_course_teacher_publication(uuid,text,text)'),
 ('public.get_classification_course_published(uuid,text,text)'),
 ('public.register_evidence_judgment_node_r2(uuid,text,text,jsonb)'),
 ('public.submit_evidence_judgment_r2(uuid,text,text,text,jsonb,integer)'),
 ('public.get_student_evidence_judgment_r2(uuid,text,text)'),
 ('public.get_teacher_evidence_judgment_r2(uuid,text,text)'),
 ('public.get_student_evidence_group_r3(uuid,text,text)'),
 ('public.submit_evidence_group_r3(uuid,text,text,jsonb,integer)'),
 ('public.get_teacher_evidence_groups_r3(uuid,text,text)')
),
new_triggers(tab,trig) AS (VALUES
 ('student_responses','classification_response_validate'),
 ('classification_group_boards','classification_group_revision_guard'),
 ('session_groups','classification_preserve_submitted_group'),
 ('session_groups','guard_evidence_group_deletion_r3'),
 ('session_group_members','guard_evidence_group_member_change_r4')
),
checks AS (
 SELECT 'NEW_TABLE_RLS_ACL'::text AS category,'public.'||t.name AS object_name,
 CASE WHEN c.oid IS NULL THEN 'FAIL_MISSING'
      WHEN NOT c.relrowsecurity THEN 'FAIL_RLS_OFF'
      WHEN has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('anon',c.oid,'INSERT')
        OR has_table_privilege('anon',c.oid,'UPDATE') OR has_table_privilege('anon',c.oid,'DELETE')
        OR has_table_privilege('authenticated',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'INSERT')
        OR has_table_privilege('authenticated',c.oid,'UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE')
        THEN 'FAIL_BROWSER_TABLE_ACCESS'
      ELSE 'PASS' END AS status,
      CASE WHEN c.oid IS NULL THEN 'table missing'
           ELSE 'RLS='||c.relrowsecurity::text END AS info
 FROM new_tables t LEFT JOIN pg_class c ON c.oid=to_regclass(format('public.%I',t.name))
 UNION ALL
 SELECT 'MAIN_RPC',r.sig,
   CASE WHEN p.oid IS NULL THEN 'FAIL_MISSING'
        WHEN NOT p.prosecdef THEN 'FAIL_NOT_DEFINER'
        WHEN NOT has_function_privilege('anon',p.oid,'EXECUTE')
          OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
           THEN 'FAIL_BROWSER_RPC_DENIED'
        WHEN NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%')
           THEN 'FAIL_NO_SEARCH_PATH'
        ELSE 'PASS' END,
   coalesce(array_to_string(p.proconfig,','),'(no options)')
 FROM new_rpcs r LEFT JOIN pg_proc p ON p.oid=to_regprocedure(r.sig)
 UNION ALL
 SELECT 'CRITICAL_TRIGGER','public.'||t.tab||'.'||t.trig,
   CASE WHEN tr.oid IS NULL THEN 'FAIL_MISSING'
        WHEN tr.tgenabled NOT IN ('O','A') THEN 'FAIL_DISABLED'
        ELSE 'PASS' END,
   'state='||coalesce(tr.tgenabled::text,'missing')
 FROM new_triggers t LEFT JOIN pg_class c ON c.oid=to_regclass(format('public.%I',t.tab))
 LEFT JOIN pg_trigger tr ON tr.tgrelid=c.oid AND tr.tgname=t.trig
 UNION ALL
 SELECT 'SEC001_HELPER','public.classification_active_course_activity(uuid,text)',
   CASE WHEN p.oid IS NULL THEN 'FAIL_MISSING'
        WHEN NOT p.prosecdef THEN 'FAIL_NOT_DEFINER'
        WHEN has_function_privilege('anon',p.oid,'EXECUTE')
          OR has_function_privilege('authenticated',p.oid,'EXECUTE') THEN 'FAIL_DIRECT_EXECUTE'
        ELSE 'PASS' END,
   'owner='||coalesce(pg_get_userbyid(p.proowner),'(missing)')
 FROM (SELECT to_regprocedure('public.classification_active_course_activity(uuid,text)') oid) t
 LEFT JOIN pg_proc p ON p.oid=t.oid
 UNION ALL
 SELECT 'PUBLIC_SCHEMA','public CREATE permission',
   CASE WHEN has_schema_privilege('anon','public','CREATE')
          OR has_schema_privilege('authenticated','public','CREATE') THEN 'FAIL_BROWSER_CAN_CREATE'
        ELSE 'PASS' END,
   'anon/authenticated must not CREATE objects in public'
 UNION ALL
 SELECT 'BASE_VERSION_REFERENCE','public.get_course_node_runtime_v2359(uuid,text)',
   CASE WHEN to_regprocedure('public.get_course_node_runtime_v2359(uuid,text)') IS NULL
         THEN 'FAIL_MISSING' ELSE 'PASS' END,
   'Must remain after additive upgrade'
)
SELECT category AS 類別,object_name AS 物件,status AS 結果,info AS 說明
FROM checks ORDER BY category,object_name;
-- Important: this does NOT test authorization of each RPC with invalid student/teacher tokens.
