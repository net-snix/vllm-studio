import assert from "node:assert/strict";
import { test } from "node:test";
import {
  modelsWithRecipeToolCapabilities,
  type AgentModel,
  type BackendRecipeListItem,
} from "./models";

function model(id: string, patch: Partial<AgentModel> = {}): AgentModel {
  return {
    id,
    name: id,
    provider: "vllm-studio",
    contextWindow: 128_000,
    maxTokens: 65_536,
    reasoning: false,
    vision: false,
    active: false,
    tools: false,
    ...patch,
  };
}

test("running recipe marks the matching agent model active", () => {
  const models = [model("stale"), model("loaded-model")];
  const recipes: BackendRecipeListItem[] = [
    {
      id: "recipe-loaded",
      served_model_name: "loaded-model",
      status: "running",
      extra_args: { enable_auto_tool_choice: true, tool_call_parser: "hermes" },
    },
  ];

  const enriched = modelsWithRecipeToolCapabilities(models, recipes);

  assert.equal(enriched.find((entry) => entry.id === "loaded-model")?.active, true);
  assert.equal(enriched.find((entry) => entry.id === "loaded-model")?.tools, true);
  assert.equal(enriched.find((entry) => entry.id === "stale")?.active, false);
});

test("running process model path can mark the loaded model active", () => {
  const models = [
    model("vllm-studio/Qwen3", { rawId: "Qwen3", active: true }),
    model("vllm-studio/DeepSeek", { rawId: "DeepSeek" }),
  ];

  const enriched = modelsWithRecipeToolCapabilities(models, [], {
    model_path: "/LINUX/Models/DeepSeek",
  });

  assert.equal(enriched.find((entry) => entry.rawId === "DeepSeek")?.active, true);
  assert.equal(enriched.find((entry) => entry.rawId === "Qwen3")?.active, false);
});
