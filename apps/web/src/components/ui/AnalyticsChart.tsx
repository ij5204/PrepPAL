import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
  unit?: string;
}

function CustomTooltip({ active, payload, label, unit = '' }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-elevated border border-border-strong rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.value}{unit}
        </p>
      ))}
    </div>
  );
}

interface AreaChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  color?: string;
  unit?: string;
  height?: number;
  referenceValue?: number;
}

export function PrepAreaChart({
  data, dataKey, xKey = 'day', color = '#22C55E', unit = '', height = 160, referenceValue,
}: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
        {referenceValue && (
          <ReferenceLine y={referenceValue} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
        )}
        <XAxis dataKey={xKey} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${dataKey})`}
          dot={false}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface BarChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  color?: string;
  secondDataKey?: string;
  secondColor?: string;
  unit?: string;
  height?: number;
}

export function PrepBarChart({
  data, dataKey, xKey = 'day', color = '#22C55E', secondDataKey, secondColor = 'rgba(255,255,255,0.06)', unit = '', height = 160,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barSize={16} barGap={2}>
        <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        {secondDataKey && <Bar dataKey={secondDataKey} fill={secondColor} radius={[4, 4, 0, 0]} />}
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface LineChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  color?: string;
  unit?: string;
  height?: number;
}

export function PrepLineChart({ data, dataKey, xKey = 'date', color = '#3B82F6', unit = '', height = 160 }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id={`line-grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
        <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
