import { describe, expect, test } from "bun:test"
import type { QuestionRequest } from "@/types/question"
import {
  buildQuestionRequestAnswerGroups,
  submitQuestionRequestAnswerGroups,
} from "./questionCardRouting"

const request = (id: string, count: number): QuestionRequest => ({
  id,
  sessionID: "ses_1",
  questions: Array.from({ length: count }, (_, index) => ({
    header: `Q${index + 1}`,
    question: `Question ${index + 1}?`,
    options: [{ label: "Yes", description: "" }],
  })),
})

describe("question card routing", () => {
  test("groups flattened answers back into one reply payload per QuestionRequest", async () => {
    const first = request("que_1", 2)
    const second = request("que_2", 1)
    const groups = buildQuestionRequestAnswerGroups([
      { request: first, withinRequestIndex: 0, answers: ["A1"] },
      { request: second, withinRequestIndex: 0, answers: ["B1"] },
      { request: first, withinRequestIndex: 1, answers: ["A2"] },
    ])
    const calls: Array<[string, string, string[][]]> = []
    const respondToQuestion = (sessionID: string, requestID: string, answers: string[][]) => {
      calls.push([sessionID, requestID, answers])
      return Promise.resolve()
    }

    const results = await submitQuestionRequestAnswerGroups(groups, respondToQuestion)

    expect(results.map((result) => result.request.id)).toEqual(["que_1", "que_2"])
    expect(calls).toEqual([
      ["ses_1", "que_1", [["A1"], ["A2"]]],
      ["ses_1", "que_2", [["B1"]]],
    ])
    expect(results.every((result) => result.status === "fulfilled")).toBe(true)
  })

  test("keeps submitting other request groups when one request fails", async () => {
    const first = request("que_1", 1)
    const second = request("que_2", 1)
    const groups = buildQuestionRequestAnswerGroups([
      { request: first, withinRequestIndex: 0, answers: ["A1"] },
      { request: second, withinRequestIndex: 0, answers: ["B1"] },
    ])
    const calls: Array<[string, string]> = []
    const respondToQuestion = (sessionID: string, requestID: string) => {
      calls.push([sessionID, requestID])
      if (requestID === "que_2") return Promise.reject(new Error("network failed"))
      return Promise.resolve()
    }

    const results = await submitQuestionRequestAnswerGroups(groups, respondToQuestion)

    expect(calls).toEqual([["ses_1", "que_1"], ["ses_1", "que_2"]])
    expect(results[0]).toEqual({ status: "fulfilled", request: first })
    expect(results[1].status).toBe("rejected")
    if (results[1].status !== "rejected") throw new Error("expected second result to reject")
    expect(results[1].request).toBe(second)
    expect(results[1].reason).toBeInstanceOf(Error)
  })
})
