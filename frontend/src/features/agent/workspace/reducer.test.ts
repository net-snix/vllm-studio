import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialState, reducer } from "./store";
import type { AgentModel } from "./types";

function model(id: string, active = false): AgentModel {
  return {
    id,
    name: id,
    provider: "local-studio",
    contextWindow: 128_000,
    maxTokens: 65_536,
    reasoning: false,
    vision: false,
    active,
    tools: false,
  };
}

test("workspace defaults the global model picker to the active loaded model", () => {
  const state = { ...createInitialState(), selectedModel: "stale" };

  const next = reducer(state, {
    type: "setModels",
    models: [model("stale"), model("loaded", true)],
  });

  assert.equal(next.selectedModel, "loaded");
});
