import React from 'react';

interface PlanCardSkeletonProps {
  lineCount?: number;
  className?: string;
  // Reserves vertical space so the card height doesn't pop when the skeleton
  // unmounts. Caller-supplied for layout reservation during streaming.
  minHeight?: number | string;
}

const PlanCardSkeleton: React.FC<PlanCardSkeletonProps> = ({ lineCount = 4, className, minHeight }) => {
  const style = minHeight !== undefined ? { minHeight } : undefined;
  return (
    <div
      className={`oc-plan-skeleton-lines flex flex-col gap-3${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={style}
    >
      {Array.from({ length: lineCount }, (_, index) => (
        <span className="oc-plan-skeleton-line" key={index} />
      ))}
    </div>
  );
};

export default PlanCardSkeleton;
