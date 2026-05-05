import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Package, Sparkles, TrendingUp, User } from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/pantry', label: 'Pantry', icon: Package },
  { path: '/meals', label: 'AI', icon: Sparkles },
  { path: '/progress', label: 'Progress', icon: TrendingUp },
  { path: '/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  return (
    <div className="fixed bottom-0 inset-x-0 z-30 md:hidden glass border-t border-border safe-bottom">
      <nav className="flex items-center justify-around px-2 pt-2 pb-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all min-w-0"
            >
              {({ isActive }) => (
                <>
                  <div className={`relative flex items-center justify-center w-10 h-7 rounded-lg transition-all duration-200 ${isActive ? 'bg-accent-green-dim' : ''}`}>
                    <Icon size={20} className={isActive ? 'text-accent-green' : 'text-text-muted'} />
                    {isActive && item.label === 'AI' && (
                      <motion.div
                        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent-green"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                      />
                    )}
                  </div>
                  <span className={`text-2xs font-medium transition-colors ${isActive ? 'text-accent-green' : 'text-text-dim'}`}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
