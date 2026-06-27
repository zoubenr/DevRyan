import { describe, expect, test } from "bun:test";

import { getAssistantToolStatusPhrase } from "./assistantStatusFormatting";

describe("getAssistantToolStatusPhrase", () => {
    test("formats MCP tool names through shared tool metadata", () => {
        expect(getAssistantToolStatusPhrase("linear_save_issue")).toBe("using Linear Save Issue");
        expect(getAssistantToolStatusPhrase("Linear_get_issue")).toBe("using Linear Get Issue");
        expect(getAssistantToolStatusPhrase("Linear_save_issue")).toBe("using Linear Save Issue");
    });

    test("keeps built-in status phrases unchanged", () => {
        expect(getAssistantToolStatusPhrase("bash")).toBe("running command");
        expect(getAssistantToolStatusPhrase("apply_patch")).toBe("applying patch");
    });

    test("matches built-in tool names case-insensitively", () => {
        expect(getAssistantToolStatusPhrase("Bash")).toBe("running command");
    });
});
