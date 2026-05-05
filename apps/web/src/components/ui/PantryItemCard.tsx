import { motion } from 'framer-motion';
import { AlertTriangle, AlertCircle, CheckCircle, Edit3, Trash2 } from 'lucide-react';

export interface PantryItem {
  id: string;
  name: string;
  quantity: string;
  category: string;
  expiryDays: number;
  expiryStatus: 'good' | 'warning' | 'critical';
  calories: number;
  protein: number;
}

interface PantryItemCardProps {
  item: PantryItem;
  onEdit?: (item: PantryItem) => void;
  onDelete?: (item: PantryItem) => void;
  delay?: number;
}

const categoryColors: Record<string, string> = {
  Protein: 'badge-blue',
  Carbs: 'badge-amber',
  Dairy: 'badge-purple',
  Produce: 'badge-green',
  Snacks: 'badge-red',
};

const expiryConfig = {
  good: { icon: CheckCircle, color: 'text-accent-green', label: (d: number) => `${d}d left` },
  warning: { icon: AlertTriangle, color: 'text-accent-amber', label: (d: number) => `${d}d left` },
  critical: { icon: AlertCircle, color: 'text-accent-red', label: (d: number) => `${d}d left — use soon` },
};

export function PantryItemCard({ item, onEdit, onDelete, delay = 0 }: PantryItemCardProps) {
  const expiry = expiryConfig[item.expiryStatus];
  const ExpiryIcon = expiry.icon;
  const borderAccent = item.expiryStatus === 'critical' ? 'border-accent-red/30' : item.expiryStatus === 'warning' ? 'border-accent-amber/20' : 'border-border';

  return (
    <motion.div
      className={`card p-4 border ${borderAccent} group relative overflow-hidden transition-all duration-200 hover:shadow-card-hover`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {item.expiryStatus === 'critical' && (
        <div className="absolute inset-0 bg-accent-red/3 pointer-events-none" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-sm font-semibold text-text-primary truncate">{item.name}</p>
            <span className={`${categoryColors[item.category] || 'badge-blue'} text-2xs flex-shrink-0`}>
              {item.category}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-text-secondary font-medium">{item.quantity}</span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1 text-xs">
              <ExpiryIcon size={11} className={expiry.color} />
              <span className={expiry.color}>{expiry.label(item.expiryDays)}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
          <button
            onClick={() => onEdit?.(item)}
            className="w-7 h-7 rounded-md flex items-center justify-center bg-surface-elevated border border-border hover:border-border-strong text-text-muted hover:text-text-primary transition-all"
          >
            <Edit3 size={12} />
          </button>
          <button
            onClick={() => onDelete?.(item)}
            className="w-7 h-7 rounded-md flex items-center justify-center bg-surface-elevated border border-border hover:border-accent-red/50 hover:bg-accent-red-dim text-text-muted hover:text-accent-red transition-all"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
