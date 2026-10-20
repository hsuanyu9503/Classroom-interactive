-- Classroom Interactive V2.35.6
-- 修正同一 Course Session 在不同活動節點重複使用同一種題型時，
-- 舊版 4 欄唯一限制阻擋第二個 node_ref 的作答。
-- 可在既有資料庫上重複執行，不刪除任何 student_responses 資料。
-- 請先完成 V2.35.0 Course 全模組 SQL 升級，再執行此檔。

BEGIN;

ALTER TABLE public.student_responses
  ADD COLUMN IF NOT EXISTS node_ref text;

-- 先確保已存在五維唯一鍵（如果 V2.1 已建好則不重複新增索引），
-- 確認現有作答沒有相同節點重複資料後，才移除舊限制。
-- 以 coalesce 處理早期獨立活動 node_ref 為 NULL 的相容情況。
CREATE UNIQUE INDEX IF NOT EXISTS student_responses_v21_unique
ON public.student_responses (
  session_id,
  participant_id,
  (COALESCE(node_ref, '')),
  task_index,
  stage_key
);

-- 清除任何只包含「Session、學生、題號、階段」的舊唯一約束。
-- 不影響主鍵、其他獨立活動索引，以及已升級成含 node_ref 的唯一索引。
DO $fix$
DECLARE legacy record;
BEGIN
  FOR legacy IN
    SELECT c.conname
    FROM pg_constraint AS c
    WHERE c.conrelid = 'public.student_responses'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY keys.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS keys(attnum, ord)
        JOIN pg_attribute AS a
          ON a.attrelid = c.conrelid AND a.attnum = keys.attnum
      ) = ARRAY['session_id','participant_id','task_index','stage_key']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.student_responses DROP CONSTRAINT %I', legacy.conname);
  END LOOP;
END;
$fix$;

-- 極少數舊環境可能用獨立 unique index，而非 table constraint。
-- 同樣只針對「原本 4 欄且無條件」的舊索引，保留其他索引。
DO $fix$
DECLARE legacy record;
BEGIN
  FOR legacy IN
    SELECT idx.relname AS index_name
    FROM pg_index AS i
    JOIN pg_class AS idx ON idx.oid = i.indexrelid
    WHERE i.indrelid = 'public.student_responses'::regclass
      AND i.indisunique AND NOT i.indisprimary
      AND i.indexprs IS NULL AND i.indpred IS NULL
      AND NOT EXISTS (SELECT 1 FROM pg_constraint AS c WHERE c.conindid = i.indexrelid)
      AND (
        SELECT array_agg(a.attname ORDER BY keys.ord)
        FROM unnest(i.indkey) WITH ORDINALITY AS keys(attnum, ord)
        JOIN pg_attribute AS a
          ON a.attrelid = i.indrelid AND a.attnum = keys.attnum
        WHERE keys.ord <= i.indnkeyatts
      ) = ARRAY['session_id','participant_id','task_index','stage_key']::text[]
  LOOP
    EXECUTE format('DROP INDEX public.%I', legacy.index_name);
  END LOOP;
END;
$fix$;

COMMIT;

-- 驗收：應看到 student_responses_v21_unique；
-- 不應再看到 4 欄的舊版 unique 約束或獨立索引。
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'student_responses'
ORDER BY indexname;
