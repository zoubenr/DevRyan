import { describe, expect, test } from "bun:test"

import {
  getIndexAfterOptionSelection,
  getNextQuestionIndex,
  getPreviousQuestionIndex,
  isQuestionAnswerComplete,
} from "./questionCardNavigation"

describe("question card navigation", () => {
  test("single-choice option selection advances unless it is the final question", () => {
    expect(getIndexAfterOptionSelection({ currentIndex: 0, totalCount: 3, multiple: false })).toBe(1)
    expect(getIndexAfterOptionSelection({ currentIndex: 2, totalCount: 3, multiple: false })).toBe(2)
  })

  test("multi-select option selection does not advance automatically", () => {
    expect(getIndexAfterOptionSelection({ currentIndex: 0, totalCount: 3, multiple: true })).toBe(0)
  })

  test("custom answers require non-empty trimmed text", () => {
    expect(isQuestionAnswerComplete({ isCustom: true, customText: "  " })).toBe(false)
    expect(isQuestionAnswerComplete({ isCustom: true, customText: "  Use project Alpha  " })).toBe(true)
  })

  test("selected option answers are complete when at least one option is selected", () => {
    expect(isQuestionAnswerComplete({ isCustom: false, selectedOptions: [] })).toBe(false)
    expect(isQuestionAnswerComplete({ isCustom: false, selectedOptions: ["High"] })).toBe(true)
  })

  test("back and next indexes stay within question bounds", () => {
    expect(getPreviousQuestionIndex(0)).toBe(0)
    expect(getPreviousQuestionIndex(2)).toBe(1)
    expect(getNextQuestionIndex(0, 3)).toBe(1)
    expect(getNextQuestionIndex(2, 3)).toBe(2)
    expect(getNextQuestionIndex(0, 0)).toBe(0)
  })
})
