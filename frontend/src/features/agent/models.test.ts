import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOpenAIModels } from "./models";

test("model normalization preserves the controller's active marker", () => {
  const models = normalizeOpenAIModels({
    data: [
      { id: "loaded-model", active: true },
      { id: "standby-model", active: false },
    ],
  });

  assert.equal(models.find((entry) => entry.id === "loaded-model")?.active, true);
  assert.equal(models.find((entry) => entry.id === "standby-model")?.active, false);
});
