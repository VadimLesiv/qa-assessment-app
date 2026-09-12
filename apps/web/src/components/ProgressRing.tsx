interface ProgressRingProps {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  /** Hide the centre label on very small rings where it would not fit. */
  showLabel?: boolean;
  label?: string;
}

/**
 * Circular progress indicator drawn with a stroke-dashoffset trick: the circle's
 * dash pattern is set to its full circumference, then offset by the unfinished
 * fraction so the visible arc matches the percentage.
 */
export function ProgressRing({
  percent,
  size = 56,
  stroke = 6,
  color = 'var(--accent-bright)',
  showLabel = true,
  label,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className="ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${clamped}% complete`}
    >
      <svg width={size} height={size}>
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {showLabel && (
        <span className="ring-label" style={{ fontSize: size * 0.26 }}>
          {clamped}
          <span style={{ fontSize: size * 0.16 }}>%</span>
        </span>
      )}
    </div>
  );
}
