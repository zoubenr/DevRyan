import { describe, expect, test } from 'bun:test';
import { resolveSidebarIndicator, resolveSidebarWorkingStatus } from './sessionIndicator';

const baseOptions = {
  isRootSession: true,
  isWorking: false,
  hasUnreadStatus: false,
  hasUnreadCompletion: false,
  pendingQuestionCount: 0,
  planState: null,
};

describe('resolveSidebarIndicator', () => {
  test('keeps a proposed plan indicator visible after the chat is viewed', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: false,
      planState: 'proposed',
    })).toEqual({
      className: 'bg-status-warning',
      labelKey: 'sessions.sidebar.session.status.planReady',
    });
  });

  test('turns off the orange plan indicator once implementation is requested', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: false,
      planState: 'implementing',
    })).toBeNull();
  });

  test('hides completed plan state after completion is read', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      planState: 'completed',
    })).toBeNull();
  });

  test('shows completed plan green only while completion is unread', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: true,
      hasUnreadCompletion: true,
      planState: 'completed',
    })).toEqual({
      className: 'bg-status-success',
      labelKey: 'sessions.sidebar.session.status.planCompleted',
    });

    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: true,
      hasUnreadCompletion: false,
      planState: 'completed',
    })).toBeNull();
  });

  test('keeps unread completion green for non-plan completion notifications', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: true,
      hasUnreadCompletion: true,
    })).toEqual({
      className: 'bg-status-success',
      labelKey: 'sessions.sidebar.session.status.planCompleted',
    });
  });

  test('shows green again for a later unread completion in the same chat', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: false,
      hasUnreadCompletion: false,
      planState: 'completed',
    })).toBeNull();

    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: true,
      hasUnreadCompletion: true,
      planState: 'completed',
    })).toEqual({
      className: 'bg-status-success',
      labelKey: 'sessions.sidebar.session.status.planCompleted',
    });
  });

  test('keeps question required indicator durable until answered', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      pendingQuestionCount: 1,
    })).toEqual({
      className: 'bg-status-info',
      labelKey: 'sessions.sidebar.session.status.questionRequired',
    });

    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: true,
      pendingQuestionCount: 1,
    })).toEqual({
      className: 'bg-status-info',
      labelKey: 'sessions.sidebar.session.status.questionRequired',
    });
  });

  test('shows question required indicator even while session is working', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      isWorking: true,
      pendingQuestionCount: 1,
    })).toEqual({
      className: 'bg-status-info',
      labelKey: 'sessions.sidebar.session.status.questionRequired',
    });
  });

  test('question required indicator wins over proposed plan state', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      pendingQuestionCount: 1,
      planState: 'proposed',
    })).toEqual({
      className: 'bg-status-info',
      labelKey: 'sessions.sidebar.session.status.questionRequired',
    });
  });

  test('question required indicator wins over unread completion state', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: true,
      hasUnreadCompletion: true,
      pendingQuestionCount: 1,
    })).toEqual({
      className: 'bg-status-info',
      labelKey: 'sessions.sidebar.session.status.questionRequired',
    });
  });

  test('shows completion green for implementing sessions only when unread completion exists', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: false,
      hasUnreadCompletion: true,
      planState: 'implementing',
    })).toBeNull();

    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: true,
      hasUnreadCompletion: true,
      planState: 'implementing',
    })).toEqual({
      className: 'bg-status-success',
      labelKey: 'sessions.sidebar.session.status.planCompleted',
    });
  });

  test('hides root indicators while the session is actively working', () => {
    expect(resolveSidebarIndicator({
      ...baseOptions,
      isWorking: true,
      planState: 'proposed',
    })).toBeNull();
  });

  test('yellow plan indicator persists across viewed/unread variations until implementation begins', () => {
    const expected = {
      className: 'bg-status-warning',
      labelKey: 'sessions.sidebar.session.status.planReady',
    };

    // Just finished composing, unread.
    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: true,
      planState: 'proposed',
    })).toEqual(expected);

    // User opens the session — viewed, unread cleared. Still yellow.
    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: false,
      planState: 'proposed',
    })).toEqual(expected);

    // User navigates away and back; same proposed state, still yellow.
    expect(resolveSidebarIndicator({
      ...baseOptions,
      hasUnreadStatus: false,
      hasUnreadCompletion: false,
      planState: 'proposed',
    })).toEqual(expected);

    // Only "Implement Plan" click should clear it.
    expect(resolveSidebarIndicator({
      ...baseOptions,
      planState: 'implementing',
    })).toBeNull();
  });

  test('suppresses sidebar working display while questions are pending', () => {
    expect(resolveSidebarWorkingStatus({
      isWorking: true,
      pendingQuestionCount: 1,
    })).toBe(false);

    expect(resolveSidebarWorkingStatus({
      isWorking: true,
      pendingQuestionCount: 0,
    })).toBe(true);

    expect(resolveSidebarWorkingStatus({
      isWorking: false,
      pendingQuestionCount: 1,
    })).toBe(false);
  });
});
