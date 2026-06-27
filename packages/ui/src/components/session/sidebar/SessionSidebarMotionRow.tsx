import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { SESSION_LEADING_INDICATOR_CLIP_GUTTER_PX } from './sessionIndicator';

type SessionSidebarMotionRowProps = {
  children: React.ReactNode;
};

const rowEase = [0.33, 1, 0.68, 1] as const;

const rowTransition = {
  // Keep the reflow (layout) and the collapse (height) on the same duration so
  // siblings settle into place at the same instant the row finishes closing.
  // Two mover-properties ending at different times is what reads as a hitch at
  // the tail of the animation.
  layout: {
    type: 'tween',
    // easeOutCubic: quick start, gentle settle. Reads smoother than a
    // critically-damped spring (which has a slow asymptotic tail) for
    // the row reflow on archive/restore.
    duration: 0.17,
    ease: rowEase,
  },
  height: {
    type: 'tween',
    duration: 0.17,
    ease: rowEase,
  },
  // Fade out ahead of the collapse so the row is already invisible before it
  // squeezes shut — clipping shrinking text mid-collapse is what makes the
  // motion look low-framerate even when frames aren't actually dropped.
  opacity: {
    type: 'tween',
    duration: 0.1,
    ease: rowEase,
  },
} as const;

export function SessionSidebarMotionRow({ children }: SessionSidebarMotionRowProps): React.ReactElement {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      layout="position"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={rowTransition}
      style={{
        overflow: 'hidden',
        // Keep leading session indicators inside this wrapper's clipping box
        // while still clipping vertically during the height-collapse animation.
        marginLeft: -SESSION_LEADING_INDICATOR_CLIP_GUTTER_PX,
        paddingLeft: SESSION_LEADING_INDICATOR_CLIP_GUTTER_PX,
      }}
    >
      {children}
    </motion.div>
  );
}
