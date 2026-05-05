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

  // ── Macros: goal-specific approach ──────────────────────────────────────────
  // Step 1: Protein — anchor based on fitness goal (g/lb bodyweight)
  const weightLbs = weightKg * 2.20462;
  let protein_g: number;
  if (inputs.fitnessGoal === 'cutting') {
    // 0.9 g/lb: high protein to preserve muscle in a calorie deficit
    protein_g = Math.round(weightLbs * 0.9);
  } else if (inputs.fitnessGoal === 'bulking') {
    // 0.8 g/lb: adequate for hypertrophy, not excessive
    protein_g = Math.round(weightLbs * 0.8);
  } else {
    // 0.75 g/lb: maintenance baseline
    protein_g = Math.round(weightLbs * 0.75);
  }

  // Step 2: Fat — minimum baseline (g/lb) for hormonal health
  let fat_g: number;
  if (inputs.fitnessGoal === 'cutting') {
    // Minimum fat floor 0.35 g/lb keeps hormones intact during deficit
    fat_g = Math.round(weightLbs * 0.35);
  } else if (inputs.fitnessGoal === 'bulking') {
    // Slightly higher at 0.4 g/lb to support anabolic hormone environment
    fat_g = Math.round(weightLbs * 0.40);
  } else {
    // Maintaining: balanced at 0.35 g/lb
    fat_g = Math.round(weightLbs * 0.35);
  }

  // Step 3: Carbs fill the remaining calorie budget
  const proteinCals = protein_g * 4;
  const fatCals = fat_g * 9;
  const carbsRemaining = recommendedCalories - proteinCals - fatCals;
  const carbs_g = Math.max(0, Math.round(carbsRemaining / 4));

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