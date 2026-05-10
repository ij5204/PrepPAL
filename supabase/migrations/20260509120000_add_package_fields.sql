-- Add package size fields to pantry_items.
-- package_size: numeric size of each individual package (e.g. 18.5)
-- package_unit: unit for that size as free text (e.g. 'oz', 'fl oz', 'gal', 'lb')
-- Both nullable so existing rows are unaffected.

ALTER TABLE public.pantry_items
  ADD COLUMN IF NOT EXISTS package_size  NUMERIC,
  ADD COLUMN IF NOT EXISTS package_unit  TEXT;

-- Expand the unit CHECK constraint to include oz and lbs.
-- The TypeScript Unit type already contained these; the original DB constraint
-- did not, causing receipt-scan inserts to fail silently.
ALTER TABLE public.pantry_items
  DROP CONSTRAINT IF EXISTS pantry_items_unit_check,
  ADD CONSTRAINT pantry_items_unit_check
    CHECK (unit = ANY (ARRAY['g','kg','oz','lbs','ml','l','cups','pieces','tsp','tbsp']));
