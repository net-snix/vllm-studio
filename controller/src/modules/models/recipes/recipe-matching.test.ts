import { describe, expect, it } from "bun:test";

import type { ProcessInfo, Recipe } from "../types";
import { isRecipeRunning } from "./recipe-matching";

const recipe = (overrides: Partial<Recipe> = {}): Recipe =>
  ({
    id: "deepseek-v4-flash-ds4-gguf" as Recipe["id"],
    name: "DeepSeek V4 Flash",
    model_path: "/models/deepseek-v4.gguf",
    vision: null,
    backend: "ds4",
    runtime: { kind: "binary", ref: "/opt/ds4/ds4-server" },
    env_vars: { CUDA_DEVICE_ORDER: "PCI_BUS_ID" },
    tensor_parallel_size: 1,
    pipeline_parallel_size: 1,
    max_model_len: 262144,
    gpu_memory_utilization: 0.9,
    kv_cache_dtype: "auto",
    max_num_seqs: 1,
    trust_remote_code: true,
    tool_call_parser: null,
    reasoning_parser: null,
    enable_auto_tool_choice: false,
    quantization: null,
    dtype: null,
    host: "0.0.0.0",
    port: 8000,
    served_model_name: null,
    python_path: null,
    extra_args: { visible_devices: "0", ds4_bin: "/opt/ds4/ds4-server" },
    max_thinking_tokens: null,
    thinking_mode: "conservative",
    ...overrides,
  }) as Recipe;

const process = (overrides: Partial<ProcessInfo> = {}): ProcessInfo =>
  ({
    pid: 123,
    backend: "ds4",
    model_path: "/models/deepseek-v4.gguf",
    port: 8000,
    served_model_name: null,
    executable_path: "/opt/ds4/ds4-server",
    runtime_env: { CUDA_VISIBLE_DEVICES: "0" },
    ...overrides,
  }) as ProcessInfo;

describe("isRecipeRunning", () => {
  it("matches on served_model_name case-insensitively", () => {
    expect(
      isRecipeRunning(
        recipe({ served_model_name: "Deepseek-V4", model_path: "/models/a" }),
        process({ served_model_name: "deepseek-v4", model_path: "/models/b" }),
      ),
    ).toBe(true);
  });

  it("matches an exact normalized path with a trailing slash ignored", () => {
    expect(
      isRecipeRunning(
        recipe({ model_path: "/models/org/Llama-3/" }),
        process({ model_path: "/models/org/Llama-3" }),
      ),
    ).toBe(true);
  });

  it("does not match full paths that only share a basename", () => {
    expect(
      isRecipeRunning(
        recipe({ model_path: "/models/orgA/Llama-3" }),
        process({ model_path: "/models/orgB/Llama-3" }),
      ),
    ).toBe(false);
    expect(
      isRecipeRunning(
        recipe({ model_path: "/a/model.gguf" }),
        process({ model_path: "/b/model.gguf" }),
      ),
    ).toBe(false);
  });

  it("matches when one side only has a basename", () => {
    expect(
      isRecipeRunning(
        recipe({ model_path: "/models/org/model.gguf" }),
        process({ model_path: "model.gguf" }),
      ),
    ).toBe(true);
  });

  it("respects path segment boundaries for prefix matching", () => {
    expect(
      isRecipeRunning(
        recipe({ model_path: "/models/llama" }),
        process({ model_path: "/models/llama-3.1-8b" }),
        { allowEitherPathContains: true },
      ),
    ).toBe(false);
    expect(
      isRecipeRunning(
        recipe({ model_path: "/models/llama" }),
        process({ model_path: "/models/llama/snapshot" }),
        { allowEitherPathContains: true },
      ),
    ).toBe(true);
  });

  it("matches current-path containment only for a real subpath", () => {
    expect(
      isRecipeRunning(
        recipe({ model_path: "/models/x" }),
        process({ model_path: "/models/x/weights" }),
        { allowCurrentContainsRecipePath: true },
      ),
    ).toBe(true);
    expect(
      isRecipeRunning(
        recipe({ model_path: "/models/x" }),
        process({ model_path: "/models/x-large" }),
        { allowCurrentContainsRecipePath: true },
      ),
    ).toBe(false);
  });

  it("requires a matching DS4 binary when recipes share a GGUF path", () => {
    const optimized = recipe({
      id: "deepseek-v4-flash-ds4-gguf-maxreg192" as Recipe["id"],
      extra_args: {
        visible_devices: "0",
        ds4_bin: "/home/espen/Code/ds4-builds/sm120-maxreg192-20260517/ds4-server",
      },
    });

    expect(isRecipeRunning(optimized, process())).toBe(false);
    expect(
      isRecipeRunning(
        optimized,
        process({
          executable_path: "/home/espen/Code/ds4-builds/sm120-maxreg192-20260517/ds4-server",
        }),
      ),
    ).toBe(true);
  });

  it("does not match DS4 fast-prefill env recipes to a baseline process", () => {
    const fastPrefill = recipe({
      id: "deepseek-v4-flash-ds4-gguf-prefill-fast" as Recipe["id"],
      env_vars: {
        CUDA_DEVICE_ORDER: "PCI_BUS_ID",
        DS4_CUDA_COPY_MODEL: "1",
        DS4_CUDA_Q8_F16_CACHE_RESERVE_MB: "1024",
      },
    });

    expect(isRecipeRunning(fastPrefill, process())).toBe(false);
    expect(
      isRecipeRunning(
        fastPrefill,
        process({
          runtime_env: {
            CUDA_VISIBLE_DEVICES: "0",
            DS4_CUDA_COPY_MODEL: "1",
            DS4_CUDA_Q8_F16_CACHE_RESERVE_MB: "1024",
          },
        }),
      ),
    ).toBe(true);
  });

  it("does not match sibling llama.cpp recipes when served aliases differ", () => {
    const running = process({
      backend: "llamacpp",
      model_path: "/models/step-3.7.gguf",
      served_model_name: "step-3-7-mtp-256k",
      executable_path: "/usr/local/bin/llama-server",
      runtime_env: {},
    });

    expect(
      isRecipeRunning(
        recipe({
          backend: "llamacpp",
          model_path: "/models/step-3.7.gguf",
          served_model_name: "step-3-7-mtp-128k",
          extra_args: {},
        }),
        running,
      ),
    ).toBe(false);
    expect(
      isRecipeRunning(
        recipe({
          backend: "llamacpp",
          model_path: "/models/step-3.7.gguf",
          served_model_name: "step-3-7-mtp-256k",
          extra_args: {},
        }),
        running,
      ),
    ).toBe(true);
  });
});
