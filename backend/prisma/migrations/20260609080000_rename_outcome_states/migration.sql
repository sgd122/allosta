-- Redefine consultation Outcome from a sales funnel (PURCHASED/ON_HOLD/REJECTED)
-- to a consultation funnel (EXPLAINED/GUIDED/PURCHASED).
--
-- RENAME VALUE preserves existing rows (no data loss, no drop of in-use values):
--   ON_HOLD  -> GUIDED     (영양제 안내했으나 구매 안 함)
--   REJECTED -> EXPLAINED  (결과지 설명만, 제품 안내 없음)
--   PURCHASED stays        (안내 후 구매)
ALTER TYPE "Outcome" RENAME VALUE 'ON_HOLD' TO 'GUIDED';
ALTER TYPE "Outcome" RENAME VALUE 'REJECTED' TO 'EXPLAINED';
