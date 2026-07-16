import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Recipe } from "../../models/types";
import type { Config } from "../../../config/env";
import { resolveBinary } from "../../../core/command";
import {
  isInternalRecipeKey,
  isJsonStringArgumentKey,
} from "@local-studio/contracts/engine-args";
import { getEngineSpec } from "../engine-spec";
import { resolveRecipeGpuUuids } from "../../system/gpu-leases";
import { getExtraArgument } from "../argument-utilities";
import { assertDockerMountsCoverSymlinks } from "./docker-mount-preflight";

export { getExtraArgument };

export const normalizeJsonArgument = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonArgument(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [
        key.replace(/-/g, "_"),
        normalizeJsonArgument(entry),
      ]),
    );
  }
  return value;
};

export type ExtraArgumentSerializer = (flag: string, key: string, value: unknown) => string[];

export const appendSerializedArguments = (
  command: string[],
  extraArguments: Record<string, unknown>,
  serialize: ExtraArgumentSerializer,
): string[] => {
  for (const [key, value] of Object.entries(extraArguments)) {
    if (isInternalRecipeKey(key)) continue;
    const flag = `--${key.replace(/_/g, "-")}`;
    if (command.includes(flag)) continue;
    command.push(...serialize(flag, key, value));
  }
  return command;
};

const serializeExtraArgument: ExtraArgumentSerializer = (flag, key, value) => {
  if (value === true) return [flag];
  if (value === false) {
    return key.replace(/-/g, "_").toLowerCase() === "enable_expert_parallelism" ? [] : [flag];
  }
  if (value === undefined || value === null) return [];
  if (typeof value === "string" && isJsonStringArgumentKey(key)) {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return [flag, JSON.stringify(normalizeJsonArgument(JSON.parse(trimmed) as unknown))];
      } catch {
        return [flag, value];
      }
    }
  }
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return [flag, JSON.stringify(normalizeJsonArgument(value))];
  }
  return [flag, String(value)];
};

export const getPythonPath = (recipe: Recipe): string | undefined => {
  if (recipe.python_path && existsSync(recipe.python_path)) {
    return recipe.python_path;
  }
  const venvPath = getExtraArgument(recipe.extra_args, "venv_path");
  if (typeof venvPath === "string") {
    const pythonBin = join(venvPath, "bin", "python");
    if (existsSync(pythonBin)) {
      return pythonBin;
    }
  }
  return undefined;
};
export const appendExtraArguments = (
  command: string[],
  extraArguments: Record<string, unknown>,
): string[] => appendSerializedArguments(command, extraArguments, serializeExtraArgument);

const normalizeLaunchCommand = (command: string): string => {
  return command
    .replace(/\\\s*\n\s*\+?\s*/g, " ")
    .replace(/^\s*\+\s*/gm, "")
    .trim();
};
const splitLaunchCommand = (command: string): string[] => {
  const normalized = normalizeLaunchCommand(command);
  const result: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;
  for (const character of normalized) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (escaping) {
    current += "\\";
  }
  if (current) {
    result.push(current);
  }
  return result;
};
const getLaunchCommandOverride = (recipe: Recipe): string[] | null => {
  const override =
    getExtraArgument(recipe.extra_args, "launch_command") ??
    getExtraArgument(recipe.extra_args, "custom_command");
  if (typeof override !== "string" || !override.trim()) {
    return null;
  }
  // A recipe launch_command/custom_command is arbitrary-binary execution as the
  // controller user. Honour it only when the operator has opted in; otherwise
  // ignore the override and build the command from the structured recipe fields.
  if (process.env["LOCAL_STUDIO_ALLOW_CUSTOM_LAUNCH_COMMAND"] !== "true") {
    return null;
  }
  const command = splitLaunchCommand(override);
  return command.length > 0 ? command : null;
};

const executableBaseName = (value: string): string =>
  value.split(/[\\/]/).filter(Boolean).at(-1)?.toLowerCase() ?? value.toLowerCase();

const rejectPathTraversal = (value: string, label: string): void => {
  if (value.split(/[\\/]+/).includes("..")) {
    throw new Error(`Invalid ${label}: path traversal is not allowed`);
  }
};

