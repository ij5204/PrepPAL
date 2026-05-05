import type { PantryItem, ExpiryStatus, IngredientUsed, Unit } from '@preppal/types';

/** Normalize ingredient names for fuzzy matching Claude output → pantry rows */
export function normalizeIngredientKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface ParsedSuggestionIngredient {
  name: string;
  quantity: number;
  unit: string;
}

/**
 * Map AI suggestion quantities to pantry_item_ids without going negative.
 * Prefers matching name + unit; falls back to name-only if units differ but pantry has stock.
 */
export function matchSuggestionIngredientsToPantry(
  pantry: PantryItem[],
  suggestionIngredients: ParsedSuggestionIngredient[]
): IngredientUsed[] {
  const pool = pantry.map((p) => ({ ...p }));
  const out: IngredientUsed[] = [];

  for (const ing of suggestionIngredients) {
    const key = normalizeIngredientKey(ing.name);
    let idx = pool.findIndex(
      (p) =>
        normalizeIngredientKey(p.name) === key &&
        p.quantity > 0 &&
        p.unit === (ing.unit as Unit)
    );

    if (idx === -1) {
      idx = pool.findIndex((p) => normalizeIngredientKey(p.name) === key && p.quantity > 0);
    }

    if (idx === -1) continue;

    const row = pool[idx];
    const deduct = Math.min(Math.max(0, ing.quantity), row.quantity);
    if (deduct <= 0) continue;

    out.push({
      pantry_item_id: row.id,
      name: row.name,
      quantity_used: deduct,
      unit: row.unit,
    });

    pool[idx] = { ...row, quantity: row.quantity - deduct };
  }

  return out;
}

// ── Date / Expiry ─────────────────────────────

export function getExpiryStatus(expiryDate: string | null): ExpiryStatus {
  if (!expiryDate) return { status: 'ok', daysUntilExpiry: null };

  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffMs = expiry.getTime() - now.getTime();
  const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) return { status: 'expired', daysUntilExpiry };
  if (daysUntilExpiry === 0) return { status: 'danger', daysUntilExpiry };
  if (daysUntilExpiry <= 3) return { status: 'warning', daysUntilExpiry };
  return { status: 'ok', daysUntilExpiry };
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Nutrition helpers ─────────────────────────

export function calcProteinGoal(user: {
  protein_goal_g: number | null;
  daily_calorie_goal: number;
  current_weight?: number | null;
  weight_unit?: 'kg' | 'lbs' | null;
  fitness_goal?: string | null;
}): number {
  // If the user has set an explicit protein goal, always honour it
  if (user.protein_goal_g != null) return user.protein_goal_g;

  // Convert weight to lbs for the standard g/lb formula
  const weightLbs = (() => {
    if (!user.current_weight) return null;
    return user.weight_unit === 'kg'
      ? user.current_weight * 2.20462
      : user.current_weight;
  })();

  const goal = (user.fitness_goal ?? 'maintaining').toLowerCase();

  if (weightLbs) {
    // Cutting: 0.9 g/lb to preserve muscle in a deficit
    if (goal === 'cutting')    return Math.round(weightLbs * 0.9);
    // Bulking: 0.8 g/lb — enough to support hypertrophy without excess
    if (goal === 'bulking')    return Math.round(weightLbs * 0.8);
    // Maintaining: 0.75 g/lb balanced middle ground
    return Math.round(weightLbs * 0.75);
  }

  // No weight stored — fall back to percentage-of-calories
  // Cutting: 30% of cals from protein, Bulking: 25%, Maintaining: 25%
  const pct = goal === 'cutting' ? 0.30 : 0.25;
  return Math.round((user.daily_calorie_goal * pct) / 4);
}

export function calcMacroGoals(user: {
  protein_goal_g: number | null;
  daily_calorie_goal: number;
  current_weight?: number | null;
  weight_unit?: 'kg' | 'lbs' | null;
  fitness_goal?: string | null;
}): { protein: number; carbs: number; fat: number } {
  const goal = (user.fitness_goal ?? 'maintaining').toLowerCase();

  const protein = calcProteinGoal(user);
  const proteinCals = protein * 4;

  const weightLbs = (() => {
    if (!user.current_weight) return null;
    return user.weight_unit === 'kg'
      ? user.current_weight * 2.20462
      : user.current_weight;
  })();

  let fat: number;

  if (weightLbs) {
    // Cutting: minimum fat floor (0.35 g/lb) to maintain hormonal health
    if (goal === 'cutting') {
      fat = Math.round(weightLbs * 0.35);
    }
    // Bulking: slightly higher fat (0.4 g/lb) to support anabolic hormones
    else if (goal === 'bulking') {
      fat = Math.round(weightLbs * 0.40);
    }
    // Maintaining: 0.35 g/lb balanced
    else {
      fat = Math.round(weightLbs * 0.35);
    }
  } else {
    // No weight — set fat as a percentage of total calories
    // Cutting: 20%, Bulking: 25%, Maintaining: 25%
    const fatPct = goal === 'cutting' ? 0.20 : 0.25;
    fat = Math.round((user.daily_calorie_goal * fatPct) / 9);
  }

  // Carbs fill the remaining calorie budget
  const fatCals = fat * 9;
  const carbsRemaining = user.daily_calorie_goal - proteinCals - fatCals;
  const carbs = Math.max(0, Math.round(carbsRemaining / 4));

  return { protein, carbs, fat };
}

// ── Pantry helpers ────────────────────────────

export function normalizeName(name: string): string {
  return name
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function serializePantryForHash(items: PantryItem[]): string {
  return items
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => `${i.name}:${i.quantity}:${i.unit}`)
    .join(',');
}

export async function hashPantryString(str: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(str)
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback: simple deterministic hash (not crypto-strength, only for dev)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}

// ── Unit display ──────────────────────────────

export function formatQuantity(quantity: number, unit: string): string {
  const q = quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(1);
  return `${q} ${unit}`;
}

// ── Clamp ─────────────────────────────────────

export function clampToZero(value: number): number {
  return Math.max(0, value);
}
