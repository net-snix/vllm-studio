import assert from "node:assert/strict";
import { test } from "node:test";
import { restorePersistedPaneState } from "./store";

test("persisted pane state ignores malformed layouts instead of throwing", () => {
  const badStates = [
    { version: 1, layout: { kind: "split", direction: "vertical", ratio: 0.5 }, panes: {} },
    { version: 1, layout: { kind: "leaf", paneId: "" }, panes: {} },
    {
      version: 1,
      layout: { kind: "split", direction: "diagonal", ratio: 0.5, a: {}, b: {} },
      panes: {},
    },
  ];

  for (const state of badStates) {
    assert.doesNotThrow(() => restorePersistedPaneState(JSON.stringify(state)));
    assert.equal(restorePersistedPaneState(JSON.stringify(state)), null);
  }
});

test("persisted pane state restores a valid saved chat pane", () => {
  const saved = {
    version: 1,
    layout: { kind: "leaf", paneId: "p-chat" },
    focusedPaneId: "p-chat",
    panes: {
      "p-chat": {
        activeTabId: "tab-chat",
        runtimeSessionId: "rt-chat",
        tabs: [
          {
            id: "tab-chat",
            runtimeSessionId: "rt-tab",
            piSessionId: "pi-chat",
            title: "Saved chat",
            status: "idle",
          },
        ],
      },
    },
  };

  const restored = restorePersistedPaneState(JSON.stringify(saved));

  assert.equal(restored?.focusedPaneId, "p-chat");
  assert.equal(restored?.panesById.get("p-chat")?.sessionId, "tab-chat");
  assert.equal(restored?.sessions.get("tab-chat")?.piSessionId, "pi-chat");
});
