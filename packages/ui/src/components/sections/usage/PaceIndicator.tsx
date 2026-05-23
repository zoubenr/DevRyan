import React from 'react';
import { cn } from '@/lib/utils';
import type { PaceInfo } from '@/lib/quota';
import { getPaceStatusColor, formatRemainingTime, resolveUsageTone } from '@/lib/quota';
import { useI18n } from '@/lib/i18n';

interface PaceIndicatorProps {
  paceInfo: PaceInfo;
  className?: string;
  /** Compact mode shows just the status dot and prediction */
  compact?: boolean;
  displayMode?: 'usage' | 'remaining';
}

/**
 * Visual indicator showing whether usage is on track, slightly fast, or too fast.
 * Inspired by opencode-bar's pace visualization.
 */
export const PaceIndicator: React.FC<PaceIndicatorProps> = ({
  paceInfo,
  className,
  compact = false,
  displayMode = 'usage',
}) => {
  const { t } = useI18n();
  const statusColor = getPaceStatusColor(paceInfo.status);
  const displayedPredictionPercent = displayMode === 'remaining'
    ? Math.max(0, Math.min(100, 100 - paceInfo.predictedFinalPercent))
    : paceInfo.predictedFinalPercent;
  const isZeroPrediction = !paceInfo.isExhausted && Math.round(displayedPredictionPercent) === 0;
  const predictionTone = resolveUsageTone(displayedPredictionPercent);
  const predictionColor = paceInfo.isExhausted
    ? statusColor
    : isZeroPrediction
      ? 'var(--muted-foreground)'
    : predictionTone === 'critical'
      ? 'var(--status-error)'
      : predictionTone === 'warn'
        ? 'var(--status-warning)'
        : 'var(--status-success)';
  // Keep the visual indicator aligned with the prediction users are reading.
  // Status still drives the tooltip/label, while exhausted states preserve the
  // existing status/error color through predictionColor above.
  const indicatorColor = predictionColor;
  const predictionText = React.useMemo(() => {
    if (displayMode === 'usage') {
      return paceInfo.predictText;
    }

    // Remaining mode mirrors the displayed bar by converting projected used quota
    // into projected remaining quota while preserving the usage-based pace status.
    const remainingPercent = Math.max(0, Math.min(100, 100 - paceInfo.predictedFinalPercent));
    return `${Math.round(remainingPercent)}%`;
  }, [displayMode, paceInfo.predictText, paceInfo.predictedFinalPercent]);

  const statusLabel = React.useMemo(() => {
      switch (paceInfo.status) {
      case 'on-track':
        return t('settings.usage.pace.status.onTrack');
      case 'slightly-fast':
        return t('settings.usage.pace.status.slightlyFast');
      case 'too-fast':
        return t('settings.usage.pace.status.tooFast');
      case 'exhausted':
        return t('settings.usage.pace.status.usedUp');
      }
  }, [paceInfo.status, t]);

  const predictionTooltipKey = React.useMemo(() => {
    if (paceInfo.predictionConfidence === 'low') {
      return displayMode === 'remaining'
        ? 'settings.usage.pace.predictionRemainingLowConfidenceTooltip'
        : 'settings.usage.pace.predictionLowConfidenceTooltip';
    }
    return displayMode === 'remaining'
      ? 'settings.usage.pace.predictionRemainingTooltip'
      : 'settings.usage.pace.predictionTooltip';
  }, [displayMode, paceInfo.predictionConfidence]);

  const predictionTooltip = t(predictionTooltipKey, { prediction: predictionText });

  if (compact) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <div
          className="h-2 w-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: indicatorColor }}
          title={statusLabel}
        />
        <span
          className="typography-micro tabular-nums"
          style={{ color: predictionColor }}
          title={paceInfo.isExhausted ? undefined : predictionTooltip}
        >
          {paceInfo.isExhausted ? (
            <>{t('settings.usage.pace.wait', { duration: formatRemainingTime(paceInfo.remainingSeconds) })}</>
          ) : (
            <>{t('settings.usage.pace.prediction', { prediction: predictionText })}</>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <div className="flex items-center gap-1.5">
        {!paceInfo.isExhausted && (
          <span className="typography-micro text-muted-foreground">
            {t('settings.usage.pace.rate', { rate: paceInfo.paceRateText })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="typography-micro tabular-nums"
          style={{ color: predictionColor }}
        >
          {paceInfo.isExhausted ? (
            <>
              <span className="font-medium">{statusLabel}</span>
              <span className="text-muted-foreground">{t('settings.usage.pace.waitSeparator')}</span>
              <span className="font-medium">{formatRemainingTime(paceInfo.remainingSeconds)}</span>
            </>
          ) : (
            <span title={predictionTooltip}>
              <span className="text-muted-foreground">{t('settings.usage.pace.predictionLabel')}</span>
              <span className="font-medium">{predictionText}</span>
            </span>
          )}
        </span>
        <div
          className="h-2 w-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: indicatorColor }}
          title={statusLabel}
        />
      </div>
    </div>
  );
};
