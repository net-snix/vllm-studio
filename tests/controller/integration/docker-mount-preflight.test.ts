import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertDockerMountsCoverSymlinks,
  findEscapingSymlinks,
} from "../../../controller/src/modules/engines/process/docker-mount-preflight";
import { buildVllmCommand } from "../../../controller/src/modules/engines/process/backend-builder";
import type { Recipe } from "../../../controller/src/modules/models/types";

const root = mkdtempSync(join(tmpdir(), "mount-preflight-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const makeDir = (...parts: string[]): string => {
  const dir = join(root, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const dockerRecipe = (modelPath: string): Recipe =>
  ({
    id: "preflight-test",
    name: "Preflight Test",
    model_path: modelPath,
    backend: "vllm",
    host: "0.0.0.0",
    port: 8000,
    served_model_name: "preflight-test",
    tensor_parallel_size: 1,
    pipeline_parallel_size: 1,
    max_model_len: 4096,
    gpu_memory_utilization: 0.9,
    max_num_seqs: 8,
    kv_cache_dtype: null,
    trust_remote_code: false,
    tool_call_parser: null,
    reasoning_parser: null,
    quantization: null,
    dtype: null,
    python_path: null,
    env_vars: {},
    extra_args: { docker_image: "vllm/vllm-openai:test" },
  }) as unknown as Recipe;

describe("findEscapingSymlinks", () => {
  it("returns nothing for a checkpoint with only regular files", () => {
    const model = makeDir("clean-model");
    writeFileSync(join(model, "config.json"), "{}");
    expect(findEscapingSymlinks(model, [model])).toEqual([]);
  });

  it("detects a relative symlink escaping into a sibling checkpoint", () => {
    const other = makeDir("other-checkpoint");
    writeFileSync(join(other, "tokenizer.json"), "{}");
    const model = makeDir("escaping-model");
    symlinkSync("../other-checkpoint/tokenizer.json", join(model, "tokenizer.json"));
    const findings = findEscapingSymlinks(model, [model]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.link).toBe(join(model, "tokenizer.json"));
    expect(findings[0]?.target).toBe("../other-checkpoint/tokenizer.json");
    expect(findings[0]?.resolved).toBe(join(other, "tokenizer.json"));
  });

  it("accepts symlinks that resolve inside the mounted directory", () => {
    const model = makeDir("internal-links");
    writeFileSync(join(model, "tokenizer.json"), "{}");
    symlinkSync("tokenizer.json", join(model, "tokenizer_config.json"));
    expect(findEscapingSymlinks(model, [model])).toEqual([]);
  });

  it("accepts symlinks that resolve inside another mount root (draft dir)", () => {
    const draft = makeDir("draft-model");
    writeFileSync(join(draft, "config.json"), "{}");
    const model = makeDir("model-with-draft-link");
    symlinkSync(join(draft, "config.json"), join(model, "draft-config.json"));
    expect(findEscapingSymlinks(model, [model, draft])).toEqual([]);
    expect(findEscapingSymlinks(model, [model])).toHaveLength(1);
  });

  it("reports symlinks that already dangle on the host", () => {
    const model = makeDir("dangling-model");
    symlinkSync("./no-such-file", join(model, "broken.json"));
    const findings = findEscapingSymlinks(model, [model]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resolved).toBeNull();
  });

  it("scans nested subdirectories", () => {
    const other = makeDir("nested-other");
    writeFileSync(join(other, "shard.bin"), "x");
    const model = makeDir("nested-model");
    mkdirSync(join(model, "sub"));
    symlinkSync(join(other, "shard.bin"), join(model, "sub", "shard.bin"));
    expect(findEscapingSymlinks(model, [model])).toHaveLength(1);
  });

  it("yields no findings for a missing model path", () => {
    expect(findEscapingSymlinks(join(root, "does-not-exist"), [])).toEqual([]);
  });
});

describe("docker launch symlink preflight", () => {
  it("fails a docker vLLM launch with an actionable error naming the link", () => {
    const other = makeDir("launch-other");
    writeFileSync(join(other, "tokenizer.json"), "{}");
    const model = makeDir("launch-model");
    symlinkSync("../launch-other/tokenizer.json", join(model, "tokenizer.json"));
    let message = "";
    expect(() => {
      try {
        buildVllmCommand(dockerRecipe(model));
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
        throw error;
      }
    }).toThrow();
    expect(message).toContain("preflight");
    expect(message).toContain(join(model, "tokenizer.json"));
    expect(message).toContain("hardlink");
  });

  it("builds the docker command when all symlinks resolve inside the mount", () => {
    const model = makeDir("launch-clean");
    writeFileSync(join(model, "tokenizer.json"), "{}");
    symlinkSync("tokenizer.json", join(model, "tokenizer_config.json"));
    const cmd = buildVllmCommand(dockerRecipe(model));
    expect(cmd[0]).toBe("docker");
    expect(cmd).toContain(`${model}:${model}:ro`);
  });

  it("does not block launches whose model path does not exist on this host", () => {
    expect(() => assertDockerMountsCoverSymlinks(["/mnt/llm_models/NoSuchModel"])).not.toThrow();
  });
});
