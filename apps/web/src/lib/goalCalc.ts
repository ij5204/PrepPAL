export type WeightUnit = 'kg' | 'lbs';
export type HeightUnit = 'cm' | 'ft';

export interface GoalInputs {
  currentWeight: number;
  goalWeight: number;
  height: number;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  gender: 'male' | 'female' | 'other';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active';
  goalDate: string; // ISO date string
  fitnessGoal: 'cutting' | 'maintaining' | 'bulking';
}

export interface GoalResult {
  bmr: number;
  tdee: number;
  recommendedCalories: number;
  weeklyChange: number; // kg per week
  weeksToGoal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  isAggressive: boolean;
  isSafe: boolean;
}

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export function calculateGoals(inputs: GoalInputs): GoalResult {
  // Convert to metric
  const weightKg = inputs.weightUnit === 'lbs'
    ? inputs.currentWeight * 0.453592
    : inputs.currentWeight;

  const goalWeightKg = inputs.weightUnit === 'lbs'
    ? inputs.goalWeight * 0.453592
    : inputs.goalWeight;

  const heightCm = inputs.heightUnit === 'ft'
    ? inputs.height * 30.48
    : inputs.height;

  // Mifflin-St Jeor BMR
  let bmr: number;
  if (inputs.gender === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * 25 + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * 25 - 161;
  }

  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[inputs.activityLevel]);

  // Weeks to goal
  const today = new Date();
  const goal = new Date(inputs.goalDate);
  const weeksToGoal = Math.max(1, Math.round((goal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7)));

  // Weight difference
  const weightDiffKg = goalWeightKg - weightKg;
  const weeklyChange = weightDiffKg / weeksToGoal;

  // 1 kg fat ≈ 7700 kcal
  const dailyAdjustment = Math.round((weeklyChange * 7700) / 7);
  const recommendedCalories = Math.max(1200, Math.round(tdee + dailyAdjustment));

  // Safety checks
  const dailyDeficit = tdee - recommendedCalories;
  const isAggressive = Math.abs(dailyDeficit) > 700;
  const isSafe = Math.abs(weeklyChange) <= 1;

  // Macros
  // Protein: 2g per kg of bodyweight for active people
  const protein_g = Math.round(weightKg * 2);
  const proteinCals = protein_g * 4;
  const remaining = recommendedCalories - proteinCals;
  const fat_g = Math.round((remaining * 0.3) / 9);
  const carbs_g = Math.round((remaining * 0.7) / 4);

  return {
    bmr: Math.round(bmr),
    tdee,
    recommendedCalories,
    weeklyChange: Math.round(weeklyChange * 100) / 100,
    weeksToGoal,
    protein_g,
    carbs_g,
    fat_g,
    isAggressive,
    isSafe,
  };
}

export function formatWeightChange(weeklyChange: number, unit: WeightUnit): string {
  const val = unit === 'lbs'
    ? Math.abs(weeklyChange * 2.20462)
    : Math.abs(weeklyChange);
  const rounded = Math.round(val * 10) / 10;
  const direction = weeklyChange < 0 ? 'lose' : 'gain';
  return `${direction} ${rounded} ${unit}/week`;
}