const resolveDs4Binary = (recipe: Recipe): string => {
  const configured =
    getExtraArgument(recipe.extra_args, "ds4_bin") ??
    getExtraArgument(recipe.extra_args, "ds4-bin") ??
    recipe.runtime.ref;
  const candidate = typeof configured === "string" && configured.trim() ? configured.trim() : "ds4-server";
  rejectPathTraversal(candidate, "ds4_bin");
  const name = executableBaseName(candidate);
  if (name !== "ds4-server" && name !== "ds4-server.exe") {
    throw new Error("Invalid ds4_bin: only ds4-server executables are allowed");
  }
  return resolveBinary(candidate) ?? candidate;
};

export const buildDs4Command = (recipe: Recipe): string[] => {
  const command = [resolveDs4Binary(recipe)];
  const backendMode =
    getExtraArgument(recipe.extra_args, "ds4_backend") ??
    getExtraArgument(recipe.extra_args, "backend_mode") ??
    "cuda";
  if (typeof backendMode === "string" && ["cuda", "cpu", "metal"].includes(backendMode)) {
    command.push(`--${backendMode}`);
  }
  command.push("--model", recipe.model_path, "--host", recipe.host, "--port", String(recipe.port));
  if (recipe.served_model_name) command.push("--served-model-name", recipe.served_model_name);
  const tokenLimit =
    getExtraArgument(recipe.extra_args, "tokens") ??
    getExtraArgument(recipe.extra_args, "max_tokens") ??
    getExtraArgument(recipe.extra_args, "max_output_tokens");
  if (tokenLimit !== undefined && tokenLimit !== null && tokenLimit !== "") {
    command.push("--tokens", String(tokenLimit));
  }
  return appendExtraArguments(command, recipe.extra_args);
};

export const buildExllamav3Command = (recipe: Recipe, config: Config): string[] => {
  const configured =
    getExtraArgument(recipe.extra_args, "exllama_command") ??
    getExtraArgument(recipe.extra_args, "exllamav3_command") ??
    config.exllamav3_command ??
    recipe.runtime.ref;
  if (typeof configured !== "string" || !configured.trim()) {
    throw new Error(
      "Missing ExLLaMA v3 command. Set extra_args.exllama_command or LOCAL_STUDIO_EXLLAMAV3_COMMAND.",
    );
  }
  const command = splitLaunchCommand(configured);
  const executable = command[0];
  if (!executable) throw new Error("Invalid exllama_command: command is empty");
  rejectPathTraversal(executable, "exllama_command");
  if (!executableBaseName(executable).includes("exllama")) {
    throw new Error("Invalid exllama_command: only ExLLaMA executables are allowed");
  }
  command[0] = resolveBinary(executable) ?? executable;
  if (!command.includes("--host")) command.push("--host", recipe.host);
  if (!command.includes("--port")) command.push("--port", String(recipe.port));
  if (
    !command.includes("--model") &&
    !command.includes("--model-path") &&
    !command.includes("-m")
  ) {
    command.push("--model", recipe.model_path);
  }
  return appendExtraArguments(command, recipe.extra_args);
};


/**
 * Env keys that must NOT be forwarded into the container; the image's own baked
 * value (sometimes intentionally empty) is required.
 *
 * NOTE: `NCCL_GRAPH_FILE` is deliberately NOT skipped. The voipmonitor "noxml"
 * NCCL build treats an empty `NCCL_GRAPH_FILE` as a fatal error, so recipes set
 * it to `/dev/null` and that override must reach the container.
 */
const DOCKER_ENV_SKIP_KEYS = new Set([
  "CUDA_VISIBLE_DEVICES",
  "NCCL_GRAPH_DUMP_FILE",
  "VLLM_B12X_MLA_EXTEND_MAX_CHUNKS",
]);

export const getDockerVllmBin = (recipe: Recipe): string => {
  const value = getExtraArgument(recipe.extra_args, "docker_vllm_bin");
  return typeof value === "string" && value.trim() ? value.trim() : "/opt/venv/bin/vllm";
};

export const getDockerEntrypoint = (recipe: Recipe): string | undefined => {
  const value = getExtraArgument(recipe.extra_args, "docker_entrypoint");
  return typeof value === "string" ? value : undefined;
};

const getSpeculativeDraftModelPath = (recipe: Recipe): string | null => {
  const raw = getExtraArgument(recipe.extra_args, "speculative_config");
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const model = (parsed as Record<string, unknown>)["model"];
  return typeof model === "string" && model.startsWith("/") ? model : null;
};

