-- V2.35.13 DIAGNOSIS — READ ONLY (no participant answers or names are returned)
-- 1) Confirm the RPC exists and its source includes per-layer rr.
WITH fn AS (
 SELECT to_regprocedure('public.submit_classroom_response(uuid,text,integer,text,text,jsonb,text,jsonb,text)') AS f
)
SELECT f::text AS response_function,
  CASE WHEN f IS NULL THEN 'MISSING'
       WHEN position('v_deliberation_data->''l''->(v_requested_stage-1)->''rr''' in pg_get_functiondef(f)) > 0
         THEN 'PER_LAYER_RR_SUPPORTED'
       ELSE 'LEGACY_OR_OTHER_IMPLEMENTATION' END AS implementation
FROM fn;

-- 2) Current active layered-deliberation session snapshots only.
--    The per-layer rule is kept in the Session snapshot, not looked up from the edited draft.
SELECT s.id AS session_id, s.session_kind, s.current_node_ref,
       s.current_stage,
       s.deliberation_data->'req'->>'reason' AS shared_reason_required,
       s.deliberation_data->'l'->(s.current_stage-1)->>'rr' AS current_layer_override,
       CASE
         WHEN jsonb_typeof(s.deliberation_data->'l'->(s.current_stage-1)->'rr')='boolean'
           THEN (s.deliberation_data->'l'->(s.current_stage-1)->>'rr')::boolean
         ELSE coalesce((s.deliberation_data->'req'->>'reason')::boolean,true)
       END AS cloud_reason_required,
       s.deliberation_data->'l'->1->>'rr' AS second_layer_override
FROM public.classroom_sessions s
WHERE s.status='active' AND s.activity_mode='layered-deliberation'
ORDER BY s.created_at DESC
LIMIT 20;
