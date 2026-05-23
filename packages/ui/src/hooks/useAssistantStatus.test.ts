import { describe, expect, test } from "bun:test";
import type { Part } from "@opencode-ai/sdk/v2";

import { getAssistantActivePartStatus } from "./useAssistantStatus";

const toolPart = (id: string, tool: string, status: string): Part => ({
    id,
    sessionID: "ses_1",
    messageID: "msg_assistant",
    type: "tool",
    tool,
    state: {
        status,
        time: {
            start: 1,
            ...(status === "completed" ? { end: 2 } : {}),
        },
    },
} as unknown as Part);

const textPart = (id: string, text: string, ended = false): Part => ({
    id,
    sessionID: "ses_1",
    messageID: "msg_assistant",
    type: "text",
    text,
    time: {
        start: 1,
        ...(ended ? { end: 2 } : {}),
    },
} as unknown as Part);

const reasoningPart = (id: string, text: string, ended = false): Part => ({
    id,
    sessionID: "ses_1",
    messageID: "msg_assistant",
    type: "reasoning",
    text,
    time: {
        start: 1,
        ...(ended ? { end: 2 } : {}),
    },
} as unknown as Part);

describe("getAssistantActivePartStatus", () => {
    test("ignores older running search tools after newer completed work", () => {
        expect(getAssistantActivePartStatus([
            toolPart("grep_1", "grep", "running"),
            toolPart("read_1", "read", "completed"),
            toolPart("shell_1", "shell", "completed"),
        ])).toEqual({
            activePartType: undefined,
            activeToolName: undefined,
        });
    });

    test("keeps the latest running shell and edit tools specific", () => {
        expect(getAssistantActivePartStatus([
            toolPart("grep_1", "grep", "running"),
            toolPart("shell_1", "shell", "running"),
        ])).toEqual({
            activePartType: "tool",
            activeToolName: "shell",
        });

        expect(getAssistantActivePartStatus([
            toolPart("shell_1", "shell", "completed"),
            toolPart("edit_1", "edit", "running"),
        ])).toEqual({
            activePartType: "editing",
            activeToolName: "edit",
        });
    });

    test("keeps latest open text and reasoning parts active", () => {
        expect(getAssistantActivePartStatus([
            toolPart("read_1", "read", "completed"),
            textPart("text_1", "writing"),
        ])).toEqual({
            activePartType: "text",
            activeToolName: undefined,
        });

        expect(getAssistantActivePartStatus([
            textPart("text_1", "done", true),
            reasoningPart("reasoning_1", "thinking"),
        ])).toEqual({
            activePartType: "reasoning",
            activeToolName: undefined,
        });
    });
});
