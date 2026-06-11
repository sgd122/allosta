import { type Tone, toneFill } from './tone';

type Props = {
  /** Progress as a percentage 0–100. Clamped into range. */
  percent: number;
  tone?: Tone;
  /** Track height in px. Defaults to 6. */
  height?: number;
  /** Track background class. Defaults to a neutral gray track. */
  trackClassName?: string;
  className?: string;
};

/**
 * Thin progress/meter bar. Replaces the repeated inline `var(--gray-4)` track +
 * `var(--{tone}-9)` fill blocks (conversion bar, funnel steps).
 */
export function Meter({
  percent,
  tone = 'teal',
  height = 6,
  trackClassName = 'bg-gray-4',
  className = '',
}: Props) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div
      aria-hidden="true"
      className={`w-full overflow-hidden rounded-full ${trackClassName} ${className}`}
      style={{ height }}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-[600ms] ease-out-expo ${toneFill[tone]}`}
        style={{ width: `${width}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
