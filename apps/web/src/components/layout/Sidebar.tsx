import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Package, Sparkles, TrendingUp, User,
  LogOut, ChevronRight, Zap,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

const navItems = [
  { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/pantry', label: 'Pantry', icon: Package },
  { path: '/meals', label: 'AI Meals', icon: Sparkles },
  { path: '/progress', label: 'Progress', icon: TrendingUp },
  { path: '/profile', label: 'Profile', icon: User },
];

interface SidebarProps {
  collapsed?: boolean;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const { signOut, profile } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <motion.aside
      className="h-full flex flex-col bg-surface border-r border-border"
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Brand */}
      <div className="px-4 py-5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent-green flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-bg" fill="currentColor" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-bold font-display text-text-primary leading-tight">PrepPAL</p>
              <p className="text-2xs text-text-muted">AI Nutrition</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive ? 'nav-item-active' : 'nav-item'
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} className={isActive ? 'text-text-primary' : 'text-text-muted'} />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && isActive && (
                    <ChevronRight size={14} className="ml-auto text-text-muted" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-2 py-4 border-t border-border flex-shrink-0 space-y-1">
        {!collapsed && profile && (
          <div className="px-3 py-2.5 mb-2">
            <p className="text-sm font-medium text-text-primary">{profile.name || 'User'}</p>
            <p className="text-xs text-text-muted">{profile.email || ''}</p>
          </div>
        )}
        <button onClick={handleSignOut} className="nav-item w-full text-accent-red/80 hover:text-accent-red hover:bg-accent-red-dim">
          <LogOut size={17} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </motion.aside>
  );
}
