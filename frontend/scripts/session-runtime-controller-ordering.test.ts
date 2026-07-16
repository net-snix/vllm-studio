import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionRuntimeController,
  type SessionRuntimeBinding,
} from "../src/features/agent/runtime/session-runtime-controller";
import type {
  RuntimeEventPayload,
  RuntimeEventSubscription,
} from "../src/features/agent/runtime/api";
import type { Session } from "../src/features/agent/runtime/types";

test("new turn stream events target the optimistic assistant bubble despite stale snapshots", async () => {
  const sessionId = "tab-1";
  const oldAssistantId = "assistant-old";
  const newAssistantId = "assistant-new";
  const previousMessages: Session["messages"] = [
    { id: "user-old", role: "user", text: "first prompt" },
    {
      id: oldAssistantId,
      role: "assistant",
      text: "first response",
      blocks: [{ kind: "text", id: "old-text", text: "first response" }],
    },
  ];
  let liveSession: Session = {
    id: sessionId,
    piSessionId: "pi-1",
    title: "Ordering test",
    messages: [
      ...previousMessages,
      { id: "user-new", role: "user", text: "second prompt" },
      { id: newAssistantId, role: "assistant", text: "", blocks: [] },
    ],
    status: "running",
    error: "",
    input: "",
    activeAssistantId: newAssistantId,
  };
  const staleSnapshot: Session = {
    ...liveSession,
    messages: previousMessages,
    activeAssistantId: oldAssistantId,
  };
  const payloadSink: { current?: (payload: RuntimeEventPayload) => void } = {};
  const controller = createSessionRuntimeController({
    idleReconnectMs: 0,
    api: {
      listRuntimeSessions: async () => [],
      loadRuntimeStatus: async () => null,
      subscribeRuntimeEvents: (
        _runtime,
        _after,
        _piSessionId,
        handlers,
      ): RuntimeEventSubscription => {
        payloadSink.current = handlers.onPayload;
        return { close: () => undefined };
      },
    },
  });
  const binding: SessionRuntimeBinding = {
    commit: (targetSessionId, patch) => {
      assert.equal(targetSessionId, sessionId);
      liveSession = patch(liveSession);
    },
    getSession: () => staleSnapshot,
    getSessions: () => [liveSession],
  };

  controller.bind(binding);
  controller.reconcile([liveSession]);
  controller.noteTurnAccepted(sessionId, newAssistantId);

  const sendPayload = payloadSink.current;
  if (!sendPayload) throw new Error("runtime subscription was not opened");
  sendPayload({
    type: "pi",
    seq: 1,
    event: {
      type: "message_start",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "second response" }],
      },
    },
  });

  const oldAssistant = liveSession.messages.find((message) => message.id === oldAssistantId);
  const newAssistant = liveSession.messages.find((message) => message.id === newAssistantId);
  assert.equal(oldAssistant?.text, "first response");
  assert.equal(newAssistant?.text, "second response");

  controller.closeAll();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("accepted turns without event seq keep the cursor and ignore old replay", async () => {
  const sessionId = "tab-2";
  const oldAssistantId = "assistant-old";
  const newAssistantId = "assistant-new";
  let liveSession: Session = {
    id: sessionId,
    piSessionId: "pi-1",
    title: "Replay test",
    messages: [
      { id: "user-old", role: "user", text: "first prompt" },
      { id: oldAssistantId, role: "assistant", text: "", blocks: [] },
    ],
    status: "running",
    error: "",
    input: "",
    activeAssistantId: oldAssistantId,
  };
  const afters: number[] = [];
  const payloadSink: { current?: (payload: RuntimeEventPayload) => void } = {};
  const controller = createSessionRuntimeController({
    idleReconnectMs: 0,
    api: {
      listRuntimeSessions: async () => [],
      loadRuntimeStatus: async () => null,
      subscribeRuntimeEvents: (
        _runtime,
        after,
        _piSessionId,
        handlers,
      ): RuntimeEventSubscription => {
        afters.push(after);
        payloadSink.current = handlers.onPayload;
        return {
          close: () => {
            if (payloadSink.current === handlers.onPayload) payloadSink.current = undefined;
          },
        };
      },
    },
  });
  const binding: SessionRuntimeBinding = {
    commit: (targetSessionId, patch) => {
      assert.equal(targetSessionId, sessionId);
      liveSession = patch(liveSession);
    },
    getSession: () => liveSession,
    getSessions: () => [liveSession],
  };

  controller.bind(binding);
  controller.reconcile([liveSession]);
  assert.equal(afters[0], 0);

  const firstStream = payloadSink.current;
  if (!firstStream) throw new Error("first runtime subscription was not opened");
  firstStream({
    type: "pi",
    seq: 1,
    event: {
      type: "message_start",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "first response" }],
      },
    },
  });
  firstStream({ type: "pi", seq: 2, event: { type: "agent_end" } });
  assert.equal(liveSession.status, "idle");
  assert.equal(liveSession.lastEventSeq, 2);

  controller.reconcile([liveSession]);
  liveSession = {
    ...liveSession,
    messages: [
      ...liveSession.messages,
      { id: "user-new", role: "user", text: "second prompt" },
      { id: newAssistantId, role: "assistant", text: "", blocks: [] },
    ],
    status: "running",
    activeAssistantId: newAssistantId,
  };

  controller.noteTurnAccepted(sessionId, newAssistantId, undefined);
  controller.reconcile([liveSession]);
  assert.equal(afters[1], 2);

  const secondStream = payloadSink.current;
  if (!secondStream) throw new Error("second runtime subscription was not opened");
  secondStream({
    type: "pi",
    seq: 1,
    event: {
      type: "message_start",
      message: { role: "user", content: "first prompt" },
    },
  });
  assert.equal(
    liveSession.messages.filter(
      (message) => message.role === "user" && message.text === "first prompt",
    ).length,
    1,
  );

  secondStream({
    type: "pi",
    seq: 3,
    event: {
      type: "message_start",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "second response" }],
      },
    },
  });

  const newAssistant = liveSession.messages.find((message) => message.id === newAssistantId);
  assert.equal(newAssistant?.text, "second response");

  controller.closeAll();
  await new Promise((resolve) => setTimeout(resolve, 0));
});
