import { describe, expect, test } from "bun:test"
import { buildPlanCardRenderSegments } from "./planCardRender"

const structuredPlanBody = [
  "# Cursor Plan Card Fix",
  "",
  "## Context",
  "",
  "Cursor models omit the sentinel.",
  "",
  "## Implementation",
  "",
  "1. Add fallback detection.",
].join("\n")

describe("buildPlanCardRenderSegments", () => {
  test("renders a preamble-only group before the plan body starts", () => {
    const messagePlan = {
      preambleText: "intro\n",
      planText: structuredPlanBody,
    }

    expect(buildPlanCardRenderSegments({
      groupText: "intro",
      groupStart: 0,
      groupEnd: 5,
      messagePlan,
      planCardRendered: false,
    })).toEqual({
      segments: [{ kind: "preamble", text: "intro" }],
      planCardRendered: false,
    })
  })

  test("renders the plan card once when a later group overlaps the plan body", () => {
    const messagePlan = {
      preambleText: "intro\n",
      planText: structuredPlanBody,
    }

    expect(buildPlanCardRenderSegments({
      groupText: structuredPlanBody,
      groupStart: 6,
      groupEnd: 6 + structuredPlanBody.length,
      messagePlan,
      planCardRendered: false,
    })).toEqual({
      segments: [{ kind: "plan-card" }],
      planCardRendered: true,
    })
  })

  test("does not render a second plan card after the first one is mounted", () => {
    const messagePlan = {
      preambleText: "",
      planText: structuredPlanBody,
    }

    expect(buildPlanCardRenderSegments({
      groupText: "extra tail",
      groupStart: structuredPlanBody.length + 1,
      groupEnd: structuredPlanBody.length + 1 + "extra tail".length,
      messagePlan,
      planCardRendered: true,
    })).toEqual({
      segments: [{ kind: "preamble", text: "extra tail" }],
      planCardRendered: true,
    })
  })
})
