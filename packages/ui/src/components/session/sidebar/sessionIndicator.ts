import type { PlanIndicatorState } from '@/sync/plan-indicator';

export type SessionIndicator = {
  className: string;
  labelKey:
    | 'sessions.sidebar.session.status.unread'
    | 'sessions.sidebar.session.status.completed'
    | 'sessions.sidebar.session.status.questionRequired'
    | 'sessions.sidebar.session.status.planReady'
    | 'sessions.sidebar.session.status.planCompleted'
    | 'sessions.sidebar.session.status.error';
};

type ResolveSidebarIndicatorOptions = {
  isRootSession: boolean;
  isWorking: boolean;
  hasUnreadStatus: boolean;
  hasUnreadCompletion: boolean;
  hasCompletedStatus: boolean;
  hasErrorStatus: boolean;
  pendingQuestionCount: number;
  planState: PlanIndicatorState | null;
};

type ResolveSidebarWorkingStatusOptions = {
  isWorking: boolean;
  pendingQuestionCount: number;
};

type ResolveSubtaskSidebarIndicatorOptions = {
  isRootSession: boolean;
  notifyOnSubtasks: boolean;
  isWorking: boolean;
  isActive: boolean;
  hasUnreadCompletion: boolean;
  hasUnreadError: boolean;
};

type ResolveLeadingIndicatorPositionOptions = {
  hasChildren: boolean;
  showLeadingStatus: boolean;
  isPinnedSession: boolean;
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

const ERROR_INDICATOR: SessionIndicator = {
  className: 'bg-status-error',
  labelKey: 'sessions.sidebar.session.status.error',
};

const SESSION_COMPLETED_INDICATOR: SessionIndicator = {
  className: 'bg-status-success',
  labelKey: 'sessions.sidebar.session.status.completed',
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
  hasCompletedStatus,
  hasErrorStatus,
  pendingQuestionCount,
  planState,
}: ResolveSidebarIndicatorOptions): SessionIndicator | null {
  if (!isRootSession) return null;

  if (pendingQuestionCount > 0) {
    return QUESTION_REQUIRED_INDICATOR;
  }

  if (isWorking) return null;

  if (hasErrorStatus) {
    return ERROR_INDICATOR;
  }

  if (planState === 'proposed') {
    return PLAN_READY_INDICATOR;
  }

  if (planState === 'completed') {
    return PLAN_COMPLETED_INDICATOR;
  }

  if (hasCompletedStatus) {
    return SESSION_COMPLETED_INDICATOR;
  }

  return null;
}

export function resolveSubtaskSidebarIndicator({
  isRootSession,
  notifyOnSubtasks,
  isWorking,
  isActive,
  hasUnreadCompletion,
  hasUnreadError,
}: ResolveSubtaskSidebarIndicatorOptions): SessionIndicator | null {
  if (isRootSession || !notifyOnSubtasks || isWorking || isActive) return null;
  if (hasUnreadError) return ERROR_INDICATOR;
  if (hasUnreadCompletion) return SESSION_COMPLETED_INDICATOR;
  return null;
}

export function resolveLeadingIndicatorPositionClasses({
  hasChildren,
  showLeadingStatus,
  isPinnedSession,
}: ResolveLeadingIndicatorPositionOptions): string {
  if (showLeadingStatus && isPinnedSession) return 'left-[-34px] w-6';
  if (showLeadingStatus) return 'left-[-24px] w-3.5';
  if (hasChildren && isPinnedSession) return 'left-[-18px] w-3.5';
  return 'left-[-10px] w-3.5';
}
