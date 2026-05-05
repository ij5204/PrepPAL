import { motion } from 'framer-motion';
import { TrendingUp, Flame, Zap, Trophy, Target, Calendar, Brain } from 'lucide-react';
import { PrepAreaChart, PrepBarChart, PrepLineChart } from '../components/ui/AnalyticsChart';
import { mockWeeklyCalories, mockWeeklyProtein, mockWeightProgress, mockStats, mockToday } from '../data/mockData';

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  accent?: string;
  delay?: number;
}

function MetricCard({ icon: Icon, label, value, unit, subtitle, accent = 'text-accent-green', delay = 0 }: MetricCardProps) {
  return (
    <motion.div
      className="card p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className={accent} />
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className={`stat-number text-4xl ${accent}`}>{value}</span>
        {unit && <span className="text-text-muted text-sm mb-1">{unit}</span>}
      </div>
      {subtitle && <p className="text-xs text-text-muted mt-1">{subtitle}</p>}
    </motion.div>
  );
}

function ChartCard({ title, subtitle, children, delay = 0 }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      className="card p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </motion.div>
  );
}

function ConsistencyRing({ score }: { score: number }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);

  return (
    <div className="relative inline-flex items-center justify-center w-28 h-28">
      <svg width={112} height={112} viewBox="0 0 112 112" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={56} cy={56} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
        <motion.circle
          cx={56} cy={56} r={r} fill="none"
          stroke="#22C55E" strokeWidth={10} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ delay: 0.3, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: 'drop-shadow(0 0 6px rgba(34,197,94,0.5))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="stat-number text-2xl text-text-primary">{score}%</span>
        <span className="text-2xs text-text-muted">score</span>
      </div>
    </div>
  );
}

export function ProgressPage() {
  return (
    <div className="px-4 md:px-6 pt-4 pb-24 md:pb-8 max-w-6xl mx-auto">

      {/* Page header */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-xl font-bold font-display text-text-primary">Your Progress</h2>
        <p className="text-sm text-text-muted mt-0.5">7-day overview · Week of May 4</p>
      </motion.div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          icon={Flame}
          label="Avg. daily calories"
          value={mockStats.weeklyAvgCalories.toLocaleString()}
          unit="kcal"
          subtitle="vs 1,800 target"
          accent="text-accent-amber"
          delay={0}
        />
        <MetricCard
          icon={Zap}
          label="Avg. protein"
          value={mockStats.weeklyAvgProtein}
          unit="g"
          subtitle="vs 130g target"
          accent="text-accent-blue"
          delay={0.05}
        />
        <MetricCard
          icon={Trophy}
          label="Streak"
          value={mockToday.streak}
          unit="days"
          subtitle="Personal best: 21"
          accent="text-accent-green"
          delay={0.1}
        />
        <MetricCard
          icon={Target}
          label="Goal completion"
          value={mockStats.goalCompletion}
          unit="%"
          subtitle="of daily targets hit"
          accent="text-accent-purple"
          delay={0.15}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Calorie Trend" subtitle="Daily intake vs 1,800 kcal target" delay={0.05}>
          <PrepBarChart
            data={mockWeeklyCalories}
            dataKey="calories"
            secondDataKey="target"
            secondColor="rgba(255,255,255,0.05)"
            color="#22C55E"
            unit=" kcal"
            height={180}
          />
        </ChartCard>

        <ChartCard title="Protein Trend" subtitle="Daily protein intake vs 130g target" delay={0.1}>
          <PrepAreaChart
            data={mockWeeklyProtein}
            dataKey="protein"
            color="#3B82F6"
            unit="g"
            referenceValue={130}
            height={180}
          />
        </ChartCard>
      </div>

      {/* Weight + Consistency row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <ChartCard title="Weight Progress" subtitle="kg · Last 5 weeks" delay={0.15}>
            <div className="flex items-center gap-4 mb-4">
              <div>
                <p className="text-xs text-text-muted">Current</p>
                <p className="stat-number text-2xl text-text-primary">62.4<span className="text-sm font-normal text-text-muted ml-1">kg</span></p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-xs text-text-muted">Goal</p>
                <p className="stat-number text-2xl text-accent-green">58.0<span className="text-sm font-normal text-text-muted ml-1">kg</span></p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-xs text-text-muted">Lost so far</p>
                <p className="stat-number text-2xl text-accent-green">1.8<span className="text-sm font-normal text-text-muted ml-1">kg</span></p>
              </div>
            </div>
            <PrepLineChart
              data={mockWeightProgress}
              dataKey="weight"
              xKey="date"
              color="#3B82F6"
              unit="kg"
              height={160}
            />
          </ChartCard>
        </div>

        {/* Consistency */}
        <motion.div
          className="card p-5 flex flex-col"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-sm font-semibold text-text-primary mb-1">Consistency Score</h3>
          <p className="text-xs text-text-muted mb-5">Based on logging + goal completion</p>

          <div className="flex items-center justify-center flex-1 mb-5">
            <ConsistencyRing score={mockStats.consistencyScore} />
          </div>

          <div className="space-y-2">
            {[
              { label: 'Days logged', value: '6/7', color: 'bg-accent-green' },
              { label: 'Goal hit', value: '5/7', color: 'bg-accent-blue' },
              { label: 'Streak days', value: `${mockToday.streak}`, color: 'bg-accent-amber' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-1.5 border-t border-border first:border-0">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span className="text-xs text-text-muted">{item.label}</span>
                </div>
                <span className="text-xs font-semibold text-text-primary tabular">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* AI Insight */}
      <motion.div
        className="card p-5 border border-accent-blue/20 bg-accent-blue-dim/10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-blue/20 flex items-center justify-center flex-shrink-0">
            <Brain size={17} className="text-accent-blue" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary mb-1">AI Weekly Insight</p>
            <p className="text-sm text-text-secondary leading-relaxed">
              You're tracking well — your protein average is 8% below target. Try adding a protein shake or extra chicken to Saturday's meals.
              Your consistency score improved by <span className="text-accent-green font-medium">+12 points</span> vs last week.
              Keep your streak going — you're <span className="text-accent-amber font-medium">7 days</span> away from your personal best.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
