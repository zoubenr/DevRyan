export const RIGHT_SIDEBAR_AUTO_CLOSE_WIDTH = 1140;
export const RIGHT_SIDEBAR_AUTO_OPEN_WIDTH = 1220;
export const BOTTOM_TERMINAL_AUTO_CLOSE_HEIGHT = 640;
export const BOTTOM_TERMINAL_AUTO_OPEN_HEIGHT = 700;

export type ResponsivePanelAction = 'close' | 'open' | 'none';

export interface ResponsivePanelState {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isRightSidebarOpen: boolean;
  isBottomTerminalOpen: boolean;
  rightSidebarAutoClosed: boolean;
  bottomTerminalAutoClosed: boolean;
}

export interface ResponsivePanelDecision {
  rightSidebarAction: ResponsivePanelAction;
  rightSidebarAutoClosed: boolean;
  bottomTerminalAction: ResponsivePanelAction;
  bottomTerminalAutoClosed: boolean;
}

export interface ResponsivePanelVisibilityChangeState {
  autoClosed: boolean;
  didVisibilityChange: boolean;
  isResponsiveChange: boolean;
}

export const getAutoClosedAfterPanelVisibilityChange = ({
  autoClosed,
  didVisibilityChange,
  isResponsiveChange,
}: ResponsivePanelVisibilityChangeState): boolean => {
  if (!didVisibilityChange || isResponsiveChange) {
    return autoClosed;
  }

  return false;
};

export const getResponsivePanelDecision = ({
  width,
  height,
  isMobile,
  isTablet,
  isRightSidebarOpen,
  isBottomTerminalOpen,
  rightSidebarAutoClosed,
  bottomTerminalAutoClosed,
}: ResponsivePanelState): ResponsivePanelDecision => {
  let rightSidebarAction: ResponsivePanelAction = 'none';
  let nextRightSidebarAutoClosed = rightSidebarAutoClosed;

  if (width < RIGHT_SIDEBAR_AUTO_CLOSE_WIDTH) {
    if (isRightSidebarOpen) {
      rightSidebarAction = 'close';
      nextRightSidebarAutoClosed = true;
    }
  } else if (width >= RIGHT_SIDEBAR_AUTO_OPEN_WIDTH && rightSidebarAutoClosed) {
    rightSidebarAction = 'open';
    nextRightSidebarAutoClosed = false;
  }

  let bottomTerminalAction: ResponsivePanelAction = 'none';
  let nextBottomTerminalAutoClosed = bottomTerminalAutoClosed;

  // Touch keyboards resize the visual viewport frequently, so keep bottom-terminal
  // auto-collapse desktop-only rather than treating mobile viewport churn as intent.
  if (!isMobile && !isTablet) {
    if (height < BOTTOM_TERMINAL_AUTO_CLOSE_HEIGHT) {
      if (isBottomTerminalOpen) {
        bottomTerminalAction = 'close';
        nextBottomTerminalAutoClosed = true;
      }
    } else if (height >= BOTTOM_TERMINAL_AUTO_OPEN_HEIGHT && bottomTerminalAutoClosed) {
      bottomTerminalAction = 'open';
      nextBottomTerminalAutoClosed = false;
    }
  }

  return {
    rightSidebarAction,
    rightSidebarAutoClosed: nextRightSidebarAutoClosed,
    bottomTerminalAction,
    bottomTerminalAutoClosed: nextBottomTerminalAutoClosed,
  };
};
