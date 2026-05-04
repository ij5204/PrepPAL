-- PrepPAL — RPC for atomic meal log + pantry deduction, cache uniqueness, realtime, user activity

-- Meal suggestion cache: one row per user + pantry hash (enables upsert from Edge Function)
CREATE UNIQUE INDEX IF NOT EXISTS meal_suggestion_cache_user_pantry_uidx
  ON public.meal_suggestion_cache (user_id, pantry_hash);

-- Last active (admin list)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.log_meal_and_deduct_pantry(
  p_meal_name text,
  p_eaten_at timestamptz,
  p_calories integer,
  p_protein_g numeric,
  p_carbs_g numeric,
  p_fat_g numeric,
  p_ingredients_used jsonb,
  p_claude_suggestion boolean,
  p_meal_tags text[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_meal_id uuid;
  elem jsonb;
  v_pid uuid;
  v_use numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.meal_logs (
    user_id, meal_name, eaten_at, calories, protein_g, carbs_g, fat_g,
    ingredients_used, claude_suggestion, meal_tags, nutrition_is_estimate
  ) VALUES (
    v_uid,
    p_meal_name,
    COALESCE(p_eaten_at, now()),
    p_calories,
    p_protein_g,
    p_carbs_g,
    p_fat_g,
    COALESCE(p_ingredients_used, '[]'::jsonb),
    COALESCE(p_claude_suggestion, false),
    COALESCE(p_meal_tags, '{}'),
    true
  )
  RETURNING id INTO v_meal_id;

  FOR elem IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_ingredients_used, '[]'::jsonb))
  LOOP
    BEGIN
      v_pid := (elem->>'pantry_item_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_pid := NULL;
    END;

    v_use := COALESCE((elem->>'quantity_used')::numeric, 0);

    IF v_pid IS NOT NULL AND v_use > 0 THEN
      UPDATE public.pantry_items
      SET quantity = GREATEST(0, quantity - LEAST(v_use, quantity))
      WHERE id = v_pid AND user_id = v_uid;
    END IF;
  END LOOP;

  RETURN v_meal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_meal_and_deduct_pantry(
  text, timestamptz, integer, numeric, numeric, numeric, jsonb, boolean, text[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_meal_and_deduct_pantry(
  text, timestamptz, integer, numeric, numeric, numeric, jsonb, boolean, text[]
) TO authenticated;

-- Notification types: morning prompt + low-calorie reminder
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'expiry_warning',
    'low_stock',
    'meal_reminder',
    'restock',
    'calorie_reminder'
  ));

-- Realtime for pantry + meals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pantry_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pantry_items';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meal_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_logs';
  END IF;
END $$;
