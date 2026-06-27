const SPIN_DURATION_MS = 4000;
const INITIAL_PHASE_MS = Date.now() % SPIN_DURATION_MS;

const SYNCED_STYLE: React.CSSProperties = {
  animationName: 'webkit-spin',
  animationDuration: `${SPIN_DURATION_MS}ms`,
  animationDelay: `-${INITIAL_PHASE_MS}ms`,
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
  willChange: 'transform',
};

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = CIRCUMFERENCE * 0.65;
const GAP_LENGTH = CIRCUMFERENCE - ARC_LENGTH;

type SidebarSpinnerProps = {
  'aria-label'?: string;
  title?: string;
};

export function SidebarSpinner({ 'aria-label': ariaLabel, title }: SidebarSpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-[0.7rem] w-[0.7rem]"
      style={SYNCED_STYLE}
      aria-label={ariaLabel}
      role="img"
    >
      {title && <title>{title}</title>}
      <circle
        cx="12"
        cy="12"
        r={RADIUS}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${ARC_LENGTH} ${GAP_LENGTH}`}
        className="text-muted-foreground"
      />
    </svg>
  );
}
