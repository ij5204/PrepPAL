-- Migration to add preferred_cuisines array to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferred_cuisines TEXT[] NOT NULL DEFAULT '{}';
