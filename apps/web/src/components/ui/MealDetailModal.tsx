import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Flame, CheckCircle, AlertCircle } from 'lucide-react';
import { Meal } from './MealCard';

interface MealDetailModalProps {
  meal: Meal | null;
  onClose: () => void;
  onLog?: (meal: Meal) => void;
}

export function MealDetailModal({ meal, onClose, onLog }: MealDetailModalProps) {
  return (
    <AnimatePresence>
      {meal && (
        <>
          <motion.div
            className="fixed inset-0 bg-bg/80 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-4 bottom-4 top-4 md:inset-auto md:right-6 md:top-6 md:bottom-6 md:w-[480px] z-50 flex flex-col"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
          >
            <div className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden flex flex-col h-full">
              <div className={`h-48 bg-gradient-to-br ${meal.gradient} relative flex-shrink-0`}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-xl bg-white/15 flex items-center justify-center">
                    <Flame size={32} className="text-white/80" />
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-bg/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
                >
                  <X size={16} />
                </button>
                <div className="absolute bottom-4 left-4 right-4">
                  <h2 className="text-xl font-bold text-white font-display">{meal.name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-sm text-white/70">
                      <Clock size={13} />{meal.prepTime} min
                    </span>
                    <span className="flex items-center gap-1 text-sm text-white/70">
                      <Flame size={13} />{meal.calories} kcal
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Macro grid */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Protein', value: `${meal.protein}g`, color: 'text-accent-blue' },
                    { label: 'Carbs', value: `${meal.carbs}g`, color: 'text-accent-amber' },
                    { label: 'Fat', value: `${meal.fat}g`, color: 'text-accent-purple' },
                  ].map(m => (
                    <div key={m.label} className="bg-surface-elevated rounded-lg p-3 text-center border border-border">
                      <p className={`stat-number text-xl ${m.color}`}>{m.value}</p>
                      <p className="text-2xs text-text-muted mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Ingredients */}
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-2">Ingredients</h3>
                  <div className="space-y-1.5">
                    {meal.ingredients.map(ing => (
                      <div key={ing} className="flex items-center gap-2.5 py-1.5 px-3 bg-surface-elevated rounded-lg border border-border">
                        <CheckCircle size={14} className="text-accent-green flex-shrink-0" />
                        <span className="text-sm text-text-primary">{ing}</span>
                        <span className="text-xs text-accent-green ml-auto">In pantry</span>
                      </div>
                    ))}
                    {meal.missing.map(ing => (
                      <div key={ing} className="flex items-center gap-2.5 py-1.5 px-3 bg-accent-amber-dim rounded-lg border border-accent-amber/20">
                        <AlertCircle size={14} className="text-accent-amber flex-shrink-0" />
                        <span className="text-sm text-text-primary">{ing}</span>
                        <span className="text-xs text-accent-amber ml-auto">Missing</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Steps */}
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-2">Instructions</h3>
                  <div className="space-y-2">
                    {meal.steps.map((step, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-accent-green-dim text-accent-green text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-sm text-text-secondary leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-border flex gap-3 flex-shrink-0">
                <button className="btn-secondary flex-1">
                  Cook Now
                </button>
                <button className="btn-primary flex-1" onClick={() => { onLog?.(meal); onClose(); }}>
                  Log Meal
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
