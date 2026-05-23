import assert from "node:assert/strict";

process.env.OPENCODE_AUTORESUME_DEBOUNCE_MS = "1";
process.env.OPENCODE_AUTORESUME_COOLDOWN_MS = "0";

const { OrchestratorAutoresumePlugin } = await import("./orchestrator-autoresume.mjs");

const calls = [];
const plugin = await OrchestratorAutoresumePlugin({
  client: {
    session: {
      promptAsync: async (payload) => {
        calls.push(payload);
      },
    },
  },
});

async function emit(event) {
  await plugin.event({ event });
}

function wait(ms = 10) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await emit({
  type: "session.created",
  properties: {
    info: { id: "parent", title: "Parent", directory: "/tmp", version: "test", time: { created: 1, updated: 1 } },
  },
});

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "parent",
    part: {
      id: "subtask-1",
      sessionID: "parent",
      messageID: "message-1",
      type: "subtask",
      prompt: "implement",
      description: "fixer task",
      agent: "fixer",
    },
    time: 1,
  },
});

await emit({
  type: "session.created",
  properties: {
    info: { id: "child-fixer", parentID: "parent", title: "Fixer", directory: "/tmp", version: "test", time: { created: 2, updated: 2 } },
  },
});

await emit({
  type: "todo.updated",
  properties: {
    sessionID: "child-fixer",
    todos: [{ content: "finish implementation", status: "pending", priority: "high" }],
  },
});

await emit({
  type: "session.status",
  properties: { sessionID: "child-fixer", status: { type: "idle" } },
});

await wait();

assert.equal(
  calls.some((call) => call.sessionID === "child-fixer" && call.agent === "fixer"),
  true,
  "idle fixer child with incomplete todos should be resumed",
);

const callsAfterFixer = calls.length;

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "parent",
    part: {
      id: "subtask-2",
      sessionID: "parent",
      messageID: "message-2",
      type: "subtask",
      prompt: "inspect",
      description: "explorer task",
      agent: "explorer",
    },
    time: 2,
  },
});

await emit({
  type: "session.created",
  properties: {
    info: { id: "child-explorer", parentID: "parent", title: "Explorer", directory: "/tmp", version: "test", time: { created: 3, updated: 3 } },
  },
});

await emit({
  type: "todo.updated",
  properties: {
    sessionID: "child-explorer",
    todos: [{ content: "inspect files", status: "pending", priority: "medium" }],
  },
});

await emit({
  type: "session.status",
  properties: { sessionID: "child-explorer", status: { type: "idle" } },
});

await wait();

assert.equal(
  calls.some((call) => call.sessionID === "child-explorer" && call.agent === "explorer"),
  true,
  "idle explorer child with incomplete todos should be resumed directly",
);
assert.ok(calls.length >= callsAfterFixer, "parent autoresume calls may still occur");

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "parent",
    part: {
      id: "subtask-3",
      sessionID: "parent",
      messageID: "message-3",
      type: "subtask",
      prompt: "polish UI",
      description: "designer task",
      agent: "designer",
    },
    time: 3,
  },
});

await emit({
  type: "session.created",
  properties: {
    info: { id: "child-designer", parentID: "parent", title: "Designer", directory: "/tmp", version: "test", time: { created: 4, updated: 4 } },
  },
});

await emit({
  type: "todo.updated",
  properties: {
    sessionID: "child-designer",
    todos: [{ content: "finish UI polish", status: "pending", priority: "high" }],
  },
});

await emit({
  type: "session.status",
  properties: { sessionID: "child-designer", status: { type: "idle" } },
});

await wait();

assert.equal(
  calls.some((call) => call.sessionID === "child-designer" && call.agent === "designer"),
  true,
  "idle designer child with incomplete todos should be resumed directly",
);

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "parent",
    part: {
      id: "subtask-4",
      sessionID: "parent",
      messageID: "message-4",
      type: "subtask",
      prompt: "research docs",
      description: "librarian task",
      agent: "librarian",
    },
    time: 4,
  },
});

await emit({
  type: "session.created",
  properties: {
    info: { id: "child-librarian", parentID: "parent", title: "Librarian", directory: "/tmp", version: "test", time: { created: 5, updated: 5 } },
  },
});

await emit({
  type: "session.status",
  properties: { sessionID: "child-librarian", status: { type: "idle" } },
});

await wait();

assert.equal(
  calls.some((call) => call.sessionID === "child-librarian" && call.agent === "librarian"),
  true,
  "idle librarian child without terminal status should be resumed directly",
);

