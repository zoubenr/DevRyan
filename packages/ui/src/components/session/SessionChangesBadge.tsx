import type { SessionDiffStats } from '@/lib/sessionDiffStats';
import { cn } from '@/lib/utils';

type SessionChangesBadgeProps = {
  stats: SessionDiffStats;
  className?: string;
};

export function SessionChangesBadge({ stats, className }: SessionChangesBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[14px] flex-shrink-0 items-center gap-0 self-center align-middle typography-micro text-[10.5px] font-medium leading-none',
        className,
      )}
    >
      <span className="text-status-success">+{stats.additions}</span>
      <span className="px-1 text-muted-foreground/75">/</span>
      <span className="text-status-error">-{stats.deletions}</span>
    </span>
  );
}
