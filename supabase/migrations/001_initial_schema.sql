-- ─────────────────────────────────────────────────────────────────────────────
-- PrepPAL — Initial Schema Migration
-- All tables, RLS policies, indexes, and cron job registrations.
-- Run via: supabase db push
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable required extensions
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pg_cron";
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER: auto-update updated_at on every write
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: users
-- Extends Supabase Auth. Populated via trigger on auth.users insert.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL DEFAULT '',
  daily_calorie_goal    INTEGER NOT NULL DEFAULT 2200,
  protein_goal_g        INTEGER,
  fitness_goal          TEXT NOT NULL DEFAULT 'maintaining'
                          CHECK (fitness_goal IN ('cutting', 'maintaining', 'bulking')),
  dietary_restrictions  TEXT[] NOT NULL DEFAULT '{}',
  allergies             TEXT[] NOT NULL DEFAULT '{}',
  disliked_foods        TEXT[] NOT NULL DEFAULT '{}',
  activity_level        TEXT NOT NULL DEFAULT 'moderate'
                          CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active')),
  role                  TEXT NOT NULL DEFAULT 'standard_user'
                          CHECK (role IN ('standard_user', 'admin', 'support_admin')),
  onboarding_complete   BOOLEAN NOT NULL DEFAULT FALSE,
  push_token            TEXT,
  timezone              TEXT NOT NULL DEFAULT 'America/New_York',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Allow admins to view all users
CREATE POLICY "users_admin_select" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'support_admin')
    )
  );

-- Auto-create user row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: pantry_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pantry_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  quantity              DECIMAL(10, 3) NOT NULL CHECK (quantity >= 0),
  unit                  TEXT NOT NULL
                          CHECK (unit IN ('g', 'kg', 'ml', 'l', 'cups', 'pieces', 'tsp', 'tbsp')),
  expiry_date           DATE,
  category              TEXT NOT NULL DEFAULT 'other'
                          CHECK (category IN ('produce', 'dairy', 'protein', 'pantry', 'spice', 'other')),
  barcode               TEXT,
  open_food_facts_id    TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX pantry_items_user_id_idx ON public.pantry_items (user_id);
CREATE INDEX pantry_items_expiry_idx ON public.pantry_items (expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX pantry_items_quantity_idx ON public.pantry_items (user_id, quantity);

CREATE TRIGGER pantry_items_updated_at
  BEFORE UPDATE ON public.pantry_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pantry_items_own" ON public.pantry_items
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: meal_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meal_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  meal_name             TEXT NOT NULL,
  eaten_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calories              INTEGER NOT NULL CHECK (calories > 0),
  protein_g             DECIMAL(8, 2) NOT NULL CHECK (protein_g >= 0),
  carbs_g               DECIMAL(8, 2) NOT NULL CHECK (carbs_g >= 0),
  fat_g                 DECIMAL(8, 2) NOT NULL CHECK (fat_g >= 0),
  ingredients_used      JSONB NOT NULL DEFAULT '[]',
  claude_suggestion     BOOLEAN NOT NULL,
  meal_tags             TEXT[] DEFAULT '{}',
  nutrition_is_estimate BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX meal_logs_user_eaten_idx ON public.meal_logs (user_id, eaten_at DESC);

CREATE TRIGGER meal_logs_updated_at
  BEFORE UPDATE ON public.meal_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_logs_own" ON public.meal_logs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: meal_suggestion_cache
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meal_suggestion_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pantry_hash     TEXT NOT NULL,
  suggestions     JSONB NOT NULL,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX meal_cache_lookup_idx ON public.meal_suggestion_cache (user_id, pantry_hash, expires_at);

CREATE TRIGGER meal_cache_updated_at
  BEFORE UPDATE ON public.meal_suggestion_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.meal_suggestion_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_cache_own" ON public.meal_suggestion_cache
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: grocery_list_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grocery_list_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  quantity    DECIMAL(10, 3),
  unit        TEXT CHECK (unit IN ('g', 'kg', 'ml', 'l', 'cups', 'pieces', 'tsp', 'tbsp')),
  reason      TEXT NOT NULL
                CHECK (reason IN ('low_stock', 'expired', 'missing_ingredient', 'manual')),
  is_checked  BOOLEAN NOT NULL DEFAULT FALSE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX grocery_items_user_idx ON public.grocery_list_items (user_id, is_checked);

CREATE TRIGGER grocery_items_updated_at
  BEFORE UPDATE ON public.grocery_list_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.grocery_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grocery_items_own" ON public.grocery_list_items
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: notification_tokens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tokens_own" ON public.notification_tokens
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: notifications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL
                    CHECK (type IN ('expiry_warning', 'low_stock', 'meal_reminder', 'restock')),
  message         TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('sent', 'failed', 'pending')),
  pantry_item_id  UUID REFERENCES public.pantry_items(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX notifications_user_idx ON public.notifications (user_id, sent_at DESC);

CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own" ON public.notifications
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: nutrition_estimate_cache
-- Shared across users — no RLS needed (read-only, non-PII)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nutrition_estimate_cache (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_name  TEXT NOT NULL,
  quantity         DECIMAL(10, 3) NOT NULL,
  unit             TEXT NOT NULL
                     CHECK (unit IN ('g', 'kg', 'ml', 'l', 'cups', 'pieces', 'tsp', 'tbsp')),
  calories         INTEGER NOT NULL,
  protein_g        DECIMAL(8, 2) NOT NULL,
  carbs_g          DECIMAL(8, 2) NOT NULL,
  fat_g            DECIMAL(8, 2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ingredient_name, unit)
);

CREATE INDEX nutrition_cache_lookup_idx ON public.nutrition_estimate_cache (ingredient_name, unit);

CREATE TRIGGER nutrition_cache_updated_at
  BEFORE UPDATE ON public.nutrition_estimate_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.nutrition_estimate_cache ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read/insert; nobody deletes
CREATE POLICY "nutrition_cache_read" ON public.nutrition_estimate_cache
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "nutrition_cache_insert" ON public.nutrition_estimate_cache
  FOR INSERT TO authenticated WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: audit_logs
-- Immutable. Admins INSERT only. Nobody can UPDATE or DELETE.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID NOT NULL REFERENCES public.users(id),
  action          TEXT NOT NULL,
  target_user_id  UUID REFERENCES public.users(id),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- No updated_at — this table is immutable
);

CREATE INDEX audit_logs_admin_idx ON public.audit_logs (admin_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_admin_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "audit_logs_admin_select" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'support_admin')
    )
  );

-- Explicitly deny UPDATE and DELETE for all roles (belt + suspenders)
CREATE POLICY "audit_logs_no_update" ON public.audit_logs
  FOR UPDATE USING (FALSE);

CREATE POLICY "audit_logs_no_delete" ON public.audit_logs
  FOR DELETE USING (FALSE);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: system_events (edge function errors, cron results)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  source      TEXT NOT NULL, -- e.g. 'edge:generate-meal-suggestions'
  payload     JSONB NOT NULL DEFAULT '{}',
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_events_admin_select" ON public.system_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'support_admin')
    )
  );

CREATE POLICY "system_events_service_insert" ON public.system_events
  FOR INSERT WITH CHECK (TRUE); -- Edge Functions use service role key
