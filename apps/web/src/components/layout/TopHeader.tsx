import { Bell, Search } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

interface TopHeaderProps {
  title?: string;
  subtitle?: string;
}

export function TopHeader({ title, subtitle }: TopHeaderProps) {
  const { profile } = useAuthStore();
  const initials = (profile?.name || 'U').slice(0, 2).toUpperCase();

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <header className="flex-shrink-0 h-14 border-b border-border bg-surface/50 backdrop-blur-sm flex items-center px-5 gap-4">
      <div className="flex-1 min-w-0">
        {title ? (
          <div>
            <h1 className="text-base font-bold font-display text-text-primary leading-tight">{title}</h1>
            {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
          </div>
        ) : (
          <p className="text-sm text-text-muted">{dateStr}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search…"
            className="w-44 bg-surface-elevated border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/40 focus:w-56 transition-all duration-200"
          />
        </div>

        <button className="btn-icon relative">
          <Bell size={16} className="text-text-secondary" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent-green" />
        </button>

        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {initials}
        </div>
      </div>
    </header>
  );
}
