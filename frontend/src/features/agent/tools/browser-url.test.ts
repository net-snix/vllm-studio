import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildSearchUrl, normalizeBrowserInput } from "./browser-url";

describe("browser URL normalization", () => {
  test("uses local SearXNG for server-side free-text search fallback", () => {
    assert.equal(buildSearchUrl("vllm studio"), "http://127.0.0.1:8081/search?q=vllm+studio");
  });

  test("uses the current browser host for free-text search fallback", () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { protocol: "http:", hostname: "espenpro6000" } },
    });

    try {
      assert.equal(
        normalizeBrowserInput("vllm studio", ""),
        "http://espenpro6000:8081/search?q=vllm+studio",
      );
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
  });
});
