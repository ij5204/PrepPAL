-- Expand unit CHECK constraints across all tables to include worldwide units.
-- Weight (metric): g, kg
-- Weight (imperial): oz, lbs
-- Volume (metric): ml, l
-- Volume (imperial): fl oz, pt, qt, gal
-- Cooking measures: tsp, tbsp, cups
-- Count: pieces, dozen, bunch, head, clove
-- Package/container: can, bottle, box, bag, jar, pack, slice, serving

ALTER TABLE public.pantry_items
  DROP CONSTRAINT IF EXISTS pantry_items_unit_check,
  DROP CONSTRAINT IF EXISTS pantry_items_unit_check1,
  ADD CONSTRAINT pantry_items_unit_check
    CHECK (unit = ANY(ARRAY['g','kg','oz','lbs','ml','l','fl oz','pt','qt','gal','tsp','tbsp','cups','pieces','dozen','bunch','head','clove','can','bottle','box','bag','jar','pack','slice','serving']));

ALTER TABLE public.grocery_list_items
  DROP CONSTRAINT IF EXISTS grocery_list_items_unit_check,
  DROP CONSTRAINT IF EXISTS grocery_list_items_unit_check1,
  ADD CONSTRAINT grocery_list_items_unit_check
    CHECK (unit = ANY(ARRAY['g','kg','oz','lbs','ml','l','fl oz','pt','qt','gal','tsp','tbsp','cups','pieces','dozen','bunch','head','clove','can','bottle','box','bag','jar','pack','slice','serving']));

ALTER TABLE public.nutrition_estimate_cache
  DROP CONSTRAINT IF EXISTS nutrition_estimate_cache_unit_check,
  DROP CONSTRAINT IF EXISTS nutrition_estimate_cache_unit_check1,
  ADD CONSTRAINT nutrition_estimate_cache_unit_check
    CHECK (unit = ANY(ARRAY['g','kg','oz','lbs','ml','l','fl oz','pt','qt','gal','tsp','tbsp','cups','pieces','dozen','bunch','head','clove','can','bottle','box','bag','jar','pack','slice','serving']));
