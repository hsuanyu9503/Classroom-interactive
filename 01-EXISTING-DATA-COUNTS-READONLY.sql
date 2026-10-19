-- Run in PRODUCTION BEFORE AND AFTER migration; export both results to CSV.
-- READ ONLY: exact row counts, no actual teacher/student data or tokens are returned.
-- During freeze window, row counts must remain the same for these existing v2.36.1 tables.
-- If a table does not exist, query will error; diagnose environment before proceeding.
SELECT dataset, row_count FROM (
 SELECT 'classroom_sessions'::text AS dataset, COUNT(*)::bigint AS row_count FROM public.classroom_sessions
UNION ALL
 SELECT 'session_participants'::text AS dataset, COUNT(*)::bigint AS row_count FROM public.session_participants
UNION ALL
 SELECT 'student_responses'::text AS dataset, COUNT(*)::bigint AS row_count FROM public.student_responses
UNION ALL
 SELECT 'session_groups'::text AS dataset, COUNT(*)::bigint AS row_count FROM public.session_groups
UNION ALL
 SELECT 'session_group_members'::text AS dataset, COUNT(*)::bigint AS row_count FROM public.session_group_members
UNION ALL
 SELECT 'group_consensus_submissions'::text AS dataset, COUNT(*)::bigint AS row_count FROM public.group_consensus_submissions
UNION ALL
 SELECT 'course_private_nodes'::text AS dataset, COUNT(*)::bigint AS row_count FROM public.course_private_nodes
UNION ALL
 SELECT 'course_node_runtime_v2359'::text AS dataset, COUNT(*)::bigint AS row_count FROM public.course_node_runtime_v2359
UNION ALL
 SELECT 'live_stance_events'::text AS dataset, COUNT(*)::bigint AS row_count FROM public.live_stance_events
UNION ALL
 SELECT 'live_stance_checkpoints'::text AS dataset, COUNT(*)::bigint AS row_count FROM public.live_stance_checkpoints
) AS counts ORDER BY dataset;
