// ─────────────────────────────────────────────
// PrepPAL — Shared TypeScript Types
// Single source of truth for all entities.
// Never duplicate these in apps/.
// ─────────────────────────────────────────────

// ── Enums & Unions ────────────────────────────

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'cups' | 'pieces' | 'tsp' | 'tbsp';

export type Category = 'produce' | 'dairy' | 'protein' | 'pantry' | 'spice' | 'other';

export type FitnessGoal = 'cutting' | 'maintaining' | 'bulking';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';

export type UserRole = 'standard_user' | 'admin' | 'support_admin';

export type NotificationType =
  | 'expiry_warning'
  | 'low_stock'
  | 'meal_reminder'
  | 'restock'
  | 'calorie_reminder';

export type NotificationStatus = 'sent' | 'failed' | 'pending';

export type GroceryReason =
  | 'low_stock'
  | 'expired'
  | 'missing_ingredient'
  | 'manual';

export type DietaryRestriction =
  | 'vegetarian'
  | 'vegan'
  | 'no-gluten'
  | 'no-nuts'
  | 'no-dairy'
  | 'halal'
  | 'none';

// ── Database Entities ─────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  daily_calorie_goal: number;
  protein_goal_g: number | null;
  fitness_goal: FitnessGoal;
  dietary_restrictions: DietaryRestriction[];
  preferred_cuisines: string[];
  allergies: string[];
  disliked_foods: string[];
  activity_level: ActivityLevel;
  role: UserRole;
  onboarding_complete: boolean;
  push_token: string | null;
  timezone: string;
  /** Server-updated heartbeat for admin "last active" */
  last_active_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PantryItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  unit: Unit;
  expiry_date: string | null; // ISO date string
  category: Category;
  barcode: string | null;
  open_food_facts_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MealLog {
  id: string;
  user_id: string;
  meal_name: string;
  eaten_at: string; // ISO timestamp
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients_used: IngredientUsed[];
  claude_suggestion: boolean;
  meal_tags: string[] | null;
  nutrition_is_estimate: boolean;
  created_at: string;
  updated_at: string;
}

export interface IngredientUsed {
  pantry_item_id: string;
  name: string;
  quantity_used: number;
  unit: Unit;
}

export interface MealSuggestionCache {
  id: string;
  user_id: string;
  pantry_hash: string;
  suggestions: MealSuggestion[];
  generated_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface GroceryListItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  reason: GroceryReason;
  is_checked: boolean;
  added_at: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  message: string;
  sent_at: string;
  status: NotificationStatus;
  pantry_item_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NutritionEstimateCache {
  id: string;
  ingredient_name: string;
  quantity: number;
  unit: Unit;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── AI / Claude Types ─────────────────────────

export interface MealSuggestion {
  meal_name: string;
  meal_type: string;
  servings: number;
  calories_per_serving: number;
  total_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  prep_time_minutes: number;
  cook_time_minutes: number;
  ingredients_used: Array<{ name: string; quantity: number; unit: string }>;
  missing_ingredients: Array<{ name: string; quantity: number; unit: string }>;
  step_by_step_instructions: string[];
  why_this_fits_user: string;
  portion_notes: string;
  tags: string[];
}

export interface NutritionEstimate {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// ── API Request / Response types ──────────────

export interface GenerateMealSuggestionsRequest {
  user_id: string;
}

export interface GenerateMealSuggestionsResponse {
  suggestions: MealSuggestion[];
  from_cache: boolean;
  fallback_used: boolean;
  fallback_reason?: string;
}

export interface EstimateNutritionRequest {
  ingredient_name: string;
  quantity: number;
  unit: Unit;
}

export interface LogMealRequest {
  meal_name: string;
  eaten_at?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients_used: IngredientUsed[];
  claude_suggestion: boolean;
  meal_tags?: string[];
}

// ── UI / View types ───────────────────────────

export interface DailyNutritionSummary {
  calories_consumed: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meals: MealLog[];
}

export interface WeeklyNutritionSummary {
  days: Array<{
    date: string; // YYYY-MM-DD
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>;
}

export interface ExpiryStatus {
  status: 'ok' | 'warning' | 'danger' | 'expired';
  daysUntilExpiry: number | null;
}
