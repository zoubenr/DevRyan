import { describe, expect, test } from "bun:test"
import {
  appendStreamingTextDelta,
  collapseExactAdjacentTextRepeats,
  normalizeAssistantReasoningText,
  normalizeAssistantVisibleText,
  stripInternalToolRunnerDiagnostics,
} from "./part-delta"

describe("collapseExactAdjacentTextRepeats", () => {
  test("collapses a duplicated complete status line inside one value", () => {
    const line = "Continuing implementation: creating the hook and history section, then wiring them into the shell."

    expect(collapseExactAdjacentTextRepeats(
      `${line}\n${line}\nSkipped malformed tool call "edit": Invalid arguments for tool "edit".`,
    )).toBe(`${line}\nSkipped malformed tool call "edit": Invalid arguments for tool "edit".`)
  })

  test("collapses a jammed duplicated tool diagnostic inside one value", () => {
    const diagnostic = 'Skipped malformed tool call "edit": Invalid arguments for tool "edit": missing required: old_string. missing required: old_string | edit requires path, old_string, and new_string'

    expect(collapseExactAdjacentTextRepeats(
      `${diagnostic}${diagnostic}Tool loop guard stopped repeated schema-invalid calls to "edit" after 4 attempts (limit 2).`,
    )).toBe(`${diagnostic}Tool loop guard stopped repeated schema-invalid calls to "edit" after 4 attempts (limit 2).`)
  })

  test("keeps short intentional repetition", () => {
    expect(collapseExactAdjacentTextRepeats("ha\nha")).toBe("ha\nha")
  })

  test("keeps non-adjacent repeated long text", () => {
    const line = "This is a long sentence that may legitimately return later in a response."

    expect(collapseExactAdjacentTextRepeats(`${line}\nDifferent middle sentence.\n${line}`))
      .toBe(`${line}\nDifferent middle sentence.\n${line}`)
  })
})

describe("stripInternalToolRunnerDiagnostics", () => {
  test("removes malformed edit tool diagnostics and keeps assistant prose", () => {
    const prose = "The `edit` tool is blocked, so I'll use `Write` and `StrReplace` to finish the hook."
    const diagnostic = 'Skipped malformed tool call "edit": Invalid arguments for tool "edit": missing required: old_string. missing required: old_string | edit requires path, old_string, and new_string'

    expect(stripInternalToolRunnerDiagnostics(`${prose}\n${diagnostic}`)).toBe(prose)
  })

  test("removes jammed tool-runner diagnostics", () => {
    const prose = "Picking up implementation: creating the hook and history section."
    const malformed = 'Skipped malformed tool call "edit": Invalid arguments for tool "edit": missing required: old_string. missing required: old_string | edit requires path, old_string, and new_string'
    const blocked = 'Tool "edit" has been temporarily blocked after 3 repeated validation failures. Do not retry this tool. Use a different approach to complete the task.'
    const guard = 'Tool loop guard stopped repeated schema-invalid calls to "edit" after 4 attempts (limit 2). Adjust tool arguments and retry.'

    expect(stripInternalToolRunnerDiagnostics(`${prose}\n${malformed}${blocked}${guard}`)).toBe(prose)
  })

  test("returns empty string for diagnostic-only text", () => {
    expect(stripInternalToolRunnerDiagnostics(
      'Tool loop guard stopped repeated schema-invalid calls to "edit" after 8 attempts (limit 6). Adjust tool arguments and retry.',
    )).toBe("")
  })

  test("keeps ordinary model-authored edit tool prose", () => {
    const prose = "The edit tool is blocked, so I'll use Write and StrReplace next."

    expect(stripInternalToolRunnerDiagnostics(prose)).toBe(prose)
  })
})

describe("normalizeAssistantVisibleText", () => {
  test("collapses duplicated assistant prose and strips internal diagnostics", () => {
    const prose = "Continuing implementation: creating the hook and history section, then wiring them into the shell."
    const diagnostic = 'Skipped malformed tool call "edit": Invalid arguments for tool "edit": missing required: old_string.'

    expect(normalizeAssistantVisibleText(`${prose}\n${prose}\n${diagnostic}`)).toBe(prose)
  })

  test("keeps visible assistant text that looks like a user request summary", () => {
    const prose = "The user wants to keep a visible implementation summary in the final answer."

    expect(normalizeAssistantVisibleText(prose)).toBe(prose)
  })

  test("strips Cursor reasoning meta-restatement lines and keeps reasoning prose", () => {
    const meta = "The user wants to continue implementing the calendar redesign."
    const reasoning = "The AppointmentHistorySection file contains invalid JSX syntax."

    expect(normalizeAssistantReasoningText(`${meta}\n\n${reasoning}`)).toBe(reasoning)
  })

  test("strips Cursor reasoning intent-restatement variants", () => {
    const variants = [
      "The user requests to revert the changes I made during our conversation.",
      "The user asked to continue implementing the calendar redesign.",
      "The user is asking to finish the remaining shell wiring.",
      "The user wants me to continue implementing the solution.",
      "The user intends for me to proceed with implementing the calendar redesign.",
    ]

    variants.forEach((variant) => {
      expect(normalizeAssistantReasoningText(variant)).toBe("")
    })
  })

  test("keeps ordinary requirement summaries that do not restate agent intent", () => {
    const prose = "The user wants a calendar redesign with appointment history."

    expect(normalizeAssistantReasoningText(prose)).toBe(prose)
  })

  test("removes dangling Cursor reasoning list fragments", () => {
    const reasoning = "Good. So for the professional dashboard, the required changes are:\n\n1."

    expect(normalizeAssistantReasoningText(reasoning)).toBe("Good.")
  })

  test("strips exact Cursor edit-tool workaround lines and keeps visible assistant prose", () => {
    const workaround = "The `edit` tool is blocked, so I'll use `Write` and `StrReplace` to finish the hook, history section, shell wiring, and i18n keys."
    const prose = "Fixing the broken AppointmentHistorySection, then wiring the shell and i18n."

    expect(normalizeAssistantVisibleText(`${workaround}\n\n${prose}`)).toBe(prose)
  })

  test("strips exact Cursor continuing-with-tool-workaround lines", () => {
    expect(normalizeAssistantVisibleText("Continuing with `Write` and `StrReplace` since `edit` is blocked.")).toBe("")
  })
})

describe("appendStreamingTextDelta", () => {
  test("normalizes a duplicated first frame in a single coalesced delta", () => {
    const frame = "Continuing implementation: creating the hook and history section, then wiring them into the shell."

    expect(appendStreamingTextDelta("", `${frame}\n${frame}\n`)).toBe(`${frame}\n`)
  })
})
