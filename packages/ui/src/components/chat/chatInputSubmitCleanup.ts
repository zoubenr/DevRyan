type ComposerTextarea = Pick<HTMLTextAreaElement, "value">

export type ClearSubmittedComposerOptions = {
  queuedOnly: boolean
  attachedFilesCount: number
  textarea: ComposerTextarea | null
  clearPendingInputText: () => void
  clearPendingDraftPersist: () => void
  setMessage: (value: string) => void
  clearConfirmedMentions: () => void
  clearDraftTarget: () => void
  setHistoryIndex: (value: number) => void
  setDraftMessage: (value: string) => void
  clearAttachedFiles: () => void
  setExpandedInput: (value: boolean) => void
}

export const clearSubmittedComposerAfterSend = (options: ClearSubmittedComposerOptions): void => {
  if (options.queuedOnly) {
    return
  }

  options.clearPendingInputText()
  options.clearPendingDraftPersist()
  options.setMessage("")

  if (options.textarea) {
    options.textarea.value = ""
  }

  options.clearConfirmedMentions()
  options.clearDraftTarget()
  options.setHistoryIndex(-1)
  options.setDraftMessage("")

  if (options.attachedFilesCount > 0) {
    options.clearAttachedFiles()
  }

  options.setExpandedInput(false)
}
