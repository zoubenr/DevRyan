const WIDE_CHAT_LAYOUT_CLASS = 'wide-chat-layout';

export const applyWideChatLayoutClass = (root: HTMLElement, enabled: boolean): void => {
  root.classList.toggle(WIDE_CHAT_LAYOUT_CLASS, enabled);
};

export const clearWideChatLayoutClass = (root: HTMLElement): void => {
  root.classList.remove(WIDE_CHAT_LAYOUT_CLASS);
};
