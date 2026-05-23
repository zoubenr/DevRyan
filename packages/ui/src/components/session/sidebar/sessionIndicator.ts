import type { PlanIndicatorState } from '@/sync/plan-indicator';

export type SessionIndicator = {
  className: string;
  labelKey:
    | 'sessions.sidebar.session.status.unread'
    | 'sessions.sidebar.session.status.completed'
    | 'sessions.sidebar.session.status.questionRequired'
    | 'sessions.sidebar.session.status.planReady'
    | 'sessions.sidebar.session.status.planCompleted';
};

type ResolveSidebarIndicatorOptions = {
  isRootSession: boolean;
  isWorking: boolean;
  hasUnreadStatus: boolean;
  hasUnreadCompletion: boolean;
  pendingQuestionCount: number;
  planState: PlanIndicatorState | null;
};

type ResolveSidebarWorkingStatusOptions = {
  isWorking: boolean;
  pendingQuestionCount: number;
};

const QUESTION_REQUIRED_INDICATOR: SessionIndicator = {
  className: 'bg-status-info',
  labelKey: 'sessions.sidebar.session.status.questionRequired',
};

const PLAN_READY_INDICATOR: SessionIndicator = {
  className: 'bg-status-warning',
  labelKey: 'sessions.sidebar.session.status.planReady',
};

const PLAN_COMPLETED_INDICATOR: SessionIndicator = {
  className: 'bg-status-success',
  labelKey: 'sessions.sidebar.session.status.planCompleted',
};

export function resolveSidebarWorkingStatus({
  isWorking,
  pendingQuestionCount,
}: ResolveSidebarWorkingStatusOptions): boolean {
  if (pendingQuestionCount > 0) return false;
  return isWorking;
}

export function resolveSidebarIndicator({
  isRootSession,
  isWorking,
  hasUnreadStatus,
  hasUnreadCompletion,
  pendingQuestionCount,
  planState,
}: ResolveSidebarIndicatorOptions): SessionIndicator | null {
  if (!isRootSession) return null;

  if (pendingQuestionCount > 0) {
    return QUESTION_REQUIRED_INDICATOR;
  }

  if (isWorking) return null;

  if (planState === 'proposed') {
    return PLAN_READY_INDICATOR;
  }

  if (!hasUnreadStatus) return null;

  if (hasUnreadCompletion) {
    return PLAN_COMPLETED_INDICATOR;
  }

  return null;
}