export const sanitizeDockerName = (value: string): string => {
  const cleaned = value.replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/^[^a-zA-Z0-9]+/, "");
  return cleaned.length > 0 ? cleaned : "recipe";
};

const buildDockerEnvironmentFlags = (recipe: Recipe): string[] => {
  const flags: string[] = [];
  const seen = new Set<string>();
  const addEnvironment = (source: unknown): void => {
    if (!source || typeof source !== "object") {
      return;
    }
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      if (seen.has(key) || DOCKER_ENV_SKIP_KEYS.has(key)) continue;
      seen.add(key);
      flags.push("-e", `${key}=${String(value)}`);
    }
  };
  addEnvironment(recipe.env_vars);
  addEnvironment(getExtraArgument(recipe.extra_args, "env_vars"));
  return flags;
};

export const buildDockerGpuFlags = (recipe: Recipe): string[] => {
  const resolution = resolveRecipeGpuUuids(recipe, []);
  const selector = resolution.selector?.trim() || "";
  if (resolution.source === "recipe" && !selector) return [];
  const request = selector.includes(",") ? `"device=${selector}"` : `device=${selector}`;
  return selector
    ? ["--gpus", request, "-e", `CUDA_VISIBLE_DEVICES=${selector}`]
    : ["--gpus", "all"];
};

export interface DockerRunOptions {
  recipe: Recipe;
  image: string;
  /** The command to run inside the container, after the image reference. */
  inner: string[];
  /** Overrides the derived `local-studio-{recipe.id}` container name — needed
   * whenever more than one container can exist for the same recipe (e.g. an
   * environment, which is keyed by its own id, not the recipe's). */
  containerName?: string;
  /** Extra `-e KEY=VALUE` pairs to set unconditionally (e.g. engine cache dirs). */
  extraEnv?: Record<string, string>;
  /** Extra `-v` volume mounts beyond the model path, each as `source:target[:mode]`. */
  extraVolumes?: string[];
  /** Optional Docker entrypoint override, including an intentionally empty entrypoint. */
  entrypoint?: string;
}

/**
 * Shared `docker run` invocation shape for every engine's Docker-backed launch
 * path: foreground container (so the process-manager stop path's SIGTERM/
 * `--rm` teardown applies unchanged), host networking so the engine binds the
 * recipe's port directly, and the model path bind-mounted read-only.
 */
export const buildDockerRunArguments = ({
  recipe,
  image,
  inner,
  containerName,
  extraEnv: extraEnvironment = {},
  extraVolumes = [],
  entrypoint,
}: DockerRunOptions): string[] => {
  const name = containerName ?? `local-studio-${sanitizeDockerName(recipe.id)}`;
  const model = recipe.model_path;
  const flags = [
    "docker",
    "run",
    "--rm",
    "--name",
    name,
    ...buildDockerGpuFlags(recipe),
    "--network",
    "host",
    "--ipc",
    "host",
    "--shm-size",
    "32g",
    "--ulimit",
    "memlock=-1",
    "--ulimit",
    "stack=67108864",
  ];
  if (entrypoint !== undefined) flags.push("--entrypoint", entrypoint);
  flags.push(...buildDockerEnvironmentFlags(recipe));
  for (const [key, value] of Object.entries(extraEnvironment)) {
    flags.push("-e", `${key}=${value}`);
  }
  const draftModel = getSpeculativeDraftModelPath(recipe);
  const mountRoots = draftModel && draftModel !== model ? [model, draftModel] : [model];
  assertDockerMountsCoverSymlinks(mountRoots);
  for (const root of mountRoots) {
    flags.push("-v", `${root}:${root}:ro`);
  }
  for (const volume of extraVolumes) {
    flags.push("-v", volume);
  }
  flags.push(image);
  flags.push(...inner);
  return flags;
};

export const buildBackendCommand = (
  recipe: Recipe,
  config: Config,
  managedGpuSelection = false,
): string[] => {
  const launchCommand = getLaunchCommandOverride(recipe);
  if (launchCommand) {
    if (managedGpuSelection) {
      throw new Error("Custom launch commands cannot use managed GPU selection");
    }
    return launchCommand;
  }
  if (recipe.backend === "ds4") return buildDs4Command(recipe);
  if (recipe.backend === "exllamav3") return buildExllamav3Command(recipe, config);
  return getEngineSpec(recipe.backend).buildCommand(recipe, config);
};