const callsAfterLibrarianResume = calls.length;

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "child-librarian",
    part: {
      id: "librarian-result",
      sessionID: "child-librarian",
      messageID: "message-5",
      type: "text",
      text: "<results><sources></sources><answer>Done.</answer><status>complete</status></results>",
    },
    time: 5,
  },
});

await emit({
  type: "session.status",
  properties: { sessionID: "child-librarian", status: { type: "idle" } },
});

await wait();

assert.equal(
  calls.length,
  callsAfterLibrarianResume,
  "librarian child with complete terminal status should not be resumed again",
);

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "parent",
    part: {
      id: "subtask-5",
      sessionID: "parent",
      messageID: "message-6",
      type: "subtask",
      prompt: "research blocked docs",
      description: "blocked librarian task",
      agent: "librarian",
    },
    time: 6,
  },
});

await emit({
  type: "session.created",
  properties: {
    info: { id: "child-librarian-blocked", parentID: "parent", title: "Librarian Blocked", directory: "/tmp", version: "test", time: { created: 7, updated: 7 } },
  },
});

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "child-librarian-blocked",
    part: {
      id: "librarian-blocked-result",
      sessionID: "child-librarian-blocked",
      messageID: "message-7",
      type: "text",
      text: "<results><sources></sources><answer>Need a source target.</answer><status>blocked</status></results>",
    },
    time: 7,
  },
});

await emit({
  type: "session.status",
  properties: { sessionID: "child-librarian-blocked", status: { type: "idle" } },
});

await wait();

assert.equal(
  calls.length,
  callsAfterLibrarianResume,
  "librarian child with blocked terminal status should not be resumed",
);

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "parent",
    part: {
      id: "subtask-6",
      sessionID: "parent",
      messageID: "message-8",
      type: "subtask",
      prompt: "fix without todos",
      description: "fixer no-todo task",
      agent: "fixer",
    },
    time: 8,
  },
});

await emit({
  type: "session.created",
  properties: {
    info: { id: "child-fixer-no-todos", parentID: "parent", title: "Fixer No Todos", directory: "/tmp", version: "test", time: { created: 8, updated: 8 } },
  },
});

await emit({
  type: "session.status",
  properties: { sessionID: "child-fixer-no-todos", status: { type: "idle" } },
});

await wait();

assert.equal(
  calls.some((call) => call.sessionID === "child-fixer-no-todos" && call.agent === "fixer"),
  true,
  "idle fixer child without todos and without terminal status should be resumed",
);

const callsAfterFixerNoTodos = calls.length;

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "child-fixer-no-todos",
    part: {
      id: "fixer-complete-result",
      sessionID: "child-fixer-no-todos",
      messageID: "message-9",
      type: "text",
      text: "<summary>Done</summary><status>complete</status>",
    },
    time: 9,
  },
});

await emit({
  type: "session.status",
  properties: { sessionID: "child-fixer-no-todos", status: { type: "idle" } },
});

await wait();

assert.equal(
  calls.length,
  callsAfterFixerNoTodos,
  "fixer child with complete terminal status should not be resumed again",
);

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "parent",
    part: {
      id: "subtask-7",
      sessionID: "parent",
      messageID: "message-10",
      type: "subtask",
      prompt: "polish without todos",
      description: "designer no-todo task",
      agent: "designer",
    },
    time: 10,
  },
});

await emit({
  type: "session.created",
  properties: {
    info: { id: "child-designer-no-todos", parentID: "parent", title: "Designer No Todos", directory: "/tmp", version: "test", time: { created: 10, updated: 10 } },
  },
});

await emit({
  type: "session.status",
  properties: { sessionID: "child-designer-no-todos", status: { type: "idle" } },
});

await wait();

assert.equal(
  calls.some((call) => call.sessionID === "child-designer-no-todos" && call.agent === "designer"),
  true,
  "idle designer child without todos and without terminal status should be resumed",
);

const callsAfterDesignerNoTodos = calls.length;

await emit({
  type: "message.part.updated",
  properties: {
    sessionID: "child-designer-no-todos",
    part: {
      id: "designer-complete-result",
      sessionID: "child-designer-no-todos",
      messageID: "message-11",
      type: "text",
      text: "<status>complete</status>",
    },
    time: 11,
  },
});

await emit({
  type: "session.status",
  properties: { sessionID: "child-designer-no-todos", status: { type: "idle" } },
});

await wait();

assert.equal(
  calls.length,
  callsAfterDesignerNoTodos,
  "designer child with complete terminal status should not be resumed again",
);

console.log("orchestrator-autoresume harness passed");
