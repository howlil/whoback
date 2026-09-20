export function MetricCard({ value, label, tone = 'neutral' }: { value: number | string; label: string; tone?: 'neutral' | 'positive' | 'danger' | 'warn' }) {
  const toneClass = {
    neutral: 'bg-[#f7f7fa] text-ink',
    positive: 'bg-positive-soft text-positive',
    danger: 'bg-danger-soft text-danger',
    warn: 'bg-warn-soft text-warn',
  }[tone];
  const display = typeof value === 'number' ? value.toLocaleString() : value;
  return <div className={`rounded-xl p-3 ${toneClass}`}>
    <div className="text-xl font-semibold tracking-[-0.03em] tabular-nums">{display}</div>
    <div className="mt-0.5 text-[11px] font-medium leading-tight opacity-80">{label}</div>
  </div>;
}
