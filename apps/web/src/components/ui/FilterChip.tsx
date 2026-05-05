import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  icon?: LucideIcon;
  count?: number;
}

export function FilterChip({ label, active = false, onClick, icon: Icon, count }: FilterChipProps) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 flex-shrink-0 cursor-pointer outline-none
        ${active
          ? 'bg-accent-green text-bg border-accent-green'
          : 'bg-surface-elevated text-text-secondary border-border hover:border-border-strong hover:text-text-primary'
        }
      `}
    >
      {Icon && <Icon size={12} className={active ? 'text-bg' : ''} />}
      {label}
      {count !== undefined && (
        <span className={`text-2xs px-1.5 py-0.5 rounded-full ${active ? 'bg-bg/20 text-bg' : 'bg-white/10 text-text-muted'}`}>
          {count}
        </span>
      )}
    </motion.button>
  );
}
