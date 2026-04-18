import type { PantryItem, ExpiryStatus } from '@preppal/types';

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
}): number {
  if (user.protein_goal_g != null) return user.protein_goal_g;
  // Estimate: 25% of calories from protein, 4 kcal/g
  return Math.round((user.daily_calorie_goal * 0.25) / 4);
}

export function calcMacroGoals(user: {
  protein_goal_g: number | null;
  daily_calorie_goal: number;
}): { protein: number; carbs: number; fat: number } {
  const protein = calcProteinGoal(user);
  const proteinCals = protein * 4;
  const remaining = user.daily_calorie_goal - proteinCals;
  const carbs = Math.round((remaining * 0.55) / 4);
  const fat = Math.round((remaining * 0.45) / 9);
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
