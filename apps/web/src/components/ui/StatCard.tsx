import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  trend?: { value: number; label: string };
  accent?: 'green' | 'blue' | 'amber' | 'red' | 'purple';
  progress?: number;
  className?: string;
  delay?: number;
}

const accentMap = {
  green: { bg: 'bg-accent-green-dim', text: 'text-accent-green', color: '#22C55E' },
  blue: { bg: 'bg-accent-blue-dim', text: 'text-accent-blue', color: '#3B82F6' },
  amber: { bg: 'bg-accent-amber-dim', text: 'text-accent-amber', color: '#F59E0B' },
  red: { bg: 'bg-accent-red-dim', text: 'text-accent-red', color: '#EF4444' },
  purple: { bg: 'bg-accent-purple-dim', text: 'text-accent-purple', color: '#A855F7' },
};

export function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  subtext,
  trend,
  accent = 'green',
  progress,
  className = '',
  delay = 0,
}: StatCardProps) {
  const acc = accentMap[accent];

  return (
    <motion.div
      className={`card p-4 flex flex-col gap-3 ${className}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg ${acc.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={17} className={acc.text} />
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trend.value >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {trend.value >= 0 ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>

      <div>
        <div className="flex items-end gap-1">
          <span className={`stat-number text-3xl text-text-primary`}>{value}</span>
          {unit && <span className="text-text-muted text-sm mb-1">{unit}</span>}
        </div>
        <p className="text-xs text-text-muted mt-0.5">{label}</p>
      </div>

      {progress !== undefined && (
        <div className="mt-auto">
          <div className="flex items-center justify-between mb-1.5">
            {subtext && <span className="text-2xs text-text-muted">{subtext}</span>}
            <span className={`text-2xs ${acc.text} ml-auto`}>{Math.round(progress)}%</span>
          </div>
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: acc.color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ delay: delay + 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
