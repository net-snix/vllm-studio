import assert from "node:assert/strict";
import { test } from "node:test";
import type { Recipe } from "@/lib/types";
import type { RecipeEditor } from "@/features/recipes/recipe-editor";
import { generateCommand } from "@/features/recipes/recipe-command";
import { normalizeRecipeForEditor } from "@/features/recipes/normalize-recipe";
import { prepareRecipeForSave } from "@/features/recipes/prepare-recipe";

test("vLLM disable log requests emits the current boolean flag", () => {
  const command = generateCommand({
    id: "recipe-test",
    name: "Recipe test",
    backend: "vllm",
    model_path: "Qwen/Qwen2.5-0.5B-Instruct",
    disable_log_requests: true,
  } as RecipeEditor);

  assert.match(command, /--disable-log-requests/);
});

test("disable log requests extra arg round-trips through the recipe editor", () => {
  const recipe = normalizeRecipeForEditor({
    id: "recipe-test",
    name: "Recipe test",
    backend: "vllm",
    model_path: "Qwen/Qwen2.5-0.5B-Instruct",
    extra_args: {
      "disable-log-requests": true,
    },
  } as Recipe);

  assert.equal(recipe.disable_log_requests, true);

  const saved = prepareRecipeForSave(recipe);
  assert.equal(saved.extra_args?.["disable-log-requests"], true);
});
