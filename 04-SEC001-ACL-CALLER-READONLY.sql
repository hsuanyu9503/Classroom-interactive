-- CI v1.0.1 SEC-001: READ ONLY verification after ACL patch.
-- All rows must be PASS_STATIC before proceeding to real frontend tests.
WITH target AS (
 SELECT to_regprocedure('public.classification_active_course_activity(uuid,text)') AS oid
), h AS (
 SELECT p.oid,p.prosecdef,p.proowner,p.proacl FROM pg_proc p JOIN target t ON t.oid=p.oid
), expected(name) AS (VALUES
 ('get_classification_course_student_activity'),
 ('get_classification_course_individual'),
 ('classification_response_guard'),
 ('submit_classification_course_individual'),
 ('classification_group_revision_guard'),
 ('submit_classification_group_board')
), results AS (
SELECT 1 sort,'target SECURITY DEFINER' AS check_name,
 CASE WHEN EXISTS(SELECT 1 FROM h WHERE prosecdef) THEN 'PASS_STATIC' ELSE 'FAIL' END verdict,
 'helper signature exists with SECURITY DEFINER' detail
UNION ALL SELECT 2,'anon direct EXECUTE denied',
 CASE WHEN EXISTS(SELECT 1 FROM h)
  AND NOT has_function_privilege('anon',(SELECT oid FROM h),'EXECUTE')
  THEN 'PASS_STATIC' ELSE 'FAIL' END,'effective permissions'
UNION ALL SELECT 3,'authenticated direct EXECUTE denied',
 CASE WHEN EXISTS(SELECT 1 FROM h)
  AND NOT has_function_privilege('authenticated',(SELECT oid FROM h),'EXECUTE')
  THEN 'PASS_STATIC' ELSE 'FAIL' END,'effective permissions'
UNION ALL SELECT 4,'PUBLIC direct EXECUTE denied',
 CASE WHEN EXISTS(SELECT 1 FROM h) AND NOT EXISTS(
   SELECT 1 FROM h,LATERAL aclexplode(coalesce(h.proacl,acldefault('f',h.proowner))) a
    WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
  ) THEN 'PASS_STATIC' ELSE 'FAIL' END,'acl grants'
UNION ALL SELECT 5,'internal caller / '||e.name,
 CASE WHEN count(p.oid)=1 AND bool_and(p.prosecdef AND
   has_function_privilege(pg_get_userbyid(p.proowner),(SELECT oid FROM h),'EXECUTE'))
   THEN 'PASS_STATIC' ELSE 'FAIL' END,
 COALESCE(string_agg(p.oid::regprocedure::text,', '),'(missing)')
 FROM expected e LEFT JOIN pg_proc p ON p.pronamespace='public'::regnamespace
  AND p.proname=e.name AND p.prosrc LIKE '%classification_active_course_activity%'
 GROUP BY e.name
)
SELECT check_name AS 檢查項目,verdict AS 結果,detail AS 系統目錄證據 FROM results ORDER BY sort,check_name;
-- Must additionally verify real API calls (valid and invalid participant tokens),
-- group submission, teacher publication and Course Node switching in STAGING.
