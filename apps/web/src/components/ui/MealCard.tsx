import { motion } from 'framer-motion';
import { Clock, Flame, Zap } from 'lucide-react';

export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  prepTime: number;
  pantryMatch: number;
  tags: string[];
  gradient: string;
  ingredients: string[];
  missing: string[];
  steps: string[];
}

interface MealCardProps {
  meal: Meal;
  onView?: (meal: Meal) => void;
  onLog?: (meal: Meal) => void;
  compact?: boolean;
  delay?: number;
}

export function MealCard({ meal, onView, onLog, compact = false, delay = 0 }: MealCardProps) {
  const matchColor = meal.pantryMatch >= 95 ? 'text-accent-green' : meal.pantryMatch >= 80 ? 'text-accent-amber' : 'text-text-secondary';

  if (compact) {
    return (
      <motion.div
        className="card-hover p-0 overflow-hidden flex-shrink-0 w-56"
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => onView?.(meal)}
      >
        <div className={`h-24 bg-gradient-to-br ${meal.gradient} relative`}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
              <Flame size={20} className="text-white/80" />
            </div>
          </div>
          <div className="absolute top-2 right-2">
            <span className={`text-xs font-semibold ${matchColor} bg-bg/80 px-2 py-0.5 rounded-full`}>
              {meal.pantryMatch}% match
            </span>
          </div>
        </div>
        <div className="p-3">
          <p className="text-sm font-semibold text-text-primary truncate">{meal.name}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Flame size={11} className="text-accent-amber" />{meal.calories}
            </span>
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Zap size={11} className="text-accent-blue" />{meal.protein}g
            </span>
            <span className="flex items-center gap-1 text-xs text-text-muted ml-auto">
              <Clock size={11} />{meal.prepTime}m
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="card overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
    >
      <div className={`h-36 bg-gradient-to-br ${meal.gradient} relative`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center">
            <Flame size={28} className="text-white/80" />
          </div>
        </div>
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          {meal.tags.slice(0, 2).map(tag => (
            <span key={tag} className="text-2xs font-medium bg-bg/70 text-text-secondary px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
        <div className="absolute top-3 right-3">
          <span className={`text-xs font-bold ${matchColor} bg-bg/80 px-2.5 py-1 rounded-full`}>
            {meal.pantryMatch}%
          </span>
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-base font-semibold text-text-primary mb-3">{meal.name}</h3>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center">
            <p className="stat-number text-lg text-text-primary">{meal.calories}</p>
            <p className="text-2xs text-text-muted">kcal</p>
          </div>
          <div className="text-center border-x border-border">
            <p className="stat-number text-lg text-accent-blue">{meal.protein}g</p>
            <p className="text-2xs text-text-muted">protein</p>
          </div>
          <div className="text-center">
            <p className="stat-number text-lg text-text-secondary">{meal.prepTime}m</p>
            <p className="text-2xs text-text-muted">prep</p>
          </div>
        </div>

        {meal.missing.length > 0 && (
          <p className="text-xs text-text-muted mb-3">
            Missing: <span className="text-accent-amber">{meal.missing.join(', ')}</span>
          </p>
        )}

        <div className="flex gap-2">
          <button
            className="btn-secondary flex-1 text-xs py-2"
            onClick={() => onView?.(meal)}
          >
            View Recipe
          </button>
          <button
            className="btn-primary flex-1 text-xs py-2"
            onClick={() => onLog?.(meal)}
          >
            Log Meal
          </button>
        </div>
      </div>
    </motion.div>
  );
}
