import { describe, expect, test } from 'bun:test'

import {
  getChatOwnedDiffTotalsFromMessages,
  normalizeChatOwnedDiffSummary,
  stripUntrustedSessionDiffSummary,
} from './sessionDiffStats'

describe('sessionDiffStats', () => {
  test('derives chat-owned totals from user message summaries only', () => {
    expect(getChatOwnedDiffTotalsFromMessages([
      { role: 'assistant', summary: { additions: 100, deletions: 50 } },
      { role: 'user', summary: { diffs: [{ additions: 2, deletions: 1 }, { additions: '3', deletions: '4' }] } },
      { role: 'user', summary: { additions: 5, deletions: 0 } },
    ])).toEqual({ additions: 5, deletions: 5 })
  })

  test('ignores bare user summary totals that are not scoped to diff entries', () => {
    const session = { id: 'ses_1', summary: undefined }

    expect(normalizeChatOwnedDiffSummary(session, [
      { role: 'user', summary: { additions: 1, deletions: 15465 } },
    ])).toEqual({ id: 'ses_1' })
  })

  test('keeps valid scoped diff entries from user message summaries', () => {
    expect(getChatOwnedDiffTotalsFromMessages([
      { role: 'user', summary: { diffs: [{ additions: 1, deletions: 0 }, { additions: 2, deletions: 3 }] } },
    ])).toEqual({ additions: 3, deletions: 3 })
  })

  test('removes stale session-level diff fields when chat messages have no scoped diffs', () => {
    const session = {
      id: 'ses_1',
      summary: {
        title: 'Preserved title',
        additions: 95,
        deletions: 3,
        files: 2,
        diffs: [{ additions: 95, deletions: 3 }],
      },
    }

    expect(normalizeChatOwnedDiffSummary(session, [{ role: 'user' }])).toEqual({
      id: 'ses_1',
      summary: { title: 'Preserved title' },
    })
  })

  test('strips untrusted session-level diff fields while preserving summary metadata', () => {
    const session = {
      id: 'ses_1',
      summary: {
        title: 'Preserved title',
        additions: 95,
        deletions: 3,
        files: 2,
        diffs: [{ additions: 95, deletions: 3 }],
      },
    }

    expect(stripUntrustedSessionDiffSummary(session)).toEqual({
      id: 'ses_1',
      summary: { title: 'Preserved title' },
    })
  })

  test('strips untrusted session-list snapshot totals even when no metadata remains', () => {
    const session = {
      id: 'ses_1',
      summary: {
        additions: 95,
        deletions: 3,
        files: 2,
        diffs: [{ additions: 95, deletions: 3 }],
      },
    }

    expect(stripUntrustedSessionDiffSummary(session)).toEqual({ id: 'ses_1' })
  })

  test('preserves object identity when chat-owned totals are already normalized', () => {
    const session = {
      id: 'ses_1',
      summary: { title: 'Preserved title', additions: 2, deletions: 1 },
    }

    expect(normalizeChatOwnedDiffSummary(session, [
      { role: 'user', summary: { diffs: [{ additions: 2, deletions: 1 }] } },
    ])).toBe(session)
  })
})
