import { z } from 'zod';

// ── Enums ─────────────────────────────────────

export const UnitSchema = z.enum([
  'g', 'kg', 'oz', 'lbs', 'ml', 'l', 'cups', 'pieces', 'tsp', 'tbsp',
]);

export const CategorySchema = z.enum([
  'produce', 'dairy', 'protein', 'pantry', 'spice', 'other',
]);

export const FitnessGoalSchema = z.enum(['cutting', 'maintaining', 'bulking']);

export const ActivityLevelSchema = z.enum([
  'sedentary', 'light', 'moderate', 'active',
]);

export const DietaryRestrictionSchema = z.enum([
  'vegetarian', 'vegan', 'no-gluten', 'no-nuts', 'no-dairy', 'halal', 'none',
]);

export const GroceryReasonSchema = z.enum([
  'low_stock', 'expired', 'missing_ingredient', 'manual',
]);

// ── Pantry ────────────────────────────────────

export const AddPantryItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unit: UnitSchema,
  expiry_date: z.string().nullable().optional(),
  category: CategorySchema,
  notes: z.string().max(500).nullable().optional(),
  barcode: z.string().nullable().optional(),
  open_food_facts_id: z.string().nullable().optional(),
});

export const UpdatePantryItemSchema = AddPantryItemSchema.partial().extend({
  quantity: z.number().min(0, 'Quantity cannot be negative').optional(),
});

// ── Meal Logging ──────────────────────────────

export const LogMealSchema = z.object({
  meal_name: z.string().min(1, 'Meal name is required').max(200),
  eaten_at: z.string().optional(),
  calories: z.number().positive('Calories must be greater than 0'),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  ingredients_used: z
    .array(
      z.object({
        pantry_item_id: z.string().uuid(),
        name: z.string(),
        quantity_used: z.number().min(0),
        unit: UnitSchema,
      })
    )
    .optional()
    .default([]),
  claude_suggestion: z.boolean(),
  meal_tags: z.array(z.string()).optional().default([]),
});

// ── Grocery ───────────────────────────────────

export const AddGroceryItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  quantity: z.number().positive().nullable().optional(),
  unit: UnitSchema.nullable().optional(),
  reason: GroceryReasonSchema,
});

// ── User / Onboarding ─────────────────────────

export const OnboardingStep2Schema = z.object({
  daily_calorie_goal: z
    .number()
    .int()
    .min(800, 'Minimum 800 kcal')
    .max(10000, 'Maximum 10,000 kcal'),
});

export const OnboardingStep3Schema = z.object({
  fitness_goal: FitnessGoalSchema,
  protein_goal_g: z.number().int().positive().nullable().optional(),
  activity_level: ActivityLevelSchema,
});

export const OnboardingStep4Schema = z.object({
  dietary_restrictions: z.array(DietaryRestrictionSchema).default([]),
});

export const OnboardingStep5Schema = z.object({
  allergies: z.array(z.string().min(1)).default([]),
  disliked_foods: z.array(z.string().min(1)).default([]),
});

export type AddPantryItemInput = z.infer<typeof AddPantryItemSchema>;
export type UpdatePantryItemInput = z.infer<typeof UpdatePantryItemSchema>;
export type LogMealInput = z.infer<typeof LogMealSchema>;
export type AddGroceryItemInput = z.infer<typeof AddGroceryItemSchema>;